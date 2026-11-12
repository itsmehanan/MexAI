import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateSavedKeys } from '../src/utils/key-migration';

test('legacy keys are removed only after successful migration', async () => {
  const original = JSON.stringify({ apiKey: 'legacy', providers: { gemini: { apiKey: 'specific', enabled: true }, openai: { apiKey: 'private' } }, soundEffects: false });
  let record = original;
  const storage = { getItem: () => record, setItem: (_key: string, value: string) => { record = value; } };
  const failing = { status: async () => ({}), migrate: async () => { throw new Error('unavailable'); } };
  await assert.rejects(migrateSavedKeys(storage, 'settings', failing));
  assert.equal(record, original);
  await assert.rejects(migrateSavedKeys(storage, 'settings'));
  assert.equal(record, original);
  let received: Record<string, string> = {};
  const vault = { status: async () => ({ gemini: true }), migrate: async (keys: Record<string, string>) => { received = keys; return { gemini: true, openai: true }; } };
  assert.deepEqual(await migrateSavedKeys(storage, 'settings', vault), { gemini: true, openai: true });
  assert.deepEqual(received, { gemini: 'specific', openai: 'private' });
  const cleaned = JSON.parse(record);
  assert.equal(cleaned.apiKey, '');
  assert.equal(cleaned.providers.gemini.apiKey, '');
  assert.equal(cleaned.providers.openai.apiKey, '');
  assert.equal(cleaned.soundEffects, false);
  assert.deepEqual(await migrateSavedKeys(storage, 'settings', vault), { gemini: true });
});
