import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import * as cheerio from 'cheerio';
import type { ToolCall, ToolResult } from './tool-protocol';

const LIMIT = 200 * 1024;
export function publicAddress(address: string): boolean {
  try { const ip = ipaddr.process(address); return ip.range() === 'unicast'; } catch { return false; }
}
function urlFor(raw: string): URL {
  let url: URL; try { url = new URL(raw); } catch { throw new Error('Invalid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) throw new Error('Only public HTTP(S) URLs on standard ports are allowed.');
  return url;
}
/** Resolve each redirect separately and pin the approved DNS address to prevent rebinding. */
export async function download(raw: string, signal: AbortSignal): Promise<{url:string; content:string; type:string; truncated:boolean}> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  let url = urlFor(raw);
  for (let redirects = 0; redirects <= 5; redirects++) {
    deadline.throwIfAborted();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = ipaddr.isValid(host) ? [{address:host, family:ipaddr.parse(host).kind() === 'ipv4' ? 4 : 6}] : await new Promise<{address:string;family:number}[]>((resolve,reject) => { const abort = () => reject(deadline.reason); deadline.addEventListener('abort',abort,{once:true}); lookup(host,{all:true,verbatim:true}).then(resolve,reject).finally(() => deadline.removeEventListener('abort',abort)); }) as {address:string;family:number}[];
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('URL resolves to a non-public address.');
    const address = addresses[0];
    const response = await new Promise<{status:number; headers:http.IncomingHttpHeaders; body:Buffer; truncated?:boolean}>((resolve,reject) => {
      const req = (url.protocol === 'https:' ? https : http).request(url, { method:'GET', signal:deadline, headers:{'User-Agent':'MexAI/1.0', 'Accept':'text/html,text/plain;q=0.9', 'Accept-Encoding':'identity'}, lookup:((_hostname: any, _options: any, callback: any) => _options?.all ? callback(null, [address]) : callback(null, address.address, address.family)) as any }, res => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400) { res.resume(); resolve({status, headers:res.headers, body:Buffer.alloc(0)}); return; }
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.destroy(); reject(new Error('Compressed responses are not supported.')); return; }
        const chunks:Buffer[]=[]; let size=0;
        res.on('data', (chunk:Buffer) => { size += chunk.length; if (size > LIMIT) { chunks.push(chunk.subarray(0, chunk.length - (size - LIMIT))); res.destroy(); resolve({status, headers:res.headers, body:Buffer.concat(chunks), truncated:true}); } else chunks.push(chunk); });
        res.on('end', () => resolve({status, headers:res.headers, body:Buffer.concat(chunks)})); res.on('error',reject);
      }); req.on('error',reject); req.end();
    });
    if (response.status >= 300 && response.status < 400) { if (!response.headers.location || redirects === 5) throw new Error('Invalid or excessive redirects.'); url = urlFor(new URL(response.headers.location, url).href); continue; }
    if (response.status < 200 || response.status >= 300) throw new Error(`Web request failed with HTTP ${response.status}.`);
    const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!['text/html','text/plain','application/xhtml+xml'].includes(type)) throw new Error('Only HTML and plain-text pages are supported.');
    return {url:url.href, content:response.body.toString('utf8'), type, truncated:!!response.truncated};
  }
  throw new Error('Too many redirects.');
}
export function readable(content: string, type: string): string {
  if (type === 'text/plain') return content;
  const $ = cheerio.load(content); $('script,style,noscript,svg,iframe,template,nav,footer,header').remove();
  $('br,p,div,li,h1,h2,h3,h4,h5,h6,article,section,tr').append('\n');
  return $('body').text().replace(/[\t\r ]+/g,' ').replace(/\n\s*\n\s*\n/g,'\n\n').trim();
}
export function searchResults(html: string) {
  const $ = cheerio.load(html); const results: {title:string;url:string;snippet:string}[] = [];
  $('.result').each((_i, element) => { const el=$(element), link=el.find('.result__a').first(); let href=link.attr('href') || ''; try { const parsed=new URL(href,'https://duckduckgo.com'); href=parsed.searchParams.get('uddg') || parsed.href; const target=urlFor(href); if (!link.text().trim()) return; results.push({title:link.text().trim().slice(0,300), url:target.href, snippet:el.find('.result__snippet').text().trim().slice(0,1000)}); } catch { /* ignore invalid search result URLs */ } });
  return results.slice(0,10);
}
export async function executeWeb(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
  try {
    const args=call.arguments as Record<string,string>;
    if (call.name === 'fetch_webpage') { const page=await download(args.url,signal); const text=readable(page.content,page.type); const bytes=Buffer.from(text); return {status:'completed',result:{url:page.url, text:bytes.length > LIMIT ? bytes.subarray(0,LIMIT-3).toString('utf8') : text, truncated:page.truncated || bytes.length > LIMIT, untrusted:true}}; }
    if (call.name === 'web_search') { const page=await download(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`,signal); const results=searchResults(page.content); if (!results.length) throw new Error('Search returned no parseable results; the provider may be unavailable or blocking automated requests.'); return {status:'completed',result:{query:args.query,results,untrusted:true}}; }
    throw new Error('Unknown web tool.');
  } catch (error) { if (signal.aborted) throw signal.reason; return {status:'failed',error:error instanceof Error ? error.message : 'Web request failed.'}; }
}
