const root = document.getElementById('island');
let pointerStart, moved = false;
window.island.onState(state => {
  if (['resting', 'listening', 'working', 'approval', 'update'].includes(state)) root.className = `island ${state}`;
});
root.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('button')) return;
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
