// Shared helpers for the parity scripts.
import puppeteer from 'puppeteer-core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function launch() {
  const executablePath = CHROME_CANDIDATES.find(p => p && fs.existsSync(p));
  if (!executablePath) {
    throw new Error('Chrome не найден. Укажите путь: CHROME=/path/to/chrome');
  }
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
}

export const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

/** mulberry32 — small seeded PRNG, also injected into the page as Math.random. */
export function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Page init script: seeded Math.random, a fake clock and a manual
 * requestAnimationFrame (advance with window.__step(frames)), and a log of
 * floating ".fx" texts. Optionally presets the save in localStorage.
 */
export const deterministicInit = (seed, presetSave = null) => `(() => {
  ${rng.toString()}
  Math.random = rng(${seed});
  // task 34: the game follows the system language; both builds play in Russian (headless Chrome is en-US)
  Object.defineProperty(navigator, 'language', { get: () => 'ru-RU' });
  let now = 1000;
  const queue = [];
  performance.now = () => now;
  window.requestAnimationFrame = cb => { queue.push(cb); return queue.length; };
  window.__step = n => { for (let i = 0; i < n; i++) { now += 1000 / 60; queue.splice(0).forEach(cb => cb(now)); } };
  window.__fx = [];
  // The bot plays by meaning (data-a + data-v), not by where the markup lives (task 27):
  // the same move in the pane of one version and in a window of the other is one move.
  // Layers: the modal, else the workbench, else another window (#win, V2.2), else the game.
  // The workbench is a mode, wherever it is drawn: before V2.3 the bench under the shelf
  // with a lit tile, since V2.3 the window. In it the moves are the bench actions, the
  // neighbour item (sel) and "__closebench" (the lit tile toggled off / the window's ✕).
  // UI_ONLY moves have no twin in older builds and change no game state: never pressed.
  const UI_ONLY = new Set(['filter', 'offerbench', 'benchnav', 'benchback', 'lang']);
  window.__benchView = () => {
    const win = document.getElementById('win');
    if (win && !win.hidden && win.querySelector('[data-a="bench"]')) {
      const nav = [...win.querySelectorAll('[data-a="benchnav"]')].filter(b => !b.disabled).map(b => ({ v: b.dataset.v, el: b }));
      return { root: win, nav, close: document.getElementById('winx') };
    }
    const pane = document.getElementById('pane');
    const on = pane.querySelector('.tile.on[data-a="sel"]');
    const bench = pane.querySelector('.bench');
    if (!on || !bench) return null;
    const tiles = [...pane.querySelectorAll('[data-a="sel"]')];
    const i = tiles.indexOf(on);
    return { root: bench, nav: [tiles[i - 1], tiles[i + 1]].filter(Boolean).map(t => ({ v: t.dataset.v, el: t })), close: on };
  };
  // the item on the bench: the lit tile of the shelf in both versions
  window.__benchUid = () => document.querySelector('#pane .tile.on[data-a="sel"]')?.dataset.v ?? null;
  // The Mac layout (V2.4, html.desk): no pane, its tabs open as the window "pane". That window
  // is the pane, not a layer over the game: with it the game layer is the whole page (#app + the
  // window). The pane is always shown in the other version, so a closed pane window (replaced by
  // the bench or the morning window, or not opened yet) is reopened on the lit tab before a move;
  // a tab is not a save change.
  const isPaneWindow = win => win && !win.hidden && win.dataset.id === 'pane';
  window.__layer = () => {
    const modal = document.getElementById('modal');
    if (!modal.hidden) return modal;
    const bench = __benchView();
    if (bench) return bench.root;
    const win = document.getElementById('win');
    if (isPaneWindow(win)) return document.body;
    return win && !win.hidden ? win : document.getElementById('app');
  };
  /** The game layer (not a modal or a window over it): #app, or the page with the Mac pane window. */
  window.__inGame = () => {
    const layer = __layer();
    return layer.id === 'app' || layer === document.body;
  };
  const showPane = () => {
    if (!document.documentElement.classList.contains('desk')) return;
    const win = document.getElementById('win');
    if (!document.getElementById('modal').hidden || (win && !win.hidden)) return;
    document.querySelector('#tabs .tab.on')?.click();
  };
  window.__botActions = () => {
    showPane();
    const root = __layer();
    const out = [...root.querySelectorAll('[data-a]')]
      .filter(b => !b.disabled && !b.hidden && b.offsetParent !== null && !UI_ONLY.has(b.dataset.a))
      .map(b => ({ a: b.dataset.a, v: b.dataset.v ?? null }));
    const bench = document.getElementById('modal').hidden ? __benchView() : null;
    if (bench) out.push(...bench.nav.map(n => ({ a: 'sel', v: n.v })), { a: '__closebench', v: null });
    // The morning (task 29): before it the window had "Открыть лавку" (close) and the bar "Позвать"
    // (call); since then the window has only ✕ and the bar "Открыть лавку" (openshop = call).
    // One rule for both: ✕ is "close", openshop is "call".
    if (isMorning(root) && !out.some(c => c.a === 'close')) out.push({ a: 'close', v: null });
    return out.map(c => (c.a === 'openshop' ? { a: 'call', v: c.v } : c));
  };
  const isMorning = root => root.id === 'win' && root.dataset.id === 'morning';
  // The bench is open only when a move of the bot opened it (sel, craft). Before V2.3 a purchase
  // selected the new item and the bench showed up on the "Склад" tab by itself; since V2.3 the
  // tile is only lit. One rule for both: a bench the bot did not open is closed after the move.
  let botBench = false;
  const press = c => {
    const bench = document.getElementById('modal').hidden ? __benchView() : null;
    if (bench && c.a === '__closebench') return bench.close.click();
    if (bench && c.a === 'sel') return bench.nav.find(n => n.v === c.v).el.click();
    const before = bench ? __benchUid() : null;
    const layer = __layer();
    if (c.a === 'close' && isMorning(layer) && !layer.querySelector('[data-a="close"]')) return document.getElementById('winx').click();
    if (c.a === 'call' && !layer.querySelector('[data-a="call"]') && layer.querySelector('[data-a="openshop"]')) return layer.querySelector('[data-a="openshop"]').click();
    __layer().querySelector('[data-a="' + c.a + '"]' + (c.v !== null ? '[data-v="' + c.v + '"]' : '')).click();
    if (c.a === 'sel' || c.a === 'craft') botBench = true;
    // the item left the bench (scrapped): since V2.3 the window moves on to the next item,
    // before it the bench was gone. One rule for both: the bench closes.
    const after = __benchView();
    if (before !== null && after && __benchUid() !== before) after.close.click();
  };
  window.__botPress = c => {
    showPane();
    press(c);
    const bench = document.getElementById('modal').hidden ? __benchView() : null;
    if (bench && !botBench) bench.close.click();
    botBench = !!(document.getElementById('modal').hidden ? __benchView() : botBench);
    // the snapshot after the move sees the pane, as in the other version
    showPane();
  };
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains('fx') && __fx.push(n.outerHTML))))
      .observe(document.getElementById('stage'), { childList: true });
  });
  ${presetSave ? `localStorage.setItem('dark-counter-v3', ${JSON.stringify(presetSave)});` : ''}
})();`;

/**
 * Clicks a header action in the page; works on both layouts: before V1.4
 * "сейв" and "⟲" were HUD buttons, since V1.4 they are items of the ☰ menu.
 * Pass to page.evaluate: page.evaluate(clickMenuItem, 'savemenu').
 */
export function clickMenuItem(action) {
  const visible = el => el.offsetParent !== null;
  const direct = [...document.querySelectorAll(`[data-a="${action}"]`)].find(visible);
  if (direct) {
    direct.click();
    return;
  }
  document.querySelector('[data-a="menu"]').click();
  document.querySelector(`#modal [data-a="${action}"]`).click();
}

/** Actions that moved from the HUD into the ☰ menu (V1.4). */
// 'newgame' is left out since the modes update: the reference asks "Начать заново?",
// the candidate opens the mode screen, so the bot would face different buttons.
// A new game is still reached after an ending or an eviction ("newgame-yes").
export const MENU_ACTIONS = ['savemenu'];

/**
 * Polls `check` in the page from Node until it returns a truthy value (or the time is up).
 * Node-side polling: the page's own timers and requestAnimationFrame may be stubbed by deterministicInit.
 */
export async function waitInPage(page, check, arg, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await page.evaluate(check, arg);
    if (value || Date.now() > deadline) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

/**
 * The code in the "Сохранение" window. Since Patch A (DC2) the code is compressed asynchronously
 * and appears in the box a moment after the window opens; older builds fill it at once.
 */
export const savedCode = page => waitInPage(page, () => document.getElementById('savecode')?.value || '');

/**
 * Pastes a code into the loader and presses "Загрузить". Since Patch A the load is asynchronous:
 * waits until the window closes (loaded) or the error line appears (rejected).
 */
export async function loadCodeThroughUi(page, code) {
  await page.evaluate(code => {
    document.getElementById('loadcode').value = code;
    document.querySelector('[data-a="loadsave"]').click();
  }, code);
  await waitInPage(page, () => document.getElementById('modal').hidden || !!document.getElementById('savemsg')?.textContent);
  return page.evaluate(() => ({ modalOpen: !document.getElementById('modal').hidden, msg: document.getElementById('savemsg')?.textContent, hud: document.getElementById('hud').innerText }));
}

/**
 * Since the modes update the very first launch shows the mode screen; the bot
 * plays the story mode ("Начало конца" = the behaviour before modes).
 * Older versions have no such screen: nothing happens.
 */
export async function passModeScreen(page) {
  await page.evaluate(() => {
    const story = document.querySelector('#modal:not([hidden]) [data-a="mode-go"][data-v="story"]');
    // no animation step here: the reference must stay on the same frame
    story?.click();
  });
}

/**
 * Save JSON to compare: the story mode is what saves meant before modes,
 * so mode: 'story' is dropped (the reference has no such field).
 */
export function storySave(raw) {
  if (!raw) return raw;
  const data = JSON.parse(raw);
  if (data.mode === 'story') delete data.mode;
  return JSON.stringify(data);
}

/**
 * Loads every font face up front. Otherwise a weight first used later
 * (e.g. 500 in the speech bubble) may still be downloading when a
 * screenshot is taken — that made screenshots flaky.
 */
export function preloadFonts(page) {
  // Google Fonts splits faces into unicode subsets; without a sample text
  // only the latin subset loads, so pass Cyrillic too.
  const sample = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя ABCabc0123456789…·−×→⚙★☾⧗⚖♪⟲›';
  return page.evaluate(text => Promise.all([
    ...['400', '500', '600'].map(w => document.fonts.load(`${w} 13px "IBM Plex Mono"`, text)),
    document.fonts.load('12px Silkscreen', text), // reference builds before V1.3
    document.fonts.load('16px "Public Pixel"', text),
  ]).then(() => document.fonts.ready).catch(() => {}), sample);
}


/**
 * Task 34: the candidate keeps the log, the bubble and the ending as keys ({k, p} JSON strings).
 * Its window.__dcPlainSave renders them back as Russian text; a build without the hook (the
 * reference before task 34) already has plain text. Saves are compared through it.
 */
export const plainSave = (page, raw) => page.evaluate(r => (window.__dcPlainSave ? window.__dcPlainSave(r) : r), raw);

/** The save codes among input values, decoded (DC1 base64 / DC2 deflate-raw) and compared as plain saves. */
export async function plainValues(page, values) {
  const codes = [...values.matchAll(/DC([12]):([A-Za-z0-9+/=]+)/g)];
  let out = values;
  for (const [whole, version, b64] of codes) {
    try {
      const bytes = Buffer.from(b64, 'base64');
      const json = version === '2' ? zlib.inflateRawSync(bytes).toString('utf8') : bytes.toString('utf8');
      out = out.replace(whole, 'SAVE:' + storySave(await plainSave(page, json)));
    } catch {
      // not a whole code (a pasted fragment): compared as it is
    }
  }
  return out;
}
