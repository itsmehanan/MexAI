import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeTool, tools } from '../server/tools';

test('workspace tools validate and audit calls', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mexai-tools-'));
  const workspace = path.join(temp, 'workspace');
  const logFile = path.join(temp, 'activity.jsonl');
  await fs.mkdir(workspace);
  try {
    await fs.writeFile(path.join(workspace, 'hello.txt'), 'hello');
    await fs.writeFile(path.join(temp, 'secret.txt'), 'secret');
    const call = (name: string, input: unknown) => executeTool({ name, input, workspace, logFile });
    assert.deepEqual(tools.map(t => [t.name, t.risk]), [['read_file', 'safe'], ['list_folder', 'safe']]);
    assert.deepEqual(await call('read_file', { path: 'hello.txt' }), { ok: true, result: { path: 'hello.txt', content: 'hello' } });
    assert.equal((await call('list_folder', { path: '.' })).ok, true);
    assert.equal((await call('read_file', { path: '../secret.txt' })).ok, false);
    assert.equal((await call('read_file', { path: path.join(temp, 'secret.txt') })).ok, false);
    assert.equal((await call('read_file', { path: 'hello.txt', extra: true })).ok, false);
    assert.equal((await call('unknown', { path: '.' })).ok, false);
    if (process.platform !== 'win32') {
      await fs.symlink(path.join(temp, 'secret.txt'), path.join(workspace, 'escape'));
      assert.equal((await call('read_file', { path: 'escape' })).ok, false);
    }
    const records = (await fs.readFile(logFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(records.filter(r => r.event === 'requested').length, process.platform === 'win32' ? 6 : 7);
    assert.equal(records.filter(r => r.event === 'completed').length, 2);
    assert.equal(records.filter(r => r.event === 'failed').length, process.platform === 'win32' ? 4 : 5);
    assert(!JSON.stringify(records).includes('secret\"'));
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
