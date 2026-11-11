// Records every Web Audio call made by the lofi generator in both versions and
// compares the logs. AudioContext is replaced by a recording fake with a
// controllable clock; the scheduler's setInterval(…, 25) is driven by hand.
// Usage: node audiotest.mjs <urlA> <urlB>
import { hash as h, launch } from './common.mjs';

const [, , OLD, NEW] = process.argv;
const INIT = `(() => {
  let s = 42; Math.random = () => (s = s * 16807 % 2147483647) / 2147483647;
  window.__log = [];
  const L = (...a) => __log.push(a.map(x => typeof x === 'number' ? +x.toFixed(9) : x).join(' '));
  let id = 0;
  const param = (owner, name) => {
    const p = { _v: 0, setValueAtTime: (v, t) => L(owner, name, 'set', v, t), linearRampToValueAtTime: (v, t) => L(owner, name, 'lin', v, t),
      exponentialRampToValueAtTime: (v, t) => L(owner, name, 'exp', v, t) };
    Object.defineProperty(p, 'value', { set(v) { L(owner, name, '=', v); }, get() { return 0; } });
    return p;
  };
  const node = kind => {
    const n = { _id: kind + (++id), connect: d => L(n._id, 'connect', d._id || 'dest'), start: (...a) => L(n._id, 'start', ...a), stop: (...a) => L(n._id, 'stop', ...a) };
    n.frequency = param(n._id, 'freq'); n.gain = param(n._id, 'gain');
    Object.defineProperty(n, 'type', { set(v) { L(n._id, 'type', v); } });
    Object.defineProperty(n, 'loop', { set(v) { L(n._id, 'loop', v); } });
    Object.defineProperty(n, 'buffer', { set(v) { L(n._id, 'buffer', v._id, v._sum.toFixed(6)); } });
    return n;
  };
  window.AudioContext = class {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.destination = { _id: 'dest' }; window.__ac = this; }
    createBiquadFilter() { return node('filter'); }
    createGain() { return node('gain'); }
    createOscillator() { return node('osc'); }
    createBufferSource() { return node('src'); }
    createBuffer(ch, len) { const d = new Float32Array(len); const b = { _id: 'buf' + (++id), getChannelData: () => d };
      Object.defineProperty(b, '_sum', { get: () => d.reduce((a, x) => a + x, 0) }); return b; }
    resume() { L('resume'); } suspend() { L('suspend'); }
  };
  const realSetInterval = window.setInterval;
  window.setInterval = (cb, ms) => { if (ms === 25) { window.__tick = cb; return 1; } return realSetInterval(cb, ms); };
  window.requestAnimationFrame = () => 0;
})();`;

const browser = await launch();
async function record(url) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.evaluateOnNewDocument(INIT);
  await page.goto(url, { waitUntil: 'load' });
  const log = await page.evaluate(() => {
    const click = () => document.querySelector('[data-a="music"]').click();
    click(); // on
    for (let i = 0; i < 1200; i++) { __ac.currentTime += 0.025; __tick(); } // 30 s of music
    const label = document.querySelector('[data-a="music"]').textContent;
    click(); // off
    for (let i = 0; i < 40; i++) { __ac.currentTime += 0.025; __tick(); }
    click(); // on again
    for (let i = 0; i < 200; i++) { __ac.currentTime += 0.025; __tick(); }
    __log.push('label ' + label);
    return __log;
  });
  await ctx.close();
  return { log, errors };
}
const a = await record(OLD), b = await record(NEW);
console.log(`A: ${a.log.length} calls ${h(a.log.join('\n'))} | B: ${b.log.length} calls ${h(b.log.join('\n'))} | errors ${a.errors.length}/${b.errors.length}`);
const i = a.log.findIndex((x, k) => x !== b.log[k]);
if (i >= 0 || a.log.length !== b.log.length) { console.log('first diff at', i, a.log.slice(i, i + 3), b.log.slice(i, i + 3)); process.exit(1); }
await browser.close();
if (a.errors.length || b.errors.length) { console.log(a.errors, b.errors); process.exit(1); }
console.log('identical; sample:', a.log.slice(0, 4).join(' | '), '…', a.log.at(-1));
