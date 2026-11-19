// =====================================================================
//  tile.ts — the one item tile (task 35): the stock, the junkyard
//  backpack and the seller's item at the counter look the same. The
//  pure part: what the corners say. Top left — the condition "37%", or
//  "?" until it is checked; top right — one status mark, the most
//  dangerous one known: ◉ AI > ▲ stolen > ★̸ fake > ✕ broken > ★ rare.
//  The price stays under the tile (the owner's choice 19.11). ui.ts
//  builds the HTML (itemTile), Vitest checks the rules.
// =====================================================================
import { isRareItem } from './star';
import type { Item } from './types';

/** Status marks of a tile, the most dangerous first. `fake` waits for Patch B1 (fakes): never shown yet. */
export const TILE_MARKS = ['ai', 'stolen', 'fake', 'broken', 'rare'] as const;
export type TileMark = (typeof TILE_MARKS)[number];

/** Whether the player knows the item has this mark (a hidden problem shows only after its check). */
const HAS_MARK: Record<TileMark, (item: Item) => boolean> = {
  ai: item => item.k.flaw && item.infected,
  stolen: item => item.k.serial && item.stolen,
  fake: () => false,
  broken: item => item.k.flaw && item.defect,
  rare: isRareItem,
};

/** The one mark in the top right corner, or null. No separate "?": the unknown condition says it. */
export function tileMark(item: Item): TileMark | null {
  return TILE_MARKS.find(mark => HAS_MARK[mark](item)) ?? null;
}

/** The top left corner: the condition in %, or null while it is not checked ("?" on the tile). */
export const tileCondition = (item: Item): number | null => item.k.cond ? item.cond : null;
