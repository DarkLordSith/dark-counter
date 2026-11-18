// Stock and the workbench window (V2.3): filter chips, paging ‹ ›, the next item after one is gone,
// "Предложить клиенту" only for a buyer who wants this item, the strings.
import { describe, expect, it } from 'vitest';
import { ITEM_TYPES, STOCK_TEXT } from '../../src/data';
import { benchNav, benchOffer, benchOrder, filterStock, matchesFilter, STOCK_FILTERS, successor } from '../../src/stock';
import { useWorkbench } from '../../src/economy';
import { state, ui } from '../../src/state';
import type { BuyerCustomer, Item } from '../../src/types';
import uiTs from '../../src/ui.ts?raw';
import { makeItem, makePresentedBuyer, makeSeller, makeState } from './helpers';

/** The stock after an item left it. */
const without = (inv: Item[], gone: Item): Item[] => inv.filter(item => item !== gone);
const uids = (items: { uid: number }[]): number[] => items.map(item => item.uid);

function shelf() {
  return [
    makeItem('comm'), // tech
    makeItem('battery', { stolen: true }), // gear, stolen (known)
    makeItem('visor', { stolen: true, k: { cond: false, serial: false, flaw: false } }), // tech, stolen but unchecked
    makeItem('servo'), // gear
    makeItem('chip', { stolen: true }), // tech, stolen
  ];
}

describe('filter chips', () => {
  it('all, electronics, hardware (by the catalog flag), stolen', () => {
    expect(STOCK_FILTERS).toEqual(['all', 'tech', 'gear', 'stolen']);
    const inv = shelf();
    expect(uids(filterStock(inv, 'all'))).toEqual(uids(inv));
    expect(filterStock(inv, 'tech').map(item => item.t)).toEqual(['comm', 'visor', 'chip']);
    expect(filterStock(inv, 'gear').map(item => item.t)).toEqual(['battery', 'servo']);
    // every type is in exactly one category
    for (const type of Object.keys(ITEM_TYPES) as (keyof typeof ITEM_TYPES)[]) {
      const item = makeItem(type);
      expect(Number(matchesFilter(item, 'tech')) + Number(matchesFilter(item, 'gear'))).toBe(1);
    }
  });

  it('"Краденое" is only what the player has found out', () => {
    expect(filterStock(shelf(), 'stolen').map(item => item.t)).toEqual(['battery', 'chip']);
  });

  it('is remembered for the session (ui, not the save)', () => {
    expect(ui.filter).toBe('all');
    const game = makeState({ inv: shelf() });
    expect(JSON.stringify(game)).not.toContain('filter');
  });

  it('one tap: data-a="filter", the chosen chip is lit and pressed', () => {
    expect(uiTs).toContain('data-a="filter" data-v="${filter}" aria-pressed="${on}"');
    expect(uiTs).toMatch(/filter: value => \{\s*if \(isStockFilter\(value\)\) \{\s*ui\.filter = value;/);
  });
});

describe('paging ‹ ›', () => {
  it('stops at the edges, no wrapping', () => {
    const order = [1, 2, 3];
    expect(benchNav(order, 1)).toEqual({ prev: null, next: 2, n: 1, total: 3 });
    expect(benchNav(order, 2)).toEqual({ prev: 1, next: 3, n: 2, total: 3 });
    expect(benchNav(order, 3)).toEqual({ prev: 2, next: null, n: 3, total: 3 });
    expect(benchNav([7], 7)).toEqual({ prev: null, next: null, n: 1, total: 1 });
  });

  it('pages within the filter', () => {
    const inv = shelf();
    const [comm, , visor, , chip] = inv;
    const order = benchOrder(inv, 'tech', visor.uid);
    expect(order).toEqual([comm.uid, visor.uid, chip.uid]);
    expect(benchNav(order, visor.uid)).toMatchObject({ prev: comm.uid, next: chip.uid });
  });

  it('the item on the bench keeps its place when it drops out of the filter', () => {
    const inv = shelf();
    const [, battery, , , chip] = inv;
    makeState({ inv, parts: 9 });
    useWorkbench(state, battery.uid, 'wipe'); // re-stamped: no longer stolen
    expect(matchesFilter(battery, 'stolen')).toBe(false);
    const order = benchOrder(inv, 'stolen', battery.uid);
    expect(order).toEqual([battery.uid, chip.uid]);
    expect(benchNav(order, battery.uid)).toMatchObject({ prev: null, next: chip.uid, n: 1, total: 2 });
  });
});

describe('the bench after its item is gone', () => {
  it('shows the next one, else the previous one, else closes', () => {
    const inv = shelf();
    const order = uids(inv);
    const [a, b, , , e] = inv;
    expect(successor(order, b.uid, without(inv, b))).toBe(inv[2].uid);
    expect(successor(order, e.uid, without(inv, e))).toBe(inv[3].uid);
    expect(successor([a.uid], a.uid, [])).toBeNull();
  });

  it('skips items that left too and keeps to the order it showed (the filter)', () => {
    const inv = shelf();
    const [comm, battery, visor, servo, chip] = inv;
    const order = [comm.uid, visor.uid, chip.uid]; // "Электроника"
    expect(successor(order, visor.uid, [comm, battery, servo])).toBe(comm.uid);
    expect(successor(order, comm.uid, [battery, visor, servo, chip])).toBe(visor.uid);
  });
});

describe('"Предложить клиенту"', () => {
  function buyer(overrides: Partial<BuyerCustomer> = {}): BuyerCustomer {
    return { ...makePresentedBuyer(), item: null, max2: undefined, offer: undefined, want: 'visor', ...overrides };
  }

  it('only for a buyer at the counter who wants this type', () => {
    const visor = makeItem('visor');
    const comm = makeItem('comm');
    const game = makeState({ inv: [visor, comm], cust: buyer() });
    expect(benchOffer(game, visor, true)).toBe('ready');
    expect(benchOffer(game, comm, true)).toBe('none');
    expect(benchOffer(game, visor, false)).toBe('none'); // still walking in
    expect(benchOffer({ ...game, cust: makeSeller() }, visor, true)).toBe('none');
    expect(benchOffer({ ...game, cust: null }, visor, true)).toBe('none');
    expect(benchOffer({ ...game, phase: 'evening' }, visor, true)).toBe('none');
  });

  it('the item already on the counter: "Уже на прилавке"', () => {
    const visor = makeItem('visor');
    const game = makeState({ inv: [visor], cust: buyer({ item: visor }) });
    expect(benchOffer(game, visor, true)).toBe('shown');
  });

  it('presents the item and goes to the counter, where the haggling is', () => {
    expect(uiTs).toMatch(/offerbench: value => \{\s*presentItem\(state, Number\(value\)\);\s*closeWindow\('code'\);\s*showTab\('deal'\);/);
  });
});

describe('the bench window in ui.ts', () => {
  it('a tile opens the bench; it is refreshed in place after every render', () => {
    expect(uiTs).toContain("sel: value => openBench(Number(value))");
    expect(uiTs).toMatch(/refreshBench\(\);\s*const html = \(PANES\[ui\.tab\]/);
    expect(uiTs).toContain('updateWindow(benchSpec(item))');
    expect(uiTs).toContain("id: 'bench'");
    expect(uiTs).toContain('cover: true');
  });

  it('strings RU/EN have the same keys', () => {
    const keys = (value: object): string[] => Object.entries(value).flatMap(([key, inner]) =>
      typeof inner === 'object' ? keys(inner).map(sub => `${key}.${sub}`) : [key]);
    expect(keys(STOCK_TEXT.en)).toEqual(keys(STOCK_TEXT.ru));
  });
});
