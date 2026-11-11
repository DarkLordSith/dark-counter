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
    document.fonts.load('12px Silkscreen', text),
  ]).then(() => document.fonts.ready).catch(() => {}), sample);
}
