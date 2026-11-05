const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('island command, draft protection, feedback and microphone fallback', () => {
  const elements = {};
  function element(id) {
    return elements[id] ||= { id, value: '', textContent: '', title: '', className: '', listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, blur() { document.activeElement = null; }, focus() { document.activeElement = this; }, setPointerCapture() {} };
  }
  const document = { activeElement: null, getElementById: element, querySelector: () => element('working-label') };
  const calls = []; let onState, onChat, onAgent, nextTimer = 0; const timers = new Map();
  const window = { island: {
    onState(cb) { onState = cb; }, onChat(cb) { onChat = cb; }, onAgent(cb) { onAgent = cb; },
    expand() { calls.push(['expand']); }, collapse() { calls.push(['collapse']); }, selectAgent(a) { calls.push(['agent', a]); },
    command(value) { calls.push(['command', value]); }, open() { calls.push(['open']); }, dragStart() { calls.push(['dragStart']); }, dragMove() {}, dragEnd() {}, decision() {}, restartUpdate() {},
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/island.js'), 'utf8'), { document, window, Math, Date, setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  const runTimers = () => { const list = [...timers.values()]; timers.clear(); list.forEach(fn => fn()); };
  const root = element('island'), input = element('command-input'), select = element('agent-select');
  onState('resting'); root.listeners.mouseenter(); assert.equal(calls.at(-1)[0], 'expand');
  onState('command'); select.value = 'shumex'; select.listeners.change(); assert.deepEqual(calls.at(-1), ['agent', 'shumex']);
  input.value = 'A draft'; root.listeners.mouseleave(); runTimers(); assert.notEqual(calls.at(-1)[0], 'collapse');
  element('command-form').listeners.submit({ preventDefault() {} });
  const request = calls.at(-1)[1]; assert.equal(request.text, 'A draft'); assert.equal(request.agent, 'shumex');
  onChat({ phase: 'working', agent: 'shumex', id: request.id }); assert.equal(input.value, '');
  onState('working'); onChat({ phase: 'result', agent: 'shumex', text: 'Finished!\nDone.', id: request.id }); onState('result');
  assert.equal(element('result-label').textContent, 'Shumex replied'); assert.equal(element('result-preview').textContent, 'Finished! Done.');
  runTimers(); assert.equal(calls.at(-1)[0], 'collapse');
  onAgent('hanex'); assert.equal(select.value, 'hanex');
  element('mic').listeners.click(); assert.match(element('result-preview').textContent, /not supported/i);
  element('open-chat').listeners.click(); assert.equal(calls.at(-1)[0], 'open');
});
