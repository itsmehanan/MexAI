const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('island command, draft protection, feedback and microphone fallback', () => {
  const elements = {};
  function element(id) {
    return elements[id] ||= { id, value: '', textContent: '', title: '', className: '', style: {}, dataset: {}, classList: { toggle() {}, remove() {} }, setAttribute() {}, listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, blur() { document.activeElement = null; }, focus() { document.activeElement = this; }, setPointerCapture() {} };
  }
  const document = { activeElement: null, getElementById: element, querySelector: selector => element(selector === '.faces' ? 'faces' : 'working-label') };
  const calls = []; let onState, onChat, onAgent, onVoiceSetting, onApproval, voiceOptions, nextTimer = 0; const timers = new Map();
  const window = { addEventListener() {}, MexVoice: { createVoiceRecorder(options) { voiceOptions = options; return { getState: () => 'idle', start: async () => options.onError('Microphone recording is not available.'), stop() {}, dispose() {} }; } }, island: {
    onState(cb) { onState = cb; }, onChat(cb) { onChat = cb; }, onAgent(cb) { onAgent = cb; }, onVoiceSetting(cb) { onVoiceSetting = cb; }, onApproval(cb) { onApproval = cb; }, onBrowserState() {}, onHidden() {},
    expand() { calls.push(['expand']); }, collapse() { calls.push(['collapse']); }, selectAgent(a) { calls.push(['agent', a]); },
    command(value) { calls.push(['command', value]); }, open() { calls.push(['open']); }, dragStart() { calls.push(['dragStart']); }, dragMove() {}, dragEnd() {}, decision(choice, id) { calls.push(['decision', choice, id]); }, restartUpdate() {},
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/island.js'), 'utf8'), { document, window, Math, Date, setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  const runTimers = () => { const list = [...timers.values()]; timers.clear(); list.forEach(fn => fn()); };
  const root = element('island'), input = element('command-input'), select = element('agent-select');
  onState('resting'); assert.equal(element('faces').dataset.expression, 'sleeping'); root.listeners.mouseenter(); assert.equal(calls.at(-1)[0], 'expand');
  onState('command'); assert.equal(element('faces').dataset.expression, 'happy'); select.value = 'shumex'; select.listeners.change(); assert.deepEqual(calls.at(-1), ['agent', 'shumex']);
  input.value = 'A draft'; root.listeners.mouseleave(); runTimers(); assert.notEqual(calls.at(-1)[0], 'collapse');
  element('command-form').listeners.submit({ preventDefault() {} });
  const request = calls.at(-1)[1]; assert.equal(request.text, 'A draft'); assert.equal(request.agent, 'shumex');
  onChat({ phase: 'working', agent: 'shumex', id: request.id }); assert.equal(input.value, '');
  onState('working'); assert.equal(element('faces').dataset.expression, 'working'); onChat({ phase: 'result', agent: 'shumex', text: 'Finished!\nDone.', id: request.id }); onState('result');
  assert.equal(element('result-label').textContent, 'Shumex replied'); assert.equal(element('result-preview').textContent, 'Finished! Done.');
  runTimers(); assert.equal(calls.at(-1)[0], 'collapse');
  onAgent('hanex'); assert.equal(select.value, 'hanex');
  onState('listening'); assert.equal(element('faces').dataset.expression, 'listening');
  onState('approval'); assert.equal(element('faces').dataset.expression, 'thinking');
  onApproval({id:'approval-1',name:'write_file',source:'C:/allowed/a.txt',overwrite:false,arguments:{folder:'C:/allowed',path:'a.txt',content:'exact contents'}});
  assert.match(element('approval-details').textContent, /exact contents/); element('always').listeners.click(); assert.deepEqual(calls.at(-1), ['decision','always','approval-1']);
  onState('command'); voiceOptions.onState('recording'); assert.equal(element('faces').dataset.expression, 'listening');
  voiceOptions.onState('transcribing'); assert.equal(element('faces').dataset.expression, 'thinking');
  voiceOptions.onState('idle'); assert.equal(element('faces').dataset.expression, 'happy');
  element('mic').listeners.click(); assert.match(element('result-preview').textContent, /not available/i);
  onVoiceSetting(false); voiceOptions.onResult('voice draft'); assert.equal(input.value, 'voice draft');
  onVoiceSetting(true); voiceOptions.onResult('send this');
  const voiceRequest = calls.at(-1)[1]; assert.equal(voiceRequest.text, 'send this'); assert.equal(voiceRequest.agent, 'hanex');
  onChat({ phase: 'working', agent: 'hanex', id: voiceRequest.id }); assert.equal(input.value, 'voice draft');
  voiceOptions.onResult('rejected voice');
  const rejectedRequest = calls.at(-1)[1]; onChat({ phase: 'rejected', agent: 'hanex', id: rejectedRequest.id, text: 'busy' });
  assert.equal(input.value, 'voice draft rejected voice');
  element('open-chat').listeners.click(); assert.equal(calls.at(-1)[0], 'open');
});
