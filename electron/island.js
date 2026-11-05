const root = document.getElementById('island');
const input = document.getElementById('command-input');
const select = document.getElementById('agent-select');
const preview = document.getElementById('result-preview');
const label = document.getElementById('result-label');
const mic = document.getElementById('mic');
let pointerStart, moved = false, state = 'resting', over = false, collapseTimer, pending, pendingText, pendingTimer, resultAgent, recording = false;
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
    if (next === 'result' && !over) scheduleCollapse();
  }
});
window.island.onAgent(agent => { if (agent === 'hanex' || agent === 'shumex') select.value = agent; });
window.island.onChat(status => {
  if (!status || !['working', 'result', 'error', 'rejected'].includes(status.phase)) return;
  if (status.id && status.id === pending) {
    if (status.phase === 'working' && input.value.trim() === pendingText) { input.value = ''; input.blur(); }
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
document.getElementById('command-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || pending) return;
  pending = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  pendingText = text;
  pendingTimer = setTimeout(() => { pending = undefined; label.textContent = 'Chat did not respond'; preview.textContent = 'Open chat to check before retrying.'; }, 10000);
  window.island.command({ agent: select.value, text, id: pending });
});
document.getElementById('open-chat').addEventListener('click', () => window.island.open());
preview.addEventListener('click', () => { if (resultAgent) window.island.selectAgent(resultAgent); window.island.open(); });

// Chromium builds without Web Speech support report that explicitly instead of pretending to record.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
mic.title = 'Dictate a command (speech recognition may use an external service)';
mic.addEventListener('click', () => {
  if (!Recognition) { label.textContent = 'Microphone unavailable'; preview.textContent = 'Speech recognition is not supported in this desktop build. Type your command instead.'; return; }
  if (recording) return;
  const recognition = new Recognition();
  recognition.interimResults = false;
  recognition.onresult = event => { input.value = [input.value.trim(), event.results[0][0].transcript].filter(Boolean).join(' '); input.focus(); };
  recognition.onerror = () => { label.textContent = 'Microphone unavailable'; preview.textContent = 'Speech recognition failed or microphone access was denied.'; };
  recognition.onend = () => { recording = false; mic.textContent = '🎙'; if (!over) scheduleCollapse(); };
  try { recognition.start(); recording = true; mic.textContent = '●'; }
  catch { label.textContent = 'Microphone unavailable'; preview.textContent = 'Could not start speech recognition.'; }
});

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
