import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarExpression } from '../src/components/avatar-expression';

test('avatar status maps to the requested expressions', () => {
  assert.equal(avatarExpression('online'), 'happy');
  assert.equal(avatarExpression('idle'), 'happy');
  assert.equal(avatarExpression('typing'), 'thinking');
  assert.equal(avatarExpression('working'), 'working');
  assert.equal(avatarExpression('speaking'), 'working');
  assert.equal(avatarExpression('listening'), 'listening');
  assert.equal(avatarExpression('sleeping'), 'sleeping');
});
