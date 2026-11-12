const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

// One visible browser, with a private app-owned profile. The user opens it; model calls never launch it.
function createBrowserTools({ chromium, profile, logFile, approve, onState = () => {}, random = Math.random, pause = delay }) {
  let context, page, active, opening, enabled = false, generation = 0;
  const audit = async record => { await fs.mkdir(path.dirname(logFile), {recursive:true}); await fs.appendFile(logFile, JSON.stringify({time:new Date().toISOString(), ...record})+'\n', {mode:0o600}); };
  const state = () => onState(enabled);
  const safeUrl = raw => { const url = new URL(raw); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP(S) URLs without credentials are supported.'); return url; };
  const site = () => { try { return new URL(page.url()).origin; } catch { return 'No website'; } };
  async function openManual() {
    if (opening) return opening;
    if (enabled) throw new Error('Stop agent browser control before signing in.');
    if (context) { if (!page || page.isClosed()) page=context.pages().find(p=>!p.isClosed()) || await context.newPage(); await page.bringToFront(); return; }
    const startGeneration = generation;
    opening = (async () => {
      await fs.mkdir(profile,{recursive:true});
      context = await chromium.launchPersistentContext(profile,{channel: process.platform === 'win32' ? 'msedge' : 'chrome', headless:false, viewport:{width:1280,height:800}, acceptDownloads:false});
      if (generation !== startGeneration) { const opened=context; context=undefined; await opened.close(); throw new Error('Browser opening was stopped.'); }
      const openedContext=context;
      context.on('close', () => { if (context !== openedContext) return; context=undefined; page=undefined; enabled=false; active?.abort(); active=undefined; state(); });
      context.on('page', p => { if (context === openedContext) page=p; });
      page = context.pages().at(-1) || await context.newPage();
      await page.bringToFront();
      await audit({event:'manual_open'});
    })();
    try { await opening; } finally { opening=undefined; }
  }
  async function stop() { if (!context && !opening && !active && !enabled) return; generation++; enabled=false; active?.abort(); const old=context; context=undefined; page=undefined; if (old) await old.close().catch(()=>{}); active=undefined; state(); await audit({event:'stopped'}); }
  async function loginGuard() {
    // Never inspect login/password pages. User must complete login before asking the agent to continue.
    for (const frame of page.frames()) {
      const n = await frame.locator('input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"], input[name*="password" i], input[id*="password" i], input[name*="passwd" i], input[autocomplete="one-time-code"], input[name*="otp" i]').count();
      if (n) throw new Error('Login or password fields detected. Please finish signing in yourself before the agent continues.');
    }
  }
  async function enable() {
    if (!context || !page || page.isClosed()) throw new Error('Open the browser and finish signing in first.');
    if (active) throw new Error('Browser is busy.');
    const expectedContext=context, expectedPage=page, epoch=generation;
    await loginGuard(); await audit({event:'control_enabled'});
    if (generation!==epoch || context!==expectedContext || page!==expectedPage || page.isClosed()) throw new Error('Browser changed while enabling control.');
    enabled=true; state();
  }
  async function rejected(call) { await audit({event:'rejected',name:String(call?.name || '').slice(0,80),error:String(call?.reason || 'Invalid browser call').slice(0,300)}); }
  async function execute(call, signal) {
    const name=call?.name, args=call?.arguments;
    const id=crypto.randomUUID(); const ctrl=new AbortController();
    if (active) { await audit({id,event:'failed',name,error:'Another browser action is already in progress.'}); return {status:'failed',error:'Another browser action is already in progress.'}; }
    active=ctrl; state(); const epoch=generation;
    const abort=()=>{ ctrl.abort(); enabled=false; generation++; const old=context; context=undefined; page=undefined; if (old) void old.close().catch(()=>{}); }; signal?.addEventListener('abort',abort,{once:true}); if (signal?.aborted) ctrl.abort();
    let boundPage;
    const check=()=>{if (ctrl.signal.aborted || epoch!==generation) throw new Error('Browser control stopped.'); if (!context || !page || page.isClosed()) throw new Error('Open the separate browser using the Open browser button first.'); if (!enabled) throw new Error('Enable agent browser control after signing in.'); if (boundPage && page !== boundPage) throw new Error('Browser tab changed; an action may already have completed.');};
    let currentSite='', currentUrl='';
    try {
      const expected = {browser_open:['url'],browser_read_page:[],browser_click:['selector'],browser_type:['selector','text'],browser_screenshot:[],browser_close:[]}[name];
      if (!expected || !args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).length!==expected.length || expected.some(k=>typeof args[k]!=='string' || args[k].includes('\0') || args[k].length > (k==='text'?4096:2048))) throw new Error('Invalid browser tool arguments.');
      check(); boundPage=page; currentSite=site(); currentUrl=page.url();
      await audit({id,event:'requested',name,site:currentSite,selector:args.selector, url:args.url ? safeUrl(args.url).origin + safeUrl(args.url).pathname : undefined, textLength:args.text?.length});
      if (name==='browser_close') { await stop(); return {status:'completed',result:{message:'Browser closed.'}}; }
      await loginGuard(); check();
      await pause(350 + Math.floor(random()*451),undefined,{signal:ctrl.signal}); check();
      if (name==='browser_read_page') {
        const {content, elements}=await page.locator('body').evaluate(body => {
          const walker=document.createTreeWalker(body, NodeFilter.SHOW_TEXT); const text=[]; let node, count=0;
          while ((node=walker.nextNode()) && count++ < 20000) { const el=node.parentElement; if (!el || el.closest('script,style,noscript,svg,iframe,input,textarea,select,option,[contenteditable]')) continue; const style=getComputedStyle(el); if (style.display==='none' || style.visibility==='hidden' || !el.getClientRects().length) continue; text.push(node.textContent.trim().slice(0,100000)); }
          const content=text.filter(Boolean).join('\n');
          const selector = el => { const parts=[]; while (el && el.nodeType===1 && el.tagName!=='HTML') { let s=el.tagName.toLowerCase(); if (el.id) { parts.unshift('#'+CSS.escape(el.id)); break; } const siblings=el.parentElement ? [...el.parentElement.children].filter(x=>x.tagName===el.tagName) : []; if (siblings.length>1) s+=`:nth-of-type(${siblings.indexOf(el)+1})`; parts.unshift(s); el=el.parentElement; } return parts.join(' > '); };
          const elements=[...body.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter(el => { const r=el.getBoundingClientRect(), s=getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; }).slice(0,150).map(el=>({selector:selector(el),tag:el.tagName.toLowerCase(),label:(el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('name') || '').slice(0,200)}));
          return {content, elements};
        });
        check(); await loginGuard();
        await audit({id,event:'completed',name,site:currentSite});
        return {status:'completed',result:{site:currentSite,url:page.url().split('?')[0],text:content.slice(0,100000),elements,untrusted:true}};
      }
      if (name==='browser_screenshot') {
        const masks=[]; for (const frame of page.frames()) masks.push(frame.locator('input, textarea, select, [contenteditable]'));
        const image=await page.screenshot({type:'png',mask:masks,animations:'disabled',timeout:15000}); check(); await loginGuard();
        if (image.length>5*1024*1024) throw new Error('Screenshot is too large.');
        await audit({id,event:'completed',name,site:currentSite});
        return {status:'completed',result:{site:currentSite,message:'Screenshot captured; form fields masked.'},image:{mimeType:'image/png',data:image.toString('base64')}};
      }
      let target, description, info;
      if (name==='browser_open') { const url=safeUrl(args.url); description=`Navigate to ${url.href}`; }
      else {
        target = await page.locator(args.selector).elementHandle({timeout:10000}); if (!target) throw new Error('Element not found.');
        info=await target.evaluate(el=>({tag:el.tagName.toLowerCase(), type:el.getAttribute('type') || '', autocomplete:el.getAttribute('autocomplete') || '', name:el.getAttribute('name') || '', label:(el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || '').slice(0,250), associatedLabel:[...(el.labels || [])].map(x=>x.innerText).join(' ').slice(0,250), href:el.href || '', formAction:el.form?.action || '', formMethod:el.form?.method || ''}));
        if (name==='browser_type' && (!['input','textarea'].includes(info.tag) || (info.tag==='input' && !['text','search','email','url','tel',''].includes(info.type.toLowerCase())) || /password|passwd|secret|otp|one.time|verification|credential|credit.card|cc-|cvc|cvv/i.test(`${info.type} ${info.autocomplete} ${info.name} ${info.label} ${info.associatedLabel || ""}`))) throw new Error('The agent cannot type passwords, verification codes, payment credentials, or into this field.');
        description = name==='browser_click' ? `Click ${JSON.stringify(info.label || info.tag)} (selector: ${args.selector})${info.href ? `; link target: ${info.href}` : ''}${info.formAction ? `; form: ${(info.formMethod || 'get').toUpperCase()} ${info.formAction}` : ''}` : `Type ${JSON.stringify(args.text)} into ${JSON.stringify(info.label || info.name || info.tag)} (selector: ${args.selector})`;
      }
      const approvedSite=name==='browser_open' ? safeUrl(args.url).origin : currentSite;
      const decision=await approve({id,name,arguments:{site:approvedSite,action:description},source:approvedSite,overwrite:false,oneTime:true},ctrl.signal);
      await audit({id,event:'decision',name,site:approvedSite,decision,selector:args.selector,element:info?.label,textLength:args.text?.length});
      if (decision!=='approve') return {status:'denied',error:'User denied the browser action.'};
      check(); if (name!=='browser_open' && page.url()!==currentUrl) throw new Error('The browser page changed while awaiting approval.');
      await loginGuard(); check();
      if (target) {
        const now=await target.evaluate(el=>({tag:el.tagName.toLowerCase(), type:el.getAttribute('type') || '', autocomplete:el.getAttribute('autocomplete') || '', name:el.getAttribute('name') || '', label:(el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || '').slice(0,250), associatedLabel:[...(el.labels || [])].map(x=>x.innerText).join(' ').slice(0,250), href:el.href || '', formAction:el.form?.action || '', formMethod:el.form?.method || ''}));
        if (JSON.stringify(now)!==JSON.stringify(info)) throw new Error('The element changed while awaiting approval; request a new approval.');
      }
      check();
      if (name==='browser_open') await page.goto(args.url,{waitUntil:'domcontentloaded',timeout:30000});
      else if (name==='browser_click') await target.click({timeout:15000});
      else await target.fill(args.text,{timeout:15000});
      check(); await audit({id,event:'completed',name,site:approvedSite,selector:args.selector,element:info?.label,textLength:args.text?.length});
      return {status:'completed',result:{site:site(),message:description}};
    } catch (e) { const message=e?.message || 'Browser action failed.'; await audit({id,event:'failed',name,site:currentSite,error:message}); return {status:'failed',error:message}; }
    finally { signal?.removeEventListener('abort',abort); if (active===ctrl) active=undefined; state(); }
  }
  return {openManual, enable, execute, stop, rejected};
}
module.exports={createBrowserTools};
