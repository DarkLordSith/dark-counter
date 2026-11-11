// Save compatibility: progress made in the OLD version must continue in the NEW one.
//  1) DC1 code exported from old → pasted into new (and into old as reference)
//  2) old localStorage (dark-counter-v3) → page load of new
//  3) code exported from new → loads in old (downgrade still works)
// Usage: node savecompat.mjs <oldUrl> <newUrl>
import { deterministicInit, launch, rng } from './common.mjs';

const [, , OLD, NEW] = process.argv;
const W = { call: 8, offer: 6, ask: 6, accept: 4, take: 4, show: 5, insp: 4, closeshop: 6, sleep: 4, junk: 5, dig: 6, market: 3, close: 6, rentpay: 6, rentdefer: 3, rentitems: 3, sel: 3, bench: 4, craft: 4, parts: 2, tab: 1, refuse: 2 };

async function open(browser, url, seed, preset) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.setBypassServiceWorker(true);
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  await page.evaluateOnNewDocument(deterministicInit(seed, preset));
  await page.goto(url, { waitUntil: 'load' });
  return page;
}

async function botSteps(page, n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cs = await page.evaluate(w => {
      const modal = !document.getElementById('modal').hidden;
      const root = document.getElementById(modal ? 'modal' : 'app');
      return [...root.querySelectorAll('[data-a]')].filter(b => !b.disabled && !b.hidden && b.offsetParent && w[b.dataset.a])
        .map(b => ({ a: b.dataset.a, v: b.dataset.v ?? null }));
    }, W);
    if (!cs.length) break;
    const total = cs.reduce((s, c) => s + W[c.a], 0);
    let x = r() * total, pick = cs.at(-1);
    for (const c of cs) { x -= W[c.a]; if (x <= 0) { pick = c; break; } }
    await page.evaluate(c => {
      const modal = !document.getElementById('modal').hidden;
      document.getElementById(modal ? 'modal' : 'app').querySelector(`[data-a="${c.a}"]` + (c.v !== null ? `[data-v="${c.v}"]` : '')).click();
      __step(90);
    }, pick);
  }
}

const snap = page => page.evaluate(() => JSON.stringify({
  save: localStorage.getItem('dark-counter-v3'),
  hud: document.getElementById('hud').innerHTML.replace(/\s+/g, ' '),
  pane: document.getElementById('pane').innerHTML.replace(/\s+/g, ' '),
  scene: document.getElementById('scn').toDataURL(),
}));
const exportCode = page => page.evaluate(() => {
  document.querySelector('[data-a="savemenu"]').click();
  const code = document.getElementById('savecode').value;
  document.querySelector('#modal [data-a="close"]').click();
  return code;
});
const importCode = (page, code) => page.evaluate(code => {
  document.querySelector('[data-a="savemenu"]').click();
  document.getElementById('loadcode').value = code;
  document.querySelector('[data-a="loadsave"]').click();
  __step(90);
  return { modalOpen: !document.getElementById('modal').hidden, msg: document.getElementById('savemsg')?.textContent };
}, code);

async function compareContinuation(label, a, b, seed) {
  const sa = await snap(a), sb = await snap(b);
  let ok = sa === sb;
  for (let i = 0; ok && i < 60; i++) {
    await botSteps(a, 1, seed + i);
    await botSteps(b, 1, seed + i);
    ok = (await snap(a)) === (await snap(b));
    if (!ok) console.log(`  ${label}: diverged at continuation step ${i}`);
  }
  return ok;
}

const browser = await launch();
let failures = 0;
for (const seed of [11, 222, 3333, 44444, 555555]) {
  // play the OLD version for a while
  const old = await open(browser, OLD, seed);
  await botSteps(old, 150, seed);
  const code = await exportCode(old);
  const raw = await old.evaluate(() => localStorage.getItem('dark-counter-v3'));
  const st = JSON.parse(raw);
  // 1) DC1 code: old → new, compared to old → old
  const refA = await open(browser, OLD, seed + 1), newA = await open(browser, NEW, seed + 1);
  const ra = await importCode(refA, code), na = await importCode(newA, code);
  const newState = JSON.parse(await newA.evaluate(() => localStorage.getItem('dark-counter-v3')));
  const sameDay = newState.day === st.day && newState.credits === st.credits && newState.inv.length === st.inv.length;
  const ok1 = !na.modalOpen && sameDay && await compareContinuation('code', refA, newA, seed * 3);
  // 2) localStorage from old → new on page load
  const refB = await open(browser, OLD, seed + 2, raw), newB = await open(browser, NEW, seed + 2, raw);
  const ok2 = await compareContinuation('localStorage', refB, newB, seed * 5);
  // 3) code from new → old
  const codeNew = await exportCode(newA);
  const back = await open(browser, OLD, seed + 3);
  const rb = await importCode(back, codeNew);
  const ok3 = !rb.modalOpen;
  const errs = [old, refA, newA, refB, newB, back].flatMap(p => p.errors);
  console.log(`seed ${seed}: day ${st.day}, ${st.credits} кр, ${st.inv.length} items, phase ${st.phase}${st.cust ? ', customer ' + st.cust.kind : ''} | old code→new: ${ok1 ? 'OK' : 'FAIL'} | old localStorage→new: ${ok2 ? 'OK' : 'FAIL'} | new code→old: ${ok3 ? 'OK' : 'FAIL'} | errors ${errs.length}`);
  if (!ok1 || !ok2 || !ok3 || errs.length) { failures++; console.log(errs.slice(0, 3), ra, na); }
  for (const p of [old, refA, newA, refB, newB, back]) await p.browserContext().close();
}
await browser.close();
process.exit(failures ? 1 : 0);
