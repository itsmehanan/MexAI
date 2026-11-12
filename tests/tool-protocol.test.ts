import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_DEFINITIONS, validateToolCall, offeredTools, geminiToolDeclarations, openRouterToolDeclarations, runToolLoop } from '../server/tool-protocol';

const folders = ['C:\\Allowed', 'C:\\Other'];
const read = (id: string) => ({ id, name: 'read_file', arguments: { folder: folders[0], path: 'file.txt' } });

test('definitions are offered only for configured folders and verified provider capabilities', () => {
  assert.deepEqual(TOOL_DEFINITIONS.map(tool => [tool.name, tool.risk]), [
    ['browser_open','approval'], ['browser_read_page','safe'], ['browser_click','approval'], ['browser_type','approval'], ['browser_screenshot','safe'], ['browser_close','safe'], ['fetch_webpage','safe'], ['web_search','safe'], ['copy_file','approval'], ['create_folder','approval'], ['rename_folder', 'approval'], ['view_image', 'safe'], ['read_file', 'safe'], ['list_folder', 'safe'], ['search_files', 'safe'],
    ['write_file', 'approval'], ['move_file', 'approval'], ['delete_file', 'approval'],
  ]);
  assert.equal(offeredTools('gemini', []).length, 8);
  assert.equal(offeredTools('openrouter', folders, false).length, 0);
  assert.equal(offeredTools('openrouter', folders, true).length, 18);
  assert.equal(offeredTools('openai', folders, true).length, 0);
  assert.equal(geminiToolDeclarations(TOOL_DEFINITIONS)[0].parametersJsonSchema.type, 'object');
  assert.equal(openRouterToolDeclarations(TOOL_DEFINITIONS)[0].function.name, 'browser_open');
});

test('tool arguments reject traversal, absolute and unapproved folders', () => {
  assert.deepEqual(validateToolCall('read_file', read('1').arguments, folders), read('1').arguments);
  for (const path of ['../secret', 'a/../secret', '/etc/passwd', 'C:\\secret', '\\\\server\\share', 'file:stream', 'a\\..\\secret', '', '\0']) {
    assert.throws(() => validateToolCall('read_file', { folder: folders[0], path }, folders));
  }
  assert.throws(() => validateToolCall('read_file', { folder: 'C:\\NotAllowed', path: 'a' }, folders));
  assert.throws(() => validateToolCall('read_file', { folder: folders[0], path: 'a', extra: 'b' }, folders));
  assert.throws(() => validateToolCall('write_file', { folder: folders[0], path: 'a', content: 'x'.repeat(262145) }, folders));
  assert.throws(() => validateToolCall('move_file', { source_folder: folders[0], source_path: 'a', destination_folder: 'C:\\not-allowed', destination_path: 'b' }, folders));
});

test('multiple calls produce cards and results in order without retrying actions', async () => {
  const cards: string[] = []; let round = 0, executions = 0;
  const result = await runToolLoop({ provider: 'gemini', allowedFolders: folders, signal: new AbortController().signal,
    next: async (history, offered) => { assert.equal(offered.length, 12); if (round++ === 0) return { calls: [read('1'), read('2')] }; assert.equal(history.length, 3); return { text: 'Done.' }; },
    execute: async call => { executions++; return call.id === '1' ? { status: 'completed', result: 'ok' } : { status: 'denied', error: 'Denied.' }; },
    onCard: card => cards.push(`${card.id}:${card.status}`),
  });
  assert.equal(result.text, 'Done.'); assert.equal(executions, 2);
  assert.deepEqual(cards, ['1:running', '1:completed', '2:running', '2:denied']);
});

test('calls are capped at 60 and tools are removed on the final turn', async () => {
  let calls = 0; let finalHadTools = true;
  const result = await runToolLoop({ provider: 'gemini', allowedFolders: folders, signal: new AbortController().signal,
    next: async (_history, offered) => { if (calls === 60) { finalHadTools = !!offered.length; return { text: 'Stopped.' }; } return { calls: [read(String(calls))] }; },
    execute: async () => { calls++; return { status: 'completed' }; }, onCard() {},
  });
  assert.equal(calls, 60); assert.equal(finalHadTools, false); assert.equal(result.limitReached, true);
});

test('unoffered, duplicate and cancelled tool calls cannot run', async () => {
  let executions = 0;
  const base = { provider: 'gemini', allowedFolders: [] as string[], signal: new AbortController().signal, execute: async () => { executions++; return { status: 'completed' as const }; }, onCard() {} };
  let attempts=0; await runToolLoop({ ...base, next: async () => attempts++ ? ({text:'Done'}) : ({ calls: [read('1')] }) }); assert.equal(executions,0);
  await assert.rejects(runToolLoop({ ...base, allowedFolders: folders, next: async () => ({ calls: [read('same'), read('same')] }) }), /duplicate/);
  assert.equal(executions, 1);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(runToolLoop({ ...base, signal: abort.signal, next: async () => ({ text: 'no' }) }), /abort|cancel/i);
});


test('excess calls in a single model response are shown as failed without execution', async () => {
  const cards: any[] = []; let count = 0;
  const result = await runToolLoop({ provider:'gemini', allowedFolders:folders, signal:new AbortController().signal,
    next:async () => ({ calls:Array.from({length:62},(_,i)=>read(String(i))) }),
    execute:async () => { count++; return {status:'completed'}; }, onCard: card => cards.push(card),
  });
  assert.equal(count,60); assert.equal(result.limitReached,true);
  assert.equal(cards.filter(c=>c.status==='failed').length,2);
});

test('invalid model calls are recorded as failed without reaching the executor', async () => {
  let round = 0, executed = false; const rejected: string[] = [], cards: any[] = [];
  const output = await runToolLoop({ provider:'gemini', allowedFolders:folders, signal:new AbortController().signal,
    next:async () => round++ === 0 ? {calls:[{id:'bad',name:'read_file',arguments:{folder:folders[0],path:'../secret'}}]} : {text:'Cannot access that path.'},
    execute:async () => { executed=true; return {status:'completed'}; }, onCard:card=>cards.push(card), onRejected:async (_call, reason)=>{rejected.push(reason);},
  });
  assert.equal(executed,false); assert.equal(cards.at(-1).status,'failed'); assert.equal(rejected.length,1); assert.equal(output.text,'Cannot access that path.');
});

test('rename calls in one turn are approved as one batch and card results stay separate', async () => {
 const calls=['one','two'].map((name,i)=>({id:String(i),name:'rename_folder',arguments:{folder:folders[0],path:name,new_name:`snoopy ${i+1}`}}));
 let round=0,batches=0; const cards:any[]=[];
 const result=await runToolLoop({provider:'gemini',allowedFolders:folders,signal:new AbortController().signal,next:async()=>round++ ? {text:'Done'} : {calls},execute:async()=>{throw Error('not used');},executeBatch:async batch=>{batches++;assert.equal(batch.length,2);return batch.map(()=>({status:'completed'}));},onCard:c=>cards.push(c)});
 assert.equal(result.text,'Done');assert.equal(batches,1);assert.deepEqual(cards.map(c=>c.status),['running','running','completed','completed']);
});

test('image data never goes to cards and vision support controls tool offering', async () => {
 let round=0;const cards:any[]=[];
 await runToolLoop({provider:'openrouter',openRouterSupportsTools:true,supportsImages:true,allowedFolders:folders,signal:new AbortController().signal,next:async()=>round++ ? {text:'Done'} : {calls:[{id:'img',name:'view_image',arguments:{folder:folders[0],path:'a.png'}}]},execute:async()=>({status:'completed',result:{width:100,height:100},image:{mimeType:'image/png',data:'SENSITIVE_IMAGE'}}),onCard:c=>cards.push(c)});
 assert(!JSON.stringify(cards).includes('SENSITIVE_IMAGE'));
 round=0; await runToolLoop({provider:'openrouter',openRouterSupportsTools:true,supportsImages:false,allowedFolders:folders,signal:new AbortController().signal,next:async(_h,tools)=>{assert(!tools.some(t=>t.name==='view_image')); return {text:'Done'};},execute:async()=>{throw Error('unexpected');},onCard:()=>{}});
});

test('browser tools require desktop and screenshots require vision, with safe reads and gated actions', async()=>{
 let seen:string[]=[]; const run=async (supportsBrowser:boolean,supportsImages:boolean,readOnly=false)=>runToolLoop({provider:'gemini',allowedFolders:[],signal:new AbortController().signal,supportsBrowser,supportsImages,readOnly,next:async(_h,tools)=>{seen=tools.map(x=>x.name);return {text:'done'};},execute:async()=>({status:'completed'}),onCard:()=>{}});
 await run(false,true); assert(!seen.includes('browser_open'));
 await run(true,false); assert(seen.includes('browser_open')); assert(seen.includes('browser_read_page')); assert(!seen.includes('browser_screenshot'));
 await run(true,true,true); assert(seen.includes('browser_screenshot')); assert(!seen.includes('browser_click')); assert(!seen.includes('browser_type'));
});
