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
    assert.equal(payloads[0].tools[0].functionDeclarations.length,6);
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
    assert.equal(output,'One file.'); assert.equal(payloads[0].tools.length,6); assert(payloads[1].messages.some((m:any)=>m.role==='tool'&&m.tool_call_id==='call-1'));
  } finally { global.fetch = original; }
});
