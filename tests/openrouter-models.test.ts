import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOpenRouterModels } from '../src/data/models';
import { parseFreeModels } from '../server/openrouter';

test('live catalog only includes models with zero known pricing', () => {
  const models = parseFreeModels({ data: [
    { id: 'zero', name: 'Free', pricing: { prompt: '0', completion: '0', request: '0' }, supported_parameters: ['tools'] },
    { id: 'paid', pricing: { prompt: '0', completion: '0.1' } },
    { id: 'hidden-fee', pricing: { prompt: '0', completion: '0', request: '1' } },
    { id: 'missing', pricing: { prompt: '0' } },
    { id: 'unknown', pricing: { prompt: '', completion: '0' } },
    { id: 'zero', pricing: { prompt: '0', completion: '0' } },
  ] });
  assert.deepEqual(models.map(m => m.id), ['zero']);
  assert.equal(models[0].supportsTools, true);
  assert.equal(parseFreeModels({data: [{id: 'unknown', pricing: {prompt: '0', completion: '0'}}]})[0].supportsTools, false);
  assert.throws(() => parseFreeModels({ data: null }));
});

test('OpenRouter default and manually entered models remain selectable and unverified', () => {
  const live = [{ id: 'qwen/qwen3-coder:free', name: 'Qwen', provider: 'openrouter' as const, isFree: true }];
  assert.equal(getOpenRouterModels(undefined, live)[0].id, 'openrouter/free');
  const free = getOpenRouterModels(' qwen/qwen3-coder:free ', live);
  assert.equal(free[0].id, 'qwen/qwen3-coder:free');
  assert.equal(free.filter(m => m.id === 'qwen/qwen3-coder:free').length, 1);
  assert.equal(getOpenRouterModels('vendor/paid-model', live)[0].isFree, undefined);
  assert.equal(getOpenRouterModels('vendor/paid-model', live)[0].badge, 'Unverified');
  assert(getOpenRouterModels('new/model', live, 'old/model').some(m => m.id === 'old/model'));
});
