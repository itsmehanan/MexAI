import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, readable, searchResults, download, executeWeb } from '../server/web-tools';

test('public address validation blocks local, mapped and private addresses', () => {
 for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','0.0.0.0']) assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);
});
test('blocks private endpoints and dangerous URLs before issuing requests',async()=>{
 for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'file:///etc/passwd', 'https://user:pass@example.com/', 'http://8.8.8.8:1234/']) await assert.rejects(download(url,new AbortController().signal));
});
test('extracts readable HTML and parses untrusted search results',()=>{
 assert.equal(readable('<html><body><script>ignore</script><h1>Heading</h1><p>Hello &amp; welcome</p></body></html>','text/html'),'Heading\nHello & welcome');
 const results=searchResults('<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Example</a><div class="result__snippet">Snippet</div></div>'); assert.equal(results[0].url,'https://example.com/a'); assert.equal(results[0].snippet,'Snippet');
});
test('web errors are surfaced as failed cards without exposing a successful result',async()=>{const result=await executeWeb({id:'a',name:'fetch_webpage',arguments:{url:'http://127.0.0.1/'}},new AbortController().signal); assert.equal(result.status,'failed'); assert.match(result.error!,/non-public/);});

test('downloads bound bytes, signals truncation, and rechecks redirects', async () => {
 const https = (await import('node:https')).default;
 const { PassThrough } = await import('node:stream'); const { EventEmitter } = await import('node:events');
 const original=https.request; let location=''; let allResult:any;
 (https as any).request=(_url:any, options:any, cb:any)=>{
  options.lookup('example', {all:true}, (_e:any, value:any)=>{allResult=value;});
  const req:any = new EventEmitter(); req.end=()=>queueMicrotask(()=>{ const res:any=new PassThrough(); res.statusCode=location ? 302 : 200; res.headers=location ? {location} : {'content-type':'text/plain'}; cb(res); if (!location) res.end(Buffer.alloc(210*1024, 65)); else res.end(); }); return req;
 };
 try { const page=await download('https://8.8.8.8/',new AbortController().signal); assert.equal(page.content.length,200*1024); assert.equal(page.truncated,true); assert.equal(allResult[0].address,'8.8.8.8'); location='http://127.0.0.1/'; await assert.rejects(download('https://8.8.8.8/',new AbortController().signal),/non-public/); }
 finally {(https as any).request=original;}
});
