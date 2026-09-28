import './base.css';
import './style.css';
import { h, toast, loadJSON, saveJSON, uid, langToggle } from './ui';
import { dicts, type Lang, type Dict } from './i18n';
import { unlockAudio, startAlarm, stopAlarm, burst } from './audio';
import { setWakeLock, wakeLockSupported } from './wakelock';

type TState = 'idle' | 'running' | 'paused' | 'done';
interface Timer { id: string; name: string; duration: number; endAt: number; remaining: number; state: TState; doneAt: number }
interface Watch { startAt: number; acc: number; laps: number[] }
interface State {
  lang: Lang; tab: 'timers' | 'watch'; timers: Timer[]; watch: Watch;
  sound: boolean; vibrate: boolean; recent: number[]; seq: number;
}
const KEY = 'kitchen-timer:v1';
const st: State = loadJSON<State>(KEY, {
  lang: 'ja', tab: 'timers', timers: [], watch: { startAt: 0, acc: 0, laps: [] },
  sound: true, vibrate: true, recent: [], seq: 0,
});
let t: Dict = dicts[st.lang];
const save = () => saveJSON(KEY, st);
const app = document.getElementById('app')!;
const now = () => Date.now();

function setLang(l: Lang) { st.lang = l; t = dicts[l]; document.documentElement.lang = l; document.title = t.app; save(); render(); }

/* ---------- time helpers (all based on wall-clock timestamps, so tab switches don't drift) ---------- */
const remainingOf = (x: Timer) => (x.state === 'running' ? Math.max(0, x.endAt - now()) : x.state === 'done' ? 0 : x.remaining);
function fmtTimer(ms: number) {
  const s = Math.ceil(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
function fmtWatch(ms: number) {
  const cs = Math.floor(ms / 10);
  const hh = Math.floor(cs / 360000), mm = Math.floor((cs % 360000) / 6000), ss = Math.floor((cs % 6000) / 100), c = cs % 100;
  const p = (n: number) => String(n).padStart(2, '0');
  return (hh ? `${hh}:` : '') + `${p(mm)}:${p(ss)}.${p(c)}`;
}
const watchElapsed = () => st.watch.acc + (st.watch.startAt ? now() - st.watch.startAt : 0);
const labelDur = (ms: number) => {
  const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000);
  if (st.lang === 'ja') return (m ? `${m}分` : '') + (s ? `${s}秒` : '');
  return [m ? `${m}m` : '', s ? `${s}s` : ''].join(' ').trim();
};

/* ---------- timer actions ---------- */
function addTimer(ms: number, name = '') {
  unlockAudio();
  st.seq++;
  st.timers.unshift({ id: uid(), name: name || labelDur(ms), duration: ms, endAt: now() + ms, remaining: ms, state: 'running', doneAt: 0 });
  save(); render();
}
function toggle(x: Timer) {
  unlockAudio();
  if (x.state === 'running') { x.remaining = Math.max(0, x.endAt - now()); x.state = 'paused'; }
  else if (x.state === 'paused' || x.state === 'idle') { x.endAt = now() + x.remaining; x.state = 'running'; }
  else if (x.state === 'done') { x.remaining = x.duration; x.endAt = now() + x.duration; x.state = 'running'; syncAlarm(); }
  save(); render();
}
function resetTimer(x: Timer) { x.state = 'idle'; x.remaining = x.duration; save(); syncAlarm(); render(); }
function plusMinute(x: Timer) {
  if (x.state === 'running') x.endAt += 60000;
  else if (x.state === 'done') { x.endAt = now() + 60000; x.state = 'running'; }
  else x.remaining += 60000;
  x.duration = Math.max(x.duration, remainingOf(x));
  save(); syncAlarm(); render();
}
function removeTimer(x: Timer) {
  const i = st.timers.indexOf(x);
  st.timers.splice(i, 1); save(); syncAlarm(); render();
  toast(t.deleted, { label: t.undo, run: () => { st.timers.splice(i, 0, x); save(); render(); } });
}
function stopAllDone() {
  for (const x of st.timers) if (x.state === 'done') { x.state = 'idle'; x.remaining = x.duration; }
  save(); syncAlarm(); render();
}

let vibLoop = 0;
function syncAlarm() {
  const ringing = st.timers.some((x) => x.state === 'done' && now() - x.doneAt < 5 * 60000);
  if (ringing) {
    if (st.sound) startAlarm(); else stopAlarm();
    if (st.vibrate && navigator.vibrate && !vibLoop) {
      navigator.vibrate([400, 200, 400, 200, 400]);
      vibLoop = window.setInterval(() => navigator.vibrate?.([400, 200, 400, 200, 400]), 2500);
    }
  } else {
    stopAlarm();
    if (vibLoop) { clearInterval(vibLoop); vibLoop = 0; navigator.vibrate?.(0); }
  }
  const running = st.timers.some((x) => x.state === 'running') || !!st.watch.startAt || ringing;
  setWakeLock(running);
  document.title = ringing ? `⏰ ${t.done}` : t.app;
}

/* ---------- ticking: only text nodes are updated ---------- */
function tick() {
  let changed = false;
  for (const x of st.timers) {
    if (x.state === 'running' && x.endAt <= now()) {
      x.state = 'done'; x.doneAt = x.endAt; changed = true;
    }
  }
  if (changed) { save(); syncAlarm(); render(); return; }
  for (const x of st.timers) {
    if (x.state !== 'running') continue;
    const el = document.querySelector<HTMLElement>(`[data-t="${x.id}"]`);
    if (!el) continue;
    const rem = remainingOf(x);
    el.querySelector('.t-time')!.textContent = fmtTimer(rem);
    (el.querySelector('.t-bar i') as HTMLElement).style.width = `${x.duration ? (100 * rem) / x.duration : 0}%`;
  }
  const w = document.querySelector('.w-time');
  if (w) {
    w.textContent = fmtWatch(watchElapsed());
    const cur = document.querySelector('.lap-cur .lap-t');
    if (cur) cur.textContent = fmtWatch(watchElapsed() - st.watch.laps.reduce((a, b) => a + b, 0));
  }
}
let raf = 0;
function loop() { tick(); raf = requestAnimationFrame(loop); }
// rAF pauses in background; a coarse interval still catches timers finishing while hidden.
setInterval(() => { if (document.hidden) tick(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

/* ---------- custom dialog ---------- */
function customDialog() {
  const name = h('input', { class: 'input', placeholder: t.namePh, maxlength: 30 });
  const mm = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 0, max: 999, value: '8' });
  const ss = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 0, max: 59, value: '0' });
  const dlg = h('dialog', {},
    h('h2', {}, t.customTitle),
    h('div', { class: 'stack' },
      h('label', { class: 'field' }, t.name, name),
      h('div', { class: 'row dur' }, mm, h('span', {}, t.minutes), ss, h('span', {}, t.seconds)),
      h('div', { class: 'row quick' }, ...[1, 2, 4, 7, 15, 20, 30].map((m) => h('button', { class: 'mini', onclick: () => { mm.value = String(m); ss.value = '0'; } }, t.min(m)))),
    ),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => dlg.close() }, t.cancel),
      h('button', { class: 'btn primary', onclick: () => {
        const ms = (Math.max(0, Number(mm.value) || 0) * 60 + Math.max(0, Math.min(59, Number(ss.value) || 0))) * 1000;
        if (ms <= 0) return;
        if (![180000, 300000, 600000].includes(ms)) st.recent = [ms, ...st.recent.filter((r) => r !== ms)].slice(0, 3);
        dlg.close();
        addTimer(ms, name.value.trim());
      } }, t.start),
    ),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  mm.select();
}

function renameTimer(x: Timer, el: HTMLElement) {
  const inp = h('input', { class: 'input rename', value: x.name, maxlength: 30 });
  const done = () => { x.name = inp.value.trim() || x.name; save(); render(); };
  inp.addEventListener('blur', done);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  el.replaceWith(inp);
  inp.select();
}

/* ---------- views ---------- */
const ICON: Record<string, string> = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1.2"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.2"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9M10 2h4"/></svg>',
  watch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 13l3-3M12 2v3M19 5l1.5-1.5"/></svg>',
};
const ic = (k: string, cls = 'ic') => { const s = h('span', { class: cls, 'aria-hidden': 'true' }); s.innerHTML = ICON[k]; return s; };

function timerCard(x: Timer) {
  const rem = remainingOf(x);
  const nameEl = h('button', { class: 't-name', title: x.name }, x.name);
  nameEl.onclick = () => renameTimer(x, nameEl);
  const primary = x.state === 'done'
    ? h('button', { class: 'btn primary stopbtn', onclick: () => resetTimer(x) }, t.stop)
    : h('button', { class: 'round primary', 'aria-label': x.state === 'running' ? t.pause : x.state === 'paused' ? t.resume : t.start, onclick: () => toggle(x) }, ic(x.state === 'running' ? 'pause' : 'play'));
  return h('article', { class: `timer ${x.state}`, 'data-t': x.id },
    h('div', { class: 't-top' }, nameEl, h('span', { class: 't-total' }, fmtTimer(x.duration)),
      h('button', { class: 'icon-btn sm', 'aria-label': t.del, onclick: () => removeTimer(x) }, ic('x'))),
    h('div', { class: 't-main' },
      h('div', { class: 't-time' + (x.state === 'done' ? ' blink' : '') }, x.state === 'done' ? t.done : fmtTimer(rem)),
      h('div', { class: 't-btns' },
        h('button', { class: 'round', 'aria-label': t.reset, onclick: () => resetTimer(x), disabled: x.state === 'idle' }, ic('reset')),
        h('button', { class: 'pill', onclick: () => plusMinute(x) }, t.plus1),
        primary,
      ),
    ),
    h('div', { class: 't-bar' }, h('i', { style: `width:${x.duration ? (100 * rem) / x.duration : 0}%` })),
  );
}

function renderTimers() {
  const presets = [3, 5, 10].map((m) => h('button', { class: 'preset', onclick: () => addTimer(m * 60000) }, h('b', {}, String(m)), h('span', {}, st.lang === 'ja' ? '分' : 'min')));
  const anyDone = st.timers.some((x) => x.state === 'done');
  return h('div', { class: 'stack' },
    h('div', { class: 'presets' }, ...presets, h('button', { class: 'preset custom', onclick: customDialog }, h('b', {}, '＋'), h('span', {}, t.custom))),
    st.recent.length ? h('div', { class: 'row recent' }, h('span', { class: 'muted small' }, t.recent), ...st.recent.map((ms) => h('button', { class: 'mini', onclick: () => addTimer(ms) }, labelDur(ms)))) : '',
    anyDone ? h('button', { class: 'btn primary block big-stop', onclick: stopAllDone }, '⏰ ', t.stop) : '',
    st.timers.length ? h('div', { class: 'timers' }, ...st.timers.map(timerCard)) : h('p', { class: 'empty' }, t.noTimers),
    h('section', { class: 'card settings' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: st.sound, onchange: (e: Event) => { st.sound = (e.target as HTMLInputElement).checked; save(); syncAlarm(); } }), h('span', {}, t.sound)),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: st.vibrate, onchange: (e: Event) => { st.vibrate = (e.target as HTMLInputElement).checked; save(); syncAlarm(); } }), h('span', {}, t.vibrate)),
      h('button', { class: 'mini', onclick: () => { unlockAudio(); burst(); if (st.vibrate) navigator.vibrate?.(200); } }, t.testSound),
      h('p', { class: 'muted small awake' }, wakeLockSupported ? t.awake : t.awakeNo),
    ),
  );
}

function renderWatch() {
  const w = st.watch;
  const running = !!w.startAt;
  const el = watchElapsed();
  const laps = w.laps;
  const best = laps.length > 1 ? Math.min(...laps) : -1;
  const worst = laps.length > 1 ? Math.max(...laps) : -1;
  let cum = 0;
  const rows = laps.map((l, i) => { cum += l; return { n: i + 1, l, cum }; }).reverse();
  return h('div', { class: 'stack' },
    h('section', { class: 'card watch' }, h('div', { class: 'w-time' }, fmtWatch(el))),
    h('div', { class: 'w-btns' },
      h('button', { class: 'wbtn', disabled: !running && el === 0, onclick: () => {
        if (running) { w.laps.push(watchElapsed() - w.laps.reduce((a, b) => a + b, 0)); }
        else { w.acc = 0; w.laps = []; }
        save(); render();
      } }, running || el === 0 ? t.lap : t.reset),
      h('button', { class: 'wbtn ' + (running ? 'stop' : 'go'), onclick: () => {
        unlockAudio();
        if (running) { w.acc += now() - w.startAt; w.startAt = 0; } else { w.startAt = now(); }
        save(); syncAlarm(); render();
      } }, running ? t.pause : el ? t.resume : t.start),
    ),
    laps.length || running ? h('ol', { class: 'laps' },
      running ? h('li', { class: 'lap-cur' }, h('span', { class: 'lap-n' }, `${t.lap} ${laps.length + 1}`), h('span', { class: 'lap-t' }, fmtWatch(el - laps.reduce((a, b) => a + b, 0))), h('span', { class: 'lap-c' }, '')) : '',
      ...rows.map((r) => h('li', { class: r.l === best ? 'best' : r.l === worst ? 'worst' : '' },
        h('span', { class: 'lap-n' }, `${t.lap} ${r.n}`, r.l === best ? h('em', {}, t.best) : r.l === worst ? h('em', {}, t.worst) : ''),
        h('span', { class: 'lap-t' }, fmtWatch(r.l)),
        h('span', { class: 'lap-c' }, fmtWatch(r.cum)))),
    ) : '',
  );
}

function render() {
  const tab = (id: State['tab'], icon: string, lab: string) =>
    h('button', { class: 'tab', 'aria-pressed': String(st.tab === id), onclick: () => { st.tab = id; save(); render(); } }, ic(icon, 'tab-ic'), h('span', {}, lab));
  app.replaceChildren(
    h('header', { class: 'topbar' }, ic('timer', 'logo'), h('h1', {}, t.app), langToggle(st.lang, setLang)),
    h('main', {}, st.tab === 'timers' ? renderTimers() : renderWatch(), h('p', { class: 'foot' }, t.privacy)),
    h('nav', { class: 'tabs' }, tab('timers', 'timer', t.tabTimers), tab('watch', 'watch', t.tabWatch)),
  );
}

document.addEventListener('pointerdown', unlockAudio, { once: true });
document.documentElement.lang = st.lang;
// Timers that finished while the app was closed: mark done (ring only if recent).
for (const x of st.timers) if (x.state === 'running' && x.endAt <= now()) { x.state = 'done'; x.doneAt = x.endAt; }
save();
render();
syncAlarm();
cancelAnimationFrame(raf);
loop();
