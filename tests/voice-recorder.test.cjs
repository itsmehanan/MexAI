const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  let stopped = 0, instance, failPermission = false;
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }] };
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(_stream, { mimeType }) { this.mimeType = mimeType; this.state = 'inactive'; instance = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop(); }
    data(blob) { this.ondataavailable({ data: blob }); }
  }
  const timers = new Map(); let nextTimer = 0;
  const context = { navigator: { mediaDevices: { getUserMedia: async () => { if (failPermission) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); return stream; } } }, MediaRecorder: Recorder, Blob, AbortController, setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/voice-recorder.js'), 'utf8'), context);
  return { create: context.MexVoice.createVoiceRecorder, getRecorder: () => instance, stopped: () => stopped, deny: () => { failPermission = true; }, timers };
}

test('records, stops microphone tracks and transcribes in memory', async () => {
  const env = setup(), states = [], results = [], errors = [];
  const voice = env.create({ onState: s => states.push(s), onError: e => errors.push(e), onResult: r => results.push(r), transcribe: async blob => { assert.equal(await blob.text(), 'hello audio'); assert.equal(blob.type, 'audio/webm;codecs=opus'); return ' hello '; } });
  await voice.start(); assert.equal(voice.getState(), 'recording');
  env.getRecorder().data(new Blob(['hello audio'])); voice.stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(states, ['requesting', 'recording', 'transcribing', 'idle']);
  assert.deepEqual(results, ['hello']); assert.equal(env.stopped(), 1); assert.deepEqual(errors, []); assert.equal(env.timers.size, 0);
});

test('denied permission, empty recordings and oversize audio fail without transcription', async () => {
  const env = setup(), errors = []; let calls = 0;
  const voice = env.create({ onState() {}, onError: e => errors.push(e), onResult() {}, transcribe: async () => { calls++; } });
  env.deny(); await voice.start(); assert.match(errors.pop(), /permission was denied/i);
  const env2 = setup();
  const voice2 = env2.create({ onState() {}, onError: e => errors.push(e), onResult() {}, transcribe: async () => { calls++; } });
  await voice2.start(); voice2.stop(); assert.match(errors.pop(), /no audio/i);
  await voice2.start(); env2.getRecorder().data(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)])); assert.match(errors.pop(), /4 MB/);
  assert.equal(calls, 0); assert.equal(env2.stopped(), 2);
});

test('disposing during permission request releases the eventual stream', async () => {
  const env = setup(); let results = 0;
  const voice = env.create({ onState() {}, onError() {}, onResult() { results++; }, transcribe: async () => 'text' });
  const starting = voice.start(); voice.dispose(); await starting;
  assert.equal(env.stopped(), 1); assert.equal(results, 0); assert.equal(voice.getState(), 'idle');
});
