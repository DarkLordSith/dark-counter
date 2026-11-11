// Shows where two screenshots differ: prints the bounding box and writes
// out/shotdiff.png (both crops side by side, 3× zoom).
// Usage: node pixdiff.mjs <a.png> <b.png>
import fs from 'node:fs';
import { launch } from './common.mjs';

const [, , FILE_A, FILE_B] = process.argv;
const b = await launch();
const p = await b.newPage();
const A = fs.readFileSync(FILE_A).toString('base64'), B = fs.readFileSync(FILE_B).toString('base64');
const r = await p.evaluate(async (A, B) => {
  const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
  const [ia, ib] = await Promise.all([load(A), load(B)]);
  const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; const g = c.getContext('2d');
  g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
  g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i+1] !== db[i+1] || da[i+2] !== db[i+2]) { n++; const x = (i/4) % c.width, y = Math.floor(i/4/c.width); x0 = Math.min(x0,x); y0 = Math.min(y0,y); x1 = Math.max(x1,x); y1 = Math.max(y1,y); }
  const pad = 30, bx = Math.max(0, x0-pad), by = Math.max(0, y0-pad), w = Math.min(c.width, x1+pad) - bx, h = Math.min(c.height, y1+pad) - by;
  const o = document.createElement('canvas'); o.width = (w*2+6)*3; o.height = h*3; const og = o.getContext('2d'); og.imageSmoothingEnabled = false;
  og.fillStyle = 'red'; og.fillRect(0,0,o.width,o.height);
  og.drawImage(ia, bx, by, w, h, 0, 0, w*3, h*3); og.drawImage(ib, bx, by, w, h, (w+6)*3, 0, w*3, h*3);
  if (!n) return { n };
  return { n, box: [x0, y0, x1, y1], png: o.toDataURL().split(',')[1] };
}, A, B);
if (r.n) {
  fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('./out/shotdiff.png', import.meta.url), Buffer.from(r.png, 'base64'));
}
console.log('differing pixels', r.n, r.n ? 'bbox ' + r.box + ' → out/shotdiff.png' : '');
await b.close();
