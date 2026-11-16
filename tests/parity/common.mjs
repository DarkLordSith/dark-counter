// Shared helpers for the parity scripts.
import puppeteer from 'puppeteer-core';
import crypto from 'node:crypto';
import fs from 'node:fs';

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
  let now = 1000;
  const queue = [];
  performance.now = () => now;
  window.requestAnimationFrame = cb => { queue.push(cb); return queue.length; };
  window.__step = n => { for (let i = 0; i < n; i++) { now += 1000 / 60; queue.splice(0).forEach(cb => cb(now)); } };
  window.__fx = [];
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

/** The same for save codes among input values: the "Сохранение" window (savecode) and a pasted code (loadcode). */
export function storyValues(values) {
  return values.replace(/DC1:([A-Za-z0-9+/=]+)/g, (whole, b64) => {
    try {
      return 'DC1:' + Buffer.from(storySave(Buffer.from(b64, 'base64').toString('utf8')), 'utf8').toString('base64');
    } catch {
      return whole;
    }
  });
}
