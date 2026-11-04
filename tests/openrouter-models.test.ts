import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOpenRouterModels } from '../src/data/models';

test('OpenRouter default and manually entered models remain selectable', () => {
  assert.equal(getOpenRouterModels(undefined, true)[0].id, 'openrouter/free');
  assert.equal(getOpenRouterModels('', true)[0].id, 'openrouter/free');
  const free = getOpenRouterModels(' qwen/qwen3-coder:free ', true);
  assert.equal(free[0].id, 'qwen/qwen3-coder:free');
  assert.equal(free.filter(m => m.id === 'openrouter/free').length, 1);
  assert.equal(getOpenRouterModels('vendor/paid-model', true)[0].id, 'vendor/paid-model');
  assert.equal(getOpenRouterModels('vendor/paid-model', true)[0].isFree, undefined);
  assert(getOpenRouterModels('new/model', true, 'old/model').some(m => m.id === 'old/model'));
  assert.equal(getOpenRouterModels('openrouter/free', false, 'openrouter/free').filter(m => m.id === 'openrouter/free').length, 1);
});
