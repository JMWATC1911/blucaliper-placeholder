// The page's one requestAnimationFrame loop. Everything that animates per
// frame subscribes here; the loop sleeps when nothing is subscribed or the tab
// is hidden.
//   const stop = loop.add((now, dt) => { ...; return false to unsubscribe });
//   loop.once(fn)  run fn on the next frame only (coalesces duplicates)
const subs = new Set();
const onceQ = new Set();
let raf = 0, last = 0;

function tick(now) {
  raf = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  const q = [...onceQ]; onceQ.clear();
  for (const f of q) run(f, now, dt, true);
  for (const f of [...subs]) if (run(f, now, dt) === false) subs.delete(f);
  wake();
  if (!raf) last = 0;
}
function run(f, now, dt, once) {
  try { return f(now, dt); } catch (e) { if (!once) subs.delete(f); console.error(e); return false; }
}
function wake() {
  if (!raf && !document.hidden && (subs.size || onceQ.size)) raf = requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; } else wake(); });

export const loop = {
  add(fn) { subs.add(fn); wake(); return () => subs.delete(fn); },
  once(fn) { onceQ.add(fn); wake(); },
  get size() { return subs.size; },
};
export default loop;
