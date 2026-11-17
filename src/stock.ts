// =====================================================================
//  stock.ts — the stock and the workbench window (V2.3), the pure part:
//  filter chips, paging ‹ › through the filtered stock, which item the
//  bench shows after its item is gone, and whether "Предложить клиенту"
//  applies. No DOM, no globals: ui.ts passes the game and draws the result.
// =====================================================================
import { ITEM_TYPES } from './data';
import type { GameState, Item, StockFilter } from './types';

/** Chips in the order of the row. Categories come from the catalog's `electronic` flag (the only grouping in the data). */
export const STOCK_FILTERS: readonly StockFilter[] = ['all', 'tech', 'gear', 'stolen'];

export function matchesFilter(item: Item, filter: StockFilter): boolean {
  switch (filter) {
    case 'tech':
      return !!ITEM_TYPES[item.t].electronic;
    case 'gear':
      return !ITEM_TYPES[item.t].electronic;
    case 'stolen':
      // only what the player knows: an unchecked serial is not "stolen" yet
      return item.k.serial && item.stolen;
    default:
      return true;
  }
}

export const filterStock = (inv: readonly Item[], filter: StockFilter): Item[] => inv.filter(item => matchesFilter(item, filter));

/**
 * The items the bench pages through: the filtered stock in shelf order. The item on the bench stays in it
 * at its shelf place even when it no longer fits the filter (a re-stamped serial leaves "Краденое").
 */
export function benchOrder(inv: readonly Item[], filter: StockFilter, uid: number | null): number[] {
  return inv.filter(item => item.uid === uid || matchesFilter(item, filter)).map(item => item.uid);
}

export interface BenchNav {
  prev: number | null;
  next: number | null;
  /** 1-based place of the item in the order (0 if it is not there). */
  n: number;
  total: number;
}

/** ‹ › of the bench: no wrapping, an arrow at the edge is off. */
export function benchNav(order: readonly number[], uid: number): BenchNav {
  const index = order.indexOf(uid);
  return {
    prev: index > 0 ? order[index - 1] : null,
    next: index >= 0 && index < order.length - 1 ? order[index + 1] : null,
    n: index + 1,
    total: order.length,
  };
}

/**
 * The item on the bench is gone (sold, scrapped, taken): the next one of the order the bench showed,
 * else the previous one, else null (the window closes).
 */
export function successor(order: readonly number[], gone: number, inv: readonly Item[]): number | null {
  const left = new Set(inv.map(item => item.uid));
  const index = order.indexOf(gone);
  const after = order.slice(index + 1).find(uid => left.has(uid));
  if (after !== undefined) {
    return after;
  }
  const before = order.slice(0, Math.max(0, index)).reverse().find(uid => left.has(uid));
  return before ?? null;
}

/** "Предложить клиенту" on the bench: 'none' — no button, 'ready' — it offers, 'shown' — this item is already on the counter. */
export type BenchOffer = 'none' | 'ready' | 'shown';

/** A buyer at the counter (`atCounter`: the figure stands there) who wants this item's type. */
export function benchOffer(state: GameState, item: Item, atCounter: boolean): BenchOffer {
  const customer = state.cust;
  if (!atCounter || state.phase !== 'shop' || customer?.kind !== 'buy' || customer.want !== item.t) {
    return 'none';
  }
  return customer.item?.uid === item.uid ? 'shown' : 'ready';
}
