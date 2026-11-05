const root = document.getElementById('island');
const faces = document.querySelector('.faces');
const input = document.getElementById('command-input');
const select = document.getElementById('agent-select');
const preview = document.getElementById('result-preview');
const label = document.getElementById('result-label');
const mic = document.getElementById('mic');
let pointerStart, moved = false, state = 'resting', over = false, collapseTimer, pending, pendingText, pendingTimer, resultAgent, recording = false, voicePhase = 'idle', sendVoiceImmediately = false, pendingFromVoice = false, voiceAgent;
function updateExpression() {
  const expression = voicePhase === 'recording' || voicePhase === 'requesting' ? 'listening'
    : voicePhase === 'transcribing' ? 'thinking'
    : state === 'resting' ? 'sleeping' : state === 'listening' ? 'listening'
    : state === 'working' ? 'working' : state === 'approval' ? 'thinking' : 'happy';
  faces.dataset.expression = expression;
}
function scheduleCollapse() {
  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    if (!over && !input.value && !recording && !pending) { input.blur(); window.island.collapse(); }
  }, 3500);
}
window.island.onState(next => {
  if (['resting', 'listening', 'working', 'approval', 'update', 'command', 'result'].includes(next)) {
    state = next;
    root.className = `island ${next}`;
    updateExpression();
    if (next === 'result' && !over) scheduleCollapse();
  }
});
window.island.onVoiceSetting(enabled => { sendVoiceImmediately = enabled === true; });
window.island.onAgent(agent => { if (agent === 'hanex' || agent === 'shumex') select.value = agent; });
window.island.onChat(status => {
  if (!status || !['working', 'result', 'error', 'rejected'].includes(status.phase)) return;
  if (status.id && status.id === pending) {
    if (status.phase === 'working' && !pendingFromVoice && input.value.trim() === pendingText) { input.value = ''; input.blur(); }
    if ((status.phase === 'rejected' || status.phase === 'error') && pendingFromVoice) input.value = [input.value.trim(), pendingText].filter(Boolean).join(' ');
    if (status.phase === 'working' || status.phase === 'rejected' || status.phase === 'error') { clearTimeout(pendingTimer); pending = undefined; }
  }
  if (status.phase === 'working') {
    document.querySelector('.working-label span:last-child').textContent = `${status.agent === 'shumex' ? 'Shumex' : 'Hanex'} is preparing a response…`;
  } else {
    resultAgent = status.agent;
    label.textContent = status.phase === 'result' ? `${status.agent === 'shumex' ? 'Shumex' : 'Hanex'} replied` : 'Could not complete';
    preview.textContent = String(status.text || '').replace(/\s+/g, ' ').slice(0, 300);
    preview.title = status.text || '';
    if (!over) scheduleCollapse();
  }
});
root.addEventListener('mouseenter', () => {
  over = true; clearTimeout(collapseTimer);
  if (['resting', 'update', 'result'].includes(state)) window.island.expand();
});
root.addEventListener('mouseleave', () => { over = false; scheduleCollapse(); });
input.addEventListener('input', () => { clearTimeout(collapseTimer); if (!over) scheduleCollapse(); });
input.addEventListener('blur', () => { if (!over) scheduleCollapse(); });
select.addEventListener('change', () => window.island.selectAgent(select.value));
function sendCommand(text, agent, fromVoice = false) {
  if (!text || pending) return false;
  pending = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  pendingText = text; pendingFromVoice = fromVoice;
  pendingTimer = setTimeout(() => {
    if (pendingFromVoice) input.value = [input.value.trim(), pendingText].filter(Boolean).join(' ');
    pending = undefined; label.textContent = 'Chat did not respond'; preview.textContent = 'Open chat to check before retrying.';
  }, 10000);
  window.island.command({ agent, text, id: pending });
  return true;
}
document.getElementById('command-form').addEventListener('submit', event => {
  event.preventDefault();
  sendCommand(input.value.trim(), select.value);
});
document.getElementById('open-chat').addEventListener('click', () => window.island.open());
preview.addEventListener('click', () => { if (resultAgent) window.island.selectAgent(resultAgent); window.island.open(); });

// Tap to start and again to stop. Audio is transcribed by Gemini using the saved key.
const voice = window.MexVoice.createVoiceRecorder({
  transcribe: async (blob, signal) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (signal.aborted) throw new Error('Transcription cancelled.');
    return window.island.transcribe(bytes, blob.type);
  },
  onState: phase => {
    voicePhase = phase;
    recording = phase !== 'idle';
    updateExpression();
    mic.disabled = phase === 'requesting' || phase === 'transcribing';
    mic.classList.toggle('voice-listening', phase === 'recording');
    mic.textContent = phase === 'recording' ? '■' : '🎙';
    mic.setAttribute('aria-label', phase === 'recording' ? 'Stop recording' : 'Record voice command');
    if (phase !== 'idle') {
      label.textContent = phase === 'recording' ? 'Listening… tap the mic to stop' : phase === 'transcribing' ? 'Transcribing with Gemini…' : 'Requesting microphone…';
      preview.textContent = phase === 'recording' ? '●  ▂ ▅ ▇ ▄ ▆ ▂' : 'Audio is sent to Gemini.';
    }
    if (!recording && !over) scheduleCollapse();
  },
  onResult: text => {
    label.textContent = 'Voice command ready'; preview.textContent = 'Transcription complete.';
    if (!sendVoiceImmediately || !sendCommand(text, voiceAgent, true)) {
      input.value = [input.value.trim(), text].filter(Boolean).join(' ');
      input.focus();
      if (sendVoiceImmediately) preview.textContent = 'Another command is pending; transcript kept in the box.';
    }
  },
  onError: message => { label.textContent = 'Voice input failed'; preview.textContent = message; },
});
mic.title = 'Record a command; audio is sent to Gemini for transcription';
mic.addEventListener('click', () => {
  if (voice.getState() === 'recording') voice.stop();
  else if (voice.getState() === 'idle') { voiceAgent = select.value; void voice.start(); }
});
window.island.onHidden(() => { if (voice.getState() !== 'idle') { voice.dispose(); voicePhase = 'idle'; recording = false; updateExpression(); mic.disabled = false; mic.classList.remove('voice-listening'); mic.textContent = '🎙'; mic.setAttribute('aria-label', 'Record voice command'); label.textContent = 'Voice input stopped'; preview.textContent = 'Recording was stopped when the island was hidden.'; } });
window.addEventListener('beforeunload', () => voice.dispose());

root.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('button, input, select, .result-preview')) return;
  pointerStart = { x: event.screenX, y: event.screenY };
  moved = false;
  root.setPointerCapture(event.pointerId);
  window.island.dragStart();
});
root.addEventListener('pointermove', event => {
  if (!pointerStart) return;
  if (Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y) > 4) moved = true;
  if (moved) window.island.dragMove();
});
root.addEventListener('pointerup', () => {
  if (!pointerStart) return;
  window.island.dragEnd();
  if (!moved) window.island.open();
  pointerStart = undefined;
});
root.addEventListener('pointercancel', () => { if (pointerStart) window.island.dragEnd(); pointerStart = undefined; });
root.addEventListener('keydown', event => { if (event.target === root && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); window.island.open(); } });
document.getElementById('approve').addEventListener('click', () => window.island.decision('approve'));
document.getElementById('deny').addEventListener('click', () => window.island.decision('deny'));
document.getElementById('restart-update').addEventListener('click', () => window.island.restartUpdate());
