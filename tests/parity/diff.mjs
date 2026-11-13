// Differential test: drives the reference (A) and the candidate (B) with
// identical deterministic inputs and compares snapshots after every step:
// save in localStorage, DOM, canvas pixels, computed styles, screenshots.
// Usage: node diff.mjs <urlA> <urlB> [runs=12] [steps=250]
// PARITY_IGNORE=<css selector> hides and skips intentionally new elements
// in both versions (the version label .version is always skipped).
import fs from 'node:fs';
import { deterministicInit, hash as h, launch, preloadFonts, rng } from './common.mjs';

const [, , URL_A, URL_B, RUNS = '12', STEPS = '250'] = process.argv;
// The version label ("v0.7 · <commit>") differs between any two builds by
// design, so it is always ignored; PARITY_IGNORE adds more selectors.
const IGNORE = ['.version', process.env.PARITY_IGNORE].filter(Boolean).join(', ');
// PARITY_LOGIC_ONLY=1: for PRs that change the look on purpose (e.g. new UI colors).
// Compares only the game logic: save, input values and canvas pixels (scene, icons);
// skips markup, computed styles, screenshots and floating-number colors.
const LOGIC_ONLY = process.env.PARITY_LOGIC_ONLY === '1';
const LOGIC_KEYS = new Set(['save', 'values', 'canv']);
const OUT = new URL('./out/shots/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

const WEIGHTS = { call: 8, offer: 6, ask: 6, accept: 4, take: 4, show: 5, insp: 4, adj: 3, refuse: 2, closeshop: 6, sleep: 4,
  junk: 5, dig: 6, market: 3, home: 1, close: 6, rentpay: 6, rentdefer: 3, rentitems: 3, evict: 3, sel: 3, bench: 4, craft: 4,
  parts: 2, tab: 1, log: 0.5, savemenu: 1.5, newgame: 0.3, 'newgame-yes': 1, buyout: 5, loadsave: 2 };
const SKIP = new Set(['music', 'copysave']);

async function candidates(page) {
  return page.evaluate(skip => {
    const modalOpen = !document.getElementById('modal').hidden;
    const root = modalOpen ? document.getElementById('modal') : document.getElementById('app');
    const out = [...root.querySelectorAll('[data-a]')]
      .filter(b => !b.disabled && !b.hidden && b.offsetParent !== null && !skip.includes(b.dataset.a))
      .map(b => ({ a: b.dataset.a, v: b.dataset.v ?? null }));
    if (!modalOpen && document.getElementById('offer')) out.push({ a: '__type', v: null });
    if (!modalOpen && document.querySelector('.pile, [data-a="dig"]')) out.push({ a: '__canvas', v: null });
    return out;
  }, [...SKIP]);
}

async function act(page, c, r) {
  if (c.a === '__type') {
    const val = Math.floor(r() * 120) * 10;
    return page.evaluate(v => { const i = document.getElementById('offer'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, val);
  }
  if (c.a === '__canvas') {
    const x = r(), y = 0.6 + r() * 0.4;
    return page.evaluate((x, y) => {
      const cv = document.getElementById('scn'), b = cv.getBoundingClientRect();
      cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + x * b.width, clientY: b.top + y * b.height }));
    }, x, y);
  }
  if (c.a === 'loadsave') { // paste current save code (or garbage) into the loader
    const mode = Math.floor(r() * 6); // 0 garbage, 1 as-is, 2 rich, 3 rent due today, 4 broke + rent due, 5 legacy save w/o nextDue
    await page.evaluate(mode => {
      const code = document.getElementById('savecode').value;
      let out = code;
      if (mode === 0) out = 'nonsense';
      if (mode >= 2) {
        const d = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
        if (mode === 2) d.credits += 5200;
        if (mode === 3) { d.nextDue = d.day; d.llAt = 1; }
        if (mode === 4) { d.nextDue = d.day; d.credits = 5; d.deferred = true; d.llAt = 1; }
        if (mode === 5) { delete d.nextDue; }
        out = '  DC1:' + btoa(unescape(encodeURIComponent(JSON.stringify(d)))) + '\n';
      }
      document.getElementById('loadcode').value = out;
    }, mode);
  }
  return page.evaluate(c => {
    const sel = `[data-a="${c.a}"]` + (c.v !== null ? `[data-v="${c.v}"]` : '');
    const modalOpen = !document.getElementById('modal').hidden;
    const root = modalOpen ? document.getElementById('modal') : document.getElementById('app');
    root.querySelector(sel).click();
  }, c);
}

async function snapshot(page, deep) {
  return page.evaluate((deep, ignore) => {
    const canv = [...document.querySelectorAll('canvas')].map(c => c.toDataURL());
    const app = document.getElementById('app').cloneNode(true);
    app.querySelectorAll('.fx').forEach(n => n.remove());
    const mbox = document.getElementById('mbox').cloneNode(true);
    if (ignore) [app, mbox].forEach(root => root.querySelectorAll(ignore).forEach(n => n.remove()));
    const s = {
      save: localStorage.getItem('dark-counter-v3'),
      app: app.innerHTML.replace(/\s+/g, ' '),
      modal: document.getElementById('modal').hidden + '|' + mbox.innerHTML.replace(/\s+/g, ' '),
      values: [...document.querySelectorAll('input,textarea')].map(i => i.id + '=' + i.value).join('\n'),
      canv: canv.join('|'),
      fx: __fx.splice(0).join(''),
    };
    if (deep) {
      s.styles = [document.documentElement, document.body, ...document.body.querySelectorAll('*')].filter(el => el.tagName !== 'SCRIPT' && !el.classList.contains('fx') && !(ignore && el.matches(ignore))).map(el => {
        const out = [];
        for (const pseudo of [null, '::after']) {
          const cs = getComputedStyle(el, pseudo);
          for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith('--')) out.push(cs[i] + ':' + cs.getPropertyValue(cs[i]));
        }
        return el.tagName + '.' + el.className + '{' + out.sort().join(';') + '}';
      }).join('\n');
    }
    return s;
  }, deep, IGNORE);
}

async function runOne(browser, label, url, seed, steps, shots, viewport) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await page.setBypassServiceWorker(true);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.evaluateOnNewDocument(deterministicInit(seed));
  await page.goto(url, { waitUntil: 'load' });
  await preloadFonts(page);
  if (shots) await page.addStyleTag({ content: '.fx{display:none!important}' });
  if (IGNORE) await page.addStyleTag({ content: `${IGNORE}{display:none!important}` });
  const r = rng(seed * 7 + 1);
  const snaps = [];
  for (let i = 0; i < steps; i++) {
    const cs = await candidates(page);
    const total = cs.reduce((s, c) => s + (WEIGHTS[c.a] ?? 1), 0);
    let x = r() * total, pick = cs[cs.length - 1];
    for (const c of cs) { x -= WEIGHTS[c.a] ?? 1; if (x <= 0) { pick = c; break; } }
    await act(page, pick, r);
    await page.evaluate(() => __step(90));
    const s = await snapshot(page, i % 25 === 0 && !LOGIC_ONLY);
    s.action = JSON.stringify(pick) + ' of ' + h(JSON.stringify(cs));
    if (shots) {
      const buf = Buffer.from(await page.screenshot());
      s.shot = h(buf.toString('base64'));
      s.shotPath = new URL(`${label}-${seed}-${i}.png`, OUT);
      fs.writeFileSync(s.shotPath, buf);
    }
    snaps.push(s);
  }
  await ctx.close();
  return { snaps, errors };
}

const browser = await launch();
let fail = 0;
const actionsSeen = {};
for (let run = 0; run < +RUNS; run++) {
  const seed = 1234 + run * 101;
  const shots = run < 3 && !LOGIC_ONLY;
  const viewport = run % 2 ? { width: 390, height: 844, deviceScaleFactor: 1 } : { width: 1024, height: 768, deviceScaleFactor: 1 };
  const [A, B] = await Promise.all([runOne(browser, 'A', URL_A, seed, +STEPS, shots, viewport), runOne(browser, 'B', URL_B, seed, +STEPS, shots, viewport)]);
  let diverged = null;
  for (let i = 0; i < A.snaps.length && !diverged; i++) {
    for (const k of Object.keys(A.snaps[i])) { if (k === 'shotPath' || (LOGIC_ONLY && !LOGIC_KEYS.has(k))) continue;
      if (A.snaps[i][k] !== B.snaps[i][k]) { const la = String(A.snaps[i][k]).split(/(?<=[;>}])/), lb = String(B.snaps[i][k]).split(/(?<=[;>}])/);
        let j = 0; while (j < la.length && la[j] === lb[j]) j++;
        diverged = { step: i, key: k, at: j, a: la.slice(Math.max(0, j - 2), j + 3).join(''), b: lb.slice(Math.max(0, j - 2), j + 3).join(''), action: A.snaps[i].action }; break; }
    }
  }
  A.snaps.forEach(s => { const a = JSON.parse(s.action.split(' of ')[0]).a; actionsSeen[a] = (actionsSeen[a] || 0) + 1; });
  const last = JSON.parse(A.snaps.at(-1).save || '{}');
  console.log(`run ${run} seed ${seed} ${shots ? '[screenshots]' : ''} ${viewport.width}px: ${diverged ? 'DIVERGED' : 'identical'} | day ${last.day}, credits ${last.credits}, won ${last.won}, over ${!!last.over} | errors A=${A.errors.length} B=${B.errors.length}`);
  if (A.errors.length || B.errors.length) console.log('  errors', A.errors.slice(0, 3), B.errors.slice(0, 3));
  if (diverged) {
    fail++;
    console.log(JSON.stringify(diverged, null, 1));
    if (diverged.key === 'shot') console.log(`  скриншоты: out/shots/A-${seed}-${diverged.step}.png и B-…; разница: node pixdiff.mjs out/shots/A-${seed}-${diverged.step}.png out/shots/B-${seed}-${diverged.step}.png`);
  }
}
console.log('actions exercised:', JSON.stringify(actionsSeen));
await browser.close();
process.exit(fail ? 1 : 0);
