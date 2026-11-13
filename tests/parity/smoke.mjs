// Smoke test in a real browser (no fakes): iPhone viewport, service worker on.
// Checks: no page scroll, no console errors, a customer can be called,
// every save in tests/fixtures/ loads through the save menu,
// offline reload works from the SW cache. Saves out/mobile.png.
// Usage: node smoke.mjs <url>
import fs from 'node:fs';
import { launch } from './common.mjs';

const [, , TARGET_URL] = process.argv;
const OUT = new URL('./out/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await launch();
const context = await browser.createBrowserContext();
const page = await context.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));

await page.goto(TARGET_URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => navigator.serviceWorker.ready);
const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const files = [];
  for (const name of names) {
    for (const request of await (await caches.open(name)).keys()) files.push(new URL(request.url).pathname);
  }
  return { names, files };
});
console.log('caches:', cached.names.join(', '));
console.log('cached files:', cached.files.join(' '));

await page.click('#callBtn');
await wait(2500);
const layout = await page.evaluate(() => ({
  scrollHeight: document.scrollingElement.scrollHeight,
  innerHeight,
  scrollWidth: document.scrollingElement.scrollWidth,
  innerWidth,
}));
const noScroll = layout.scrollHeight <= layout.innerHeight && layout.scrollWidth <= layout.innerWidth;
console.log('no page scroll:', noScroll, JSON.stringify(layout));
await page.screenshot({ path: new URL('mobile.png', OUT).pathname });

// every fixture save code loads through the UI and opens on its day
const fixturesDir = new URL('../fixtures/', import.meta.url);
let fixturesOk = true;
for (const file of fs.existsSync(fixturesDir) ? fs.readdirSync(fixturesDir).filter(f => f.endsWith('.txt')).sort() : []) {
  const code = fs.readFileSync(new URL(file, fixturesDir), 'utf8');
  const day = JSON.parse(Buffer.from(code.trim().replace(/\s+/g, '').slice(4), 'base64').toString('utf8')).day;
  const result = await page.evaluate(code => {
    document.querySelector('[data-a="savemenu"]').click();
    document.getElementById('loadcode').value = code;
    document.querySelector('[data-a="loadsave"]').click();
    return { modalOpen: !document.getElementById('modal').hidden, hud: document.getElementById('hud').innerText };
  }, code);
  // the day number and the phase word may be separate elements (V1.3): allow whitespace between them
  const ok = !result.modalOpen && new RegExp(`(^|\\D)${day}\\s*·`).test(result.hud);
  fixturesOk &&= ok;
  console.log(`fixture ${file}: day ${day} → ${ok ? 'loaded' : 'FAILED'}`);
}

await page.setOfflineMode(true);
await page.reload({ waitUntil: 'load' });
await wait(800);
const offlineOk = await page.evaluate(() => !!document.querySelector('#tabs .tab') && document.getElementById('hud').innerText.length > 0);
console.log('offline reload works:', offlineOk);
console.log('console errors:', errors.length ? errors : 'none');

await browser.close();
process.exit(noScroll && offlineOk && fixturesOk && !errors.length ? 0 : 1);
