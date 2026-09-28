// Alarm sound synthesised with WebAudio: no audio files.
let ctx: AudioContext | null = null;
function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}
/** Call from a user gesture so later alarms are allowed to play. */
export function unlockAudio(): void {
  try {
    const c = ac();
    if (c.state === 'suspended') void c.resume();
  } catch { /* no audio */ }
}
function beep(c: AudioContext, at: number, freq: number, dur: number, vol = 0.35) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.setValueAtTime(vol, at + dur - 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  o.connect(lp).connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}
/** One "pi-pi-pi-pi" burst (about 1 s). */
export function burst(): void {
  try {
    const c = ac();
    if (c.state === 'suspended') void c.resume();
    const t0 = c.currentTime + 0.02;
    for (let i = 0; i < 4; i++) beep(c, t0 + i * 0.16, i % 2 ? 1760 : 1568, 0.1);
  } catch { /* ignore */ }
}
let loop = 0;
let stopAt = 0;
export function startAlarm(maxMs = 60000): void {
  if (loop) return;
  stopAt = Date.now() + maxMs;
  burst();
  loop = window.setInterval(() => {
    if (Date.now() > stopAt) { stopAlarm(); return; }
    burst();
  }, 1300);
}
export function stopAlarm(): void {
  clearInterval(loop);
  loop = 0;
}
export const alarmRinging = () => loop !== 0;
