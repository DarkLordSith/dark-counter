// =====================================================================
//  backpack.ts — the junkyard backpack (task 35, v3), the pure part: a
//  grid of JUNK.backpackSize places (4×2); the finds of this visit fill
//  it in the order they were dug up, a thrown-out find frees its place.
//  Parts are not tiles (HUD counter). ui.ts draws the grid in the
//  junkyard pane with the item tiles of tile.ts, Vitest checks the rules.
// =====================================================================
import { JUNK } from './data';
import type { Item, JunkVisit } from './types';

/** Columns of the backpack grid (2 rows of 4: fits an iPhone SE without scrolling). */
export const BACKPACK_COLUMNS = 4;

export type BackpackSlot = { kind: 'item'; item: Item } | { kind: 'empty' };

/** Finds of this visit still in the stock, in the order they were dug up. */
export function backpackFinds(visit: JunkVisit, inv: readonly Item[]): Item[] {
  return visit.f.map(uid => inv.find(item => item.uid === uid)).filter((item): item is Item => item !== undefined);
}

/** The places of the backpack: the finds first, then empty places up to `size`. */
export function backpackSlots(visit: JunkVisit, inv: readonly Item[], size: number = JUNK.backpackSize): BackpackSlot[] {
  const slots: BackpackSlot[] = backpackFinds(visit, inv).map(item => ({ kind: 'item', item }));
  while (slots.length < size) {
    slots.push({ kind: 'empty' });
  }
  return slots;
}
