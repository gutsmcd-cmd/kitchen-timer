type Sentinel = { release(): Promise<void>; released: boolean; addEventListener(t: 'release', f: () => void): void };
let sentinel: Sentinel | null = null;
let wanted = false;
export const wakeLockSupported = 'wakeLock' in navigator;
async function acquire() {
  if (!wakeLockSupported || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await (navigator as unknown as { wakeLock: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch { sentinel = null; }
}
export function setWakeLock(on: boolean): void {
  wanted = on;
  if (on) void acquire();
  else if (sentinel) { void sentinel.release(); sentinel = null; }
}
document.addEventListener('visibilitychange', () => { if (wanted && document.visibilityState === 'visible') void acquire(); });
