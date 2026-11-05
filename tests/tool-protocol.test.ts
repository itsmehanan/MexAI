import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_DEFINITIONS, validateToolCall, offeredTools, geminiToolDeclarations, openRouterToolDeclarations, runToolLoop } from '../server/tool-protocol';

const folders = ['C:\\Allowed', 'C:\\Other'];
const read = (id: string) => ({ id, name: 'read_file', arguments: { folder: folders[0], path: 'file.txt' } });

test('definitions are offered only for configured folders and verified provider capabilities', () => {
  assert.deepEqual(TOOL_DEFINITIONS.map(tool => [tool.name, tool.risk]), [
    ['read_file', 'safe'], ['list_folder', 'safe'], ['search_files', 'safe'],
    ['write_file', 'approval'], ['move_file', 'approval'], ['delete_file', 'approval'],
  ]);
  assert.equal(offeredTools('gemini', []).length, 0);
  assert.equal(offeredTools('openrouter', folders, false).length, 0);
  assert.equal(offeredTools('openrouter', folders, true).length, 6);
  assert.equal(offeredTools('openai', folders, true).length, 0);
  assert.equal(geminiToolDeclarations(TOOL_DEFINITIONS)[0].parametersJsonSchema.type, 'object');
  assert.equal(openRouterToolDeclarations(TOOL_DEFINITIONS)[0].function.name, 'read_file');
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
    next: async (history, offered) => { assert.equal(offered.length, 6); if (round++ === 0) return { calls: [read('1'), read('2')] }; assert.equal(history.length, 3); return { text: 'Done.' }; },
    execute: async call => { executions++; return call.id === '1' ? { status: 'completed', result: 'ok' } : { status: 'denied', error: 'Denied.' }; },
    onCard: card => cards.push(`${card.id}:${card.status}`),
  });
  assert.equal(result.text, 'Done.'); assert.equal(executions, 2);
  assert.deepEqual(cards, ['1:running', '1:completed', '2:running', '2:denied']);
});

test('calls are capped at 15 and tools are removed on the final turn', async () => {
  let calls = 0; let finalHadTools = true;
  const result = await runToolLoop({ provider: 'gemini', allowedFolders: folders, signal: new AbortController().signal,
    next: async (_history, offered) => { if (calls === 15) { finalHadTools = !!offered.length; return { text: 'Stopped.' }; } return { calls: [read(String(calls))] }; },
    execute: async () => { calls++; return { status: 'completed' }; }, onCard() {},
  });
  assert.equal(calls, 15); assert.equal(finalHadTools, false); assert.equal(result.limitReached, true);
});

test('unoffered, duplicate and cancelled tool calls cannot run', async () => {
  let executions = 0;
  const base = { provider: 'gemini', allowedFolders: [] as string[], signal: new AbortController().signal, execute: async () => { executions++; return { status: 'completed' as const }; }, onCard() {} };
  await assert.rejects(runToolLoop({ ...base, next: async () => ({ calls: [read('1')] }) }), /not offered/);
  await assert.rejects(runToolLoop({ ...base, allowedFolders: folders, next: async () => ({ calls: [read('same'), read('same')] }) }), /duplicate/);
  assert.equal(executions, 1);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(runToolLoop({ ...base, signal: abort.signal, next: async () => ({ text: 'no' }) }), /cancelled/);
});
