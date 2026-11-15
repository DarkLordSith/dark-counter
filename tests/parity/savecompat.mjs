// Save compatibility: progress made in the OLD version must continue in the NEW one.
//  1) DC1 code exported from old → pasted into new (and into old as reference)
//  2) old localStorage (dark-counter-v3) → page load of new
//  3) code exported from new → loads in old (downgrade still works)
// Usage: node savecompat.mjs <oldUrl> <newUrl>
// PARITY_NEW_BEHAVIOR=1 (the game plays differently on purpose, e.g. junkyard v2): old saves must
// still load with the same day, credits and stock and keep playing without errors, but the
// continuation is not compared with the old version, and the downgrade (3) is only reported:
// an old build may not know the new save fields.
import { clickMenuItem, deterministicInit, launch, passModeScreen, rng, storySave } from './common.mjs';

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
  await passModeScreen(page);
  return page;
}

async function botSteps(page, n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cs = await page.evaluate(w => {
      const modal = !document.getElementById('modal').hidden;
      const root = document.getElementById(modal ? 'modal' : 'app');
      // sorted, like diff.mjs: moving a button in the DOM (V1.5: "call" from the scene to the action bar) changes nothing
      const key = c => c.a + '\u0000' + (c.v ?? '');
      return [...root.querySelectorAll('[data-a]')].filter(b => !b.disabled && !b.hidden && b.offsetParent && w[b.dataset.a])
        .map(b => ({ a: b.dataset.a, v: b.dataset.v ?? null }))
        .sort((x, y) => key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0);
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

// PARITY_LOGIC_ONLY=1 (look changed on purpose): compare the save and the scene, not the markup.
const LOGIC_ONLY = process.env.PARITY_LOGIC_ONLY === '1';
// PARITY_SKIP_SCENE=1: the scene drawing changed on purpose, compare the save only.
const SKIP_SCENE = process.env.PARITY_SKIP_SCENE === '1';
const snap = async page => {
  const s = await page.evaluate((logicOnly, skipScene) => ({
    save: localStorage.getItem('dark-counter-v3'),
    hud: logicOnly ? '' : document.getElementById('hud').innerHTML.replace(/\s+/g, ' '),
    pane: logicOnly ? '' : document.getElementById('pane').innerHTML.replace(/\s+/g, ' '),
    scene: skipScene ? '' : document.getElementById('scn').toDataURL(),
  }), LOGIC_ONLY, SKIP_SCENE);
  s.save = storySave(s.save);
  return JSON.stringify(s);
};
const exportCode = async page => {
  await page.evaluate(clickMenuItem, 'savemenu');
  return page.evaluate(() => {
    const code = document.getElementById('savecode').value;
    document.querySelector('#modal [data-a="close"]').click();
    return code;
  });
};
const importCode = async (page, code) => {
  await page.evaluate(clickMenuItem, 'savemenu');
  return page.evaluate(code => {
    document.getElementById('loadcode').value = code;
    document.querySelector('[data-a="loadsave"]').click();
    __step(90);
    return { modalOpen: !document.getElementById('modal').hidden, msg: document.getElementById('savemsg')?.textContent };
  }, code);
};

const NEW_BEHAVIOR = process.env.PARITY_NEW_BEHAVIOR === '1';

async function compareContinuation(label, a, b, seed) {
  if (NEW_BEHAVIOR) {
    // only the new version keeps playing: no comparison, errors are counted below
    await botSteps(b, 60, seed);
    return true;
  }
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
  const rb = await importCode(back, codeNew).catch(error => ({ modalOpen: true, msg: String(error).split('\n')[0] }));
  const ok3 = !rb.modalOpen && !back.errors.length;
  const errs = [old, refA, newA, refB, newB].flatMap(p => p.errors);
  const downgrade = ok3 ? 'OK' : NEW_BEHAVIOR ? `skipped (${rb.msg || back.errors[0] || 'error'})` : 'FAIL';
  console.log(`seed ${seed}: day ${st.day}, ${st.credits} кр, ${st.inv.length} items, phase ${st.phase}${st.cust ? ', customer ' + st.cust.kind : ''} | old code→new: ${ok1 ? 'OK' : 'FAIL'} | old localStorage→new: ${ok2 ? 'OK' : 'FAIL'} | new code→old: ${downgrade} | errors ${errs.length}`);
  if (!ok1 || !ok2 || (!ok3 && !NEW_BEHAVIOR) || errs.length) { failures++; console.log(errs.slice(0, 3), back.errors.slice(0, 1), ra, na); }
  for (const p of [old, refA, newA, refB, newB, back]) await p.browserContext().close();
}
await browser.close();
process.exit(failures ? 1 : 0);
