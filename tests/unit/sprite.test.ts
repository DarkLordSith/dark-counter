/// <reference types="node" />
// PNG sprites (#23, task 39): every PNG under src/ is in palette A, alpha 0/255, the size of its name.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { BASE } from '../../src/palette';
import { CLEAR, decodeSprite, sizeFromName, SPRITE_ALIASES, spriteRects, TOKENS } from '../../src/sprite';

const ROOT = join(import.meta.dirname, '../..');
const SRC = join(ROOT, 'src');

/**
 * Piskel writes a stray byte after IEND; browsers ignore it, pngjs throws.
 * Cut the file at the end of the IEND chunk before decoding.
 */
function readPng(buffer: Buffer): PNG {
  const iend = buffer.indexOf('IEND', 8, 'latin1');
  return PNG.sync.read(iend > 0 ? buffer.subarray(0, iend + 8) : buffer);
}

/** Problems of one PNG as readable lines; empty = fine. Alias colors are warnings, not problems. */
function checkPng(file: string, buffer: Buffer): { errors: string[]; warnings: string[] } {
  const png = readPng(buffer);
  const errors: string[] = [];
  const size = sizeFromName(file);
  if (!size) {
    errors.push(`${file}: no size in the name (name-32.png or name-10x6.png)`);
  } else if (size.w !== png.width || size.h !== png.height) {
    errors.push(`${file}: ${png.width}×${png.height}, the name says ${size.w}×${size.h}`);
  }
  const { unknown, semi, aliased } = decodeSprite(png.width, png.height, png.data);
  errors.push(...unknown.map(p => `${file} (${p.x},${p.y}): ${p.hex} is not in palette A`));
  errors.push(...semi.map(p => `${file} (${p.x},${p.y}): alpha ${p.a}, only 0 or 255`));
  const warnings = aliased.map(p => `${file} (${p.x},${p.y}): ${p.hex} is the old ${p.token}, re-save with ${BASE[p.token]}`);
  return { errors, warnings };
}

function pngsUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(name => name.endsWith('.png'))
    .map(name => join(dir, name));
}

/** A w×h PNG from a pixel callback, for the bad-file cases. */
function makePng(w: number, h: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      png.data.set(pixel(x, y), (y * w + x) * 4);
    }
  }
  return PNG.sync.write(png);
}

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];

describe('sprite PNGs in src/', () => {
  const files = pngsUnder(SRC);

  it('finds the sprites (Grobov at least)', () => {
    expect(files.map(file => relative(ROOT, file))).toContain('src/sprites/grobov-32.png');
  });

  it.each(files.map(file => [relative(ROOT, file), file]))('%s: size, alpha 0/255, palette A', (name, file) => {
    const { errors, warnings } = checkPng(name, readFileSync(file));
    warnings.forEach(line => console.warn(line));
    expect(errors).toEqual([]);
  });

  it('Grobov: 10 tokens, 400 transparent', () => {
    const png = readPng(readFileSync(join(SRC, 'sprites/grobov-32.png')));
    const { sprite } = decodeSprite(png.width, png.height, png.data);
    expect([...sprite.px].filter(value => value === CLEAR)).toHaveLength(400);
    expect(new Set([...sprite.px].filter(value => value !== CLEAR)).size).toBe(10);
  });
});

describe('the check fails on a bad PNG', () => {
  it('a color outside palette A — with coordinates', () => {
    const bad = makePng(2, 2, (x, y) => (x === 1 && y === 0 ? [125, 131, 146, 255] : [...rgb(BASE.ink), 255]));
    expect(checkPng('src/sprites/bad-2.png', bad).errors).toEqual(['src/sprites/bad-2.png (1,0): #7d8392 is not in palette A']);
  });

  it('a semi-transparent pixel', () => {
    const bad = makePng(2, 2, (x, y) => (x === 0 && y === 1 ? [...rgb(BASE.ink), 128] : [0, 0, 0, 0]));
    expect(checkPng('src/sprites/bad-2.png', bad).errors).toEqual(['src/sprites/bad-2.png (0,1): alpha 128, only 0 or 255']);
  });

  it('a size that does not match the name', () => {
    const bad = makePng(3, 2, () => [0, 0, 0, 0]);
    expect(checkPng('src/sprites/bad-2.png', bad).errors).toEqual(['src/sprites/bad-2.png: 3×2, the name says 2×2']);
  });

  it('tolerates the stray byte Piskel writes after IEND', () => {
    const good = makePng(2, 2, () => [...rgb(BASE.rust), 255]);
    expect(checkPng('src/sprites/ok-2.png', Buffer.concat([good, Buffer.from([0])])).errors).toEqual([]);
  });
});

describe('decodeSprite / spriteRects', () => {
  it('maps exact colors to tokens, nothing "nearest"', () => {
    const data = [...rgb(BASE.skin), 255, ...rgb(BASE.skin).map(c => c + 1), 255, 0, 0, 0, 0];
    const { sprite, unknown } = decodeSprite(3, 1, data);
    expect([...sprite.px]).toEqual([TOKENS.indexOf('skin'), CLEAR, CLEAR]);
    expect(unknown).toHaveLength(1);
  });

  it('draws runs in the current token colors', () => {
    const data = [BASE.ink, BASE.ink, BASE.lamp].flatMap(hex => [...rgb(hex), 255]);
    const { sprite } = decodeSprite(3, 1, data);
    expect(spriteRects(sprite)).toEqual([[0, 0, 2, 1, BASE.ink], [2, 0, 1, 1, BASE.lamp]]);
  });

  it('an alias color maps to its token (reported, not an error)', () => {
    const aliases = SPRITE_ALIASES as Record<string, keyof typeof BASE>;
    aliases['#7d8392'] = 'dim';
    try {
      const { sprite, aliased, unknown } = decodeSprite(1, 1, [125, 131, 146, 255]);
      expect(unknown).toEqual([]);
      expect(aliased).toEqual([{ x: 0, y: 0, hex: '#7d8392', token: 'dim' }]);
      expect(sprite.px[0]).toBe(TOKENS.indexOf('dim'));
    } finally {
      delete aliases['#7d8392'];
    }
  });

  it('sizes from names', () => {
    expect(sizeFromName('grobov-32.png')).toEqual({ w: 32, h: 32 });
    expect(sizeFromName('bell-10x6.png')).toEqual({ w: 10, h: 6 });
    expect(sizeFromName('grobov.png')).toBeNull();
  });
});
