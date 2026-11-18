// =====================================================================
//  backpack.ts — the junkyard backpack (task 29), the pure part: one row
//  of slots, one per dig of the visit; the finds of this visit fill it
//  from the left, the drone's catch leaves a trace in its slot until the
//  visit ends (the tiles do not shift). Parts are not tiles (HUD counter).
//  Not in the save: the trace is remembered by ui.ts for the session.
//  ui.ts draws the row in the junkyard pane, Vitest checks the rules.
// =====================================================================
import { isRareItem } from './star';
import type { Item, ItemType, JunkVisit } from './types';

/** The drone took a find: where it was in the row and what it was. `seed` is the visit's heap seed. */
export interface DroneTrace {
  seed: number;
  index: number;
  type: ItemType;
}

export type BackpackSlot =
  /** A find of this visit: ★ rare, ✕ broken (every other junkyard find is a broken one). */
  | { kind: 'item'; item: Item; mark: 'rare' | 'broken' }
  /** The drone took it: an empty slot with a `risk` outline. */
  | { kind: 'gone'; type: ItemType }
  | { kind: 'empty' };

/** Finds of this visit still in the stock, in the order they were dug up. */
export function backpackFinds(visit: JunkVisit, inv: readonly Item[]): Item[] {
  return visit.f.map(uid => inv.find(item => item.uid === uid)).filter((item): item is Item => item !== undefined);
}

/**
 * Slots of the row: `digs` of them (digsPerVisit: the drone ends the visit early, the row stays as long),
 * finds first, the drone's trace in its place.
 */
export function backpackSlots(visit: JunkVisit, inv: readonly Item[], trace: DroneTrace | null, digs: number): BackpackSlot[] {
  const slots: BackpackSlot[] = backpackFinds(visit, inv)
    .map(item => ({ kind: 'item', item, mark: isRareItem(item) ? 'rare' : 'broken' }));
  if (trace && trace.seed === visit.s) {
    slots.splice(Math.min(trace.index, slots.length), 0, { kind: 'gone', type: trace.type });
  }
  const total = Math.max(digs, visit.dp + visit.d, slots.length);
  while (slots.length < total) {
    slots.push({ kind: 'empty' });
  }
  return slots;
}

/**
 * What the drone took on this dig, from the finds before it (uid → type) and the visit after it.
 * Null when it took nothing (no finds: the wanted level went up instead).
 */
export function droneTrace(before: readonly Pick<Item, 'uid' | 't'>[], visit: JunkVisit): DroneTrace | null {
  const index = before.findIndex(item => !visit.f.includes(item.uid));
  return index < 0 ? null : { seed: visit.s, index, type: before[index].t };
}
