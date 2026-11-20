// =====================================================================
//  sprite.ts — PNG sprites in palette A (#23, task 39), the pure part.
//  A PNG is drawn by hand in Piskel/Aseprite strictly in the 16 base
//  colors (src/dark-counter-palette-A.gpl). Here its RGBA pixels become
//  token indices by exact color match (no "nearest"), and the sprite is
//  drawn with the CURRENT token values: a palette change recolors it
//  without touching the PNG. Loading (Image → canvas → getImageData)
//  lives in scene.ts; the node test reads the same PNGs with pngjs.
//  Bars, meters, highlights and flashes stay code (rects).
// =====================================================================
import { BASE } from './palette';

/** A base color name of palette A. */
export type Token = keyof typeof BASE;

/** Token order: the index stored per pixel. */
export const TOKENS = Object.keys(BASE) as Token[];

/** Pixel value for "transparent". */
export const CLEAR = -1;

/**
 * Former hex of a token → the token: if palette A is refined, PNGs drawn
 * with the old value still map (and the test warns to re-save them).
 * Lowercase '#rrggbb'. Empty for now — the mechanism is there.
 */
export const SPRITE_ALIASES: Readonly<Record<string, Token>> = {};

/** A decoded sprite: row-major token indices, CLEAR for transparent. */
export interface Sprite {
  w: number;
  h: number;
  px: Int8Array;
}

/** A pixel the decoder could not take; skipped (drawn transparent). */
export interface BadPixel {
  x: number;
  y: number;
  /** '#rrggbb' of the pixel. */
  hex: string;
  /** Alpha 0…255: anything but 0 and 255 is a semi-transparent pixel. */
  a: number;
}

/** A pixel matched through SPRITE_ALIASES. */
export interface AliasPixel {
  x: number;
  y: number;
  hex: string;
  token: Token;
}

export interface Decoded {
  sprite: Sprite;
  /** Opaque pixels of a color outside palette A. */
  unknown: BadPixel[];
  /** Pixels with alpha other than 0 or 255. */
  semi: BadPixel[];
  /** Pixels in a former token color (allowed, but worth re-saving). */
  aliased: AliasPixel[];
}

const hexOf = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;

/** Current '#rrggbb' → token index, aliases on top (a current value wins over an alias). */
function colorIndex(): Map<string, { index: number; alias: boolean }> {
  const index = new Map<string, { index: number; alias: boolean }>();
  for (const [hex, token] of Object.entries(SPRITE_ALIASES)) {
    index.set(hex.toLowerCase(), { index: TOKENS.indexOf(token), alias: true });
  }
  TOKENS.forEach((token, i) => index.set(BASE[token].toLowerCase(), { index: i, alias: false }));
  return index;
}

/** RGBA bytes (ImageData.data or pngjs data) → sprite + every pixel it could not take. */
export function decodeSprite(w: number, h: number, rgba: ArrayLike<number>): Decoded {
  const colors = colorIndex();
  const px = new Int8Array(w * h).fill(CLEAR);
  const unknown: BadPixel[] = [];
  const semi: BadPixel[] = [];
  const aliased: AliasPixel[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4;
      const a = rgba[at + 3];
      if (a === 0) {
        continue;
      }
      const hex = hexOf(rgba[at], rgba[at + 1], rgba[at + 2]);
      if (a !== 255) {
        semi.push({ x, y, hex, a });
        continue;
      }
      const match = colors.get(hex);
      if (!match) {
        unknown.push({ x, y, hex, a });
        continue;
      }
      if (match.alias) {
        aliased.push({ x, y, hex, token: TOKENS[match.index] });
      }
      px[y * w + x] = match.index;
    }
  }
  return { sprite: { w, h, px }, unknown, semi, aliased };
}

/** One rectangle [x, y, w, h, color], the same shape scene.ts draws. */
export type SpriteRect = [number, number, number, number, string];

/**
 * The sprite as rects in the current token colors: one rect per horizontal
 * run of a color, so a 32×32 portrait is ~150 fillRects, not 600.
 */
export function spriteRects(sprite: Sprite): SpriteRect[] {
  const rects: SpriteRect[] = [];
  for (let y = 0; y < sprite.h; y++) {
    let x = 0;
    while (x < sprite.w) {
      const value = sprite.px[y * sprite.w + x];
      let end = x + 1;
      while (end < sprite.w && sprite.px[y * sprite.w + end] === value) {
        end++;
      }
      if (value !== CLEAR) {
        rects.push([x, y, end - x, 1, BASE[TOKENS[value]]]);
      }
      x = end;
    }
  }
  return rects;
}

/** Size from the file name: 'grobov-32.png' → 32×32, 'bell-10x6.png' → 10×6; null if the name has none. */
export function sizeFromName(file: string): { w: number; h: number } | null {
  const match = /-(\d+)(?:x(\d+))?\.png$/.exec(file);
  if (!match) {
    return null;
  }
  const w = Number(match[1]);
  return { w, h: match[2] ? Number(match[2]) : w };
}

/**
 * Grobov's portrait in the 24×24 bench frame (V2.3 block, 48 css px = ×2):
 * the 32×32 sprite's head and collar, columns 4–27 and rows 2–25.
 * An integer scale keeps it crisp; the whole sprite at ×2 would need a 64 px block.
 */
export const GROBOV_FACE_CROP = { x: 4, y: 2 } as const;
