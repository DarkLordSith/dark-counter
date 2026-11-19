// =====================================================================
//  star.ts — the "rare" mark (V2.6): a 5×5 pixel star drawn from a map,
//  not a font glyph. ★ rare (lamp), ★̸ fake (wear + fg, for Patch B1:
//  ready, not shown in the game yet). Also: which items and log lines
//  are rare. Pure: no DOM; the SVG is a string, ui.ts puts it in.
// =====================================================================
import { decode, DICTS, mentions } from './i18n';
import { COLOR, MEANING } from './palette';
import type { Item } from './types';

export type StarKind = 'rare' | 'fake';

/** The maps from the task: L = lamp (rare), W = wear, F = fg, "." = transparent. */
export const STAR_MAPS: Record<StarKind, readonly string[]> = {
  rare: [
    '..L..',
    'LLLLL',
    '.LLL.',
    '.L.L.',
    'L...L',
  ],
  fake: [
    '..W.F',
    'WWWFW',
    '.WFW.',
    '.F.W.',
    'F...W',
  ],
};

export const STAR_SIZE = 5;

/** Map letter → color. `L` is the meaning "rare" (= lamp); the fake's cross is plain fg. */
const STAR_COLORS: Record<string, string> = {
  L: MEANING.rare,
  W: MEANING.wear,
  F: COLOR.fg,
};

/** One star pixel: [x, y, w, h, color], the same shape as the scene sprites. */
export type StarRect = readonly [number, number, number, number, string];

/** The star as 1×1 rects, row by row, left to right. */
export function starRects(kind: StarKind): StarRect[] {
  return STAR_MAPS[kind].flatMap((row, y) =>
    [...row].flatMap((cell, x): StarRect[] => cell === '.' ? [] : [[x, y, 1, 1, STAR_COLORS[cell]]]));
}

/** The star as inline SVG, `scale` CSS pixels per star pixel (2 → 10×10 px, sharp at any DPR). */
export function starSvg(kind: StarKind, scale = 2): string {
  const body = starRects(kind).map(([x, y, w, h, color]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`).join('');
  const size = STAR_SIZE * scale;
  return `<svg class="star" viewBox="0 0 ${STAR_SIZE} ${STAR_SIZE}" width="${size}" height="${size}" `
    + `shape-rendering="crispEdges" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** A rare find of the junkyard keeps the mark on the shelf (the `rare` save flag, absent = ordinary). */
export const isRareItem = (item: Item): boolean => item.rare === true;

/** "Редкая находка: " — the start of the rare-find line, before the item name (plain texts of old saves). */
const RARE_PREFIXES = Object.values(DICTS).map(dict => dict.junk.rare.split('{name}')[0]);

/**
 * Whether a stored line (the junkyard bubble, a log entry) tells of a rare find: a message with
 * the junk.rare key, or an old plain text with its start. The star is added when shown, not stored.
 */
export function isRareLine(line: string): boolean {
  const message = decode(line);
  return message ? mentions(message, 'junk.rare') : RARE_PREFIXES.some(prefix => line.includes(prefix));
}
