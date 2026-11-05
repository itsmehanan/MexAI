import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readFileConfined, listFolderConfined } from '../server/readonly-linux';

test('handle-based reads reject symlinks in files, folders and root ancestors', { skip: process.platform !== 'linux' }, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mexai-confined-'));
  const root = path.join(temp, 'allowed'); const outside = path.join(temp, 'outside');
  await fs.mkdir(root); await fs.mkdir(outside);
  try {
    await fs.writeFile(path.join(root, 'safe.txt'), 'safe');
    await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
    await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'));
    await fs.symlink(outside, path.join(root, 'linkdir'));
    await fs.symlink(root, path.join(temp, 'linkroot'));
    assert.equal(await readFileConfined(root, 'safe.txt'), 'safe');
    assert((await listFolderConfined(root, '.')).some(e => e.name === 'safe.txt'));
    await assert.rejects(readFileConfined(root, 'link.txt'));
    await assert.rejects(readFileConfined(root, 'linkdir/secret.txt'));
    await assert.rejects(listFolderConfined(root, 'linkdir'));
    await assert.rejects(readFileConfined(path.join(temp, 'linkroot'), 'safe.txt'));
    await assert.rejects(readFileConfined(root, '../outside/secret.txt'));
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('directory swaps cannot redirect an opened file to an outside symlink', { skip: process.platform !== 'linux' }, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mexai-race-'));
  const root = path.join(temp, 'allowed'); const outside = path.join(temp, 'outside');
  await fs.mkdir(root); await fs.mkdir(outside); await fs.mkdir(path.join(root, 'dir'));
  await fs.writeFile(path.join(root, 'dir', 'file'), 'safe'); await fs.writeFile(path.join(outside, 'file'), 'secret');
  try {
    const swapper = (async () => {
      for (let i = 0; i < 100; i++) {
        await fs.rename(path.join(root, 'dir'), path.join(root, 'held'));
        await fs.symlink(outside, path.join(root, 'dir'));
        await fs.unlink(path.join(root, 'dir'));
        await fs.rename(path.join(root, 'held'), path.join(root, 'dir'));
      }
    })();
    for (let i = 0; i < 400; i++) {
      try { assert.equal(await readFileConfined(root, 'dir/file'), 'safe'); }
      catch (error) { if (error instanceof assert.AssertionError) throw error; }
    }
    await swapper;
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
