import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runToolModel } from '../server/model-tools';

test('Gemini calls read tools and receives results before final response', async () => {
  const original = global.fetch; let requestCount = 0; const payloads: any[] = [], cards: any[] = [];
  global.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body))); requestCount++;
    const parts = requestCount === 1 ? [{functionCall:{name:'read_file',args:{folder:'C:\\Allowed',path:'hello.txt'}}}] : [{text:'The file says hello.'}];
    return new Response(JSON.stringify({candidates:[{content:{role:'model',parts},finishReason:'STOP'}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    const output = await runToolModel({provider:'gemini',model:'gemini-test',key:'secret-key',messages:[{role:'user',content:'Read the file'}],system:'Be useful.',folders:['C:\\Allowed'],signal:new AbortController().signal,onCard:card=>cards.push(card),execute:async()=>({status:'completed',result:{content:'hello'}})});
    assert.equal(output,'The file says hello.'); assert.equal(requestCount,2); assert.equal(cards[0].status,'running'); assert.equal(cards[1].status,'completed');
    assert.equal(payloads[0].tools[0].functionDeclarations.length,12);
    assert(payloads[1].contents.some((item:any)=>item.parts?.some((part:any)=>part.functionResponse?.name === 'read_file')));
  } finally { global.fetch = original; }
});

test('OpenRouter tool calls use structured messages and return results', async () => {
  const original = global.fetch; let requestCount = 0; const payloads: any[] = [];
  global.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body))); requestCount++;
    const message = requestCount === 1 ? {role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'list_folder',arguments:JSON.stringify({folder:'C:\\Allowed',path:'.'})}}]} : {role:'assistant',content:'One file.'};
    return new Response(JSON.stringify({choices:[{message}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    const output = await runToolModel({provider:'openrouter',model:'model:free',key:'key',messages:[{role:'user',content:'List files'}],system:'Be useful.',folders:['C:\\Allowed'],signal:new AbortController().signal,onCard:()=>{},execute:async()=>({status:'completed',result:{entries:['x']}})});
    assert.equal(output,'One file.'); assert.equal(payloads[0].tools.length,12); assert(payloads[1].messages.some((m:any)=>m.role==='tool'&&m.tool_call_id==='call-1'));
  } finally { global.fetch = original; }
});

test('Gemini receives the view_image result as image data, not in the visible card', async () => {
  const original=global.fetch; let count=0; const payloads:any[]=[], cards:any[]=[];
  global.fetch=async (_url, init)=>{ payloads.push(JSON.parse(String(init?.body))); count++; const parts=count===1 ? [{functionCall:{name:'view_image',args:{folder:'C:\\Allowed',path:'one/a.png'}}}] : [{text:'A drawing.'}]; return new Response(JSON.stringify({candidates:[{content:{role:'model',parts},finishReason:'STOP'}]}),{status:200,headers:{'Content-Type':'application/json'}}); };
  try {
    const result=await runToolModel({provider:'gemini',model:'gemini-test',key:'secret',messages:[{role:'user',content:'Look'}],system:'help',folders:['C:\\Allowed'],signal:new AbortController().signal,onCard:c=>cards.push(c),execute:async()=>({status:'completed',result:{width:768,height:384},image:{mimeType:'image/png',data:'imagebytes'}})});
    assert.equal(result,'A drawing.'); assert(payloads[1].contents.some((c:any)=>c.parts.some((p:any)=>p.inlineData?.data==='imagebytes'))); assert(!JSON.stringify(cards).includes('imagebytes'));
  } finally {global.fetch=original;}
});

test('OpenRouter tool results precede image content for parallel image calls', async () => {
 const original=global.fetch; let count=0; const payloads:any[]=[];
 global.fetch=async(_url,init)=>{payloads.push(JSON.parse(String(init?.body))); count++; const message=count===1 ? {role:'assistant',content:null,tool_calls:['one','two'].map(id=>({id,type:'function',function:{name:'view_image',arguments:JSON.stringify({folder:'C:\\Allowed',path:`${id}.png`})}}))} : {role:'assistant',content:'Two pictures.'}; return new Response(JSON.stringify({choices:[{message}]}),{status:200,headers:{'Content-Type':'application/json'}});};
 try {
  const output=await runToolModel({provider:'openrouter',model:'x',key:'key',messages:[{role:'user',content:'Look'}],system:'help',folders:['C:\\Allowed'],signal:new AbortController().signal,onCard:()=>{},execute:async()=>({status:'completed',result:{width:2,height:2},image:{mimeType:'image/png',data:'abc'}})});
  assert.equal(output,'Two pictures.'); const msgs=payloads[1].messages; assert.deepEqual(msgs.slice(-3).map((m:any)=>m.role),['tool','tool','user']); assert.equal(msgs.at(-1).content[1].image_url.url,'data:image/png;base64,abc');
 } finally {global.fetch=original;}
});
