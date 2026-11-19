// Task 36: the wholesaler — comes to a full stock, takes a batch of one group "as is" within a budget.
import { describe, expect, it } from 'vitest';
import { mainAction } from '../../src/actionbar';
import { buyerShare, itemGroup, MAX_HEAT, WHOLESALE, wholesaleShare } from '../../src/data';
import {
  bulkPrice, bulkStock, callNextCustomer, canSellBatch, cartItems, cartTotal, customerLeaves, estimatedValue, sellBatch, setDiscount,
  toggleCart,
} from '../../src/economy';
import { mulberry32 } from '../../src/rng';
import { exportSave, importSave } from '../../src/state';
import { matchesFilter } from '../../src/stock';
import type { GameState, Item, ItemType, WholesaleCustomer } from '../../src/types';
import { logLines, makeItem, makeState, shown } from './helpers';
import { runSim, STRATEGIES } from '../sim/sim';

const idle = { phase: 'idle' } as const;

/** A game with `stock` items on the shelf and a wholesaler of `grp` at the counter. */
function withWholesaler(items: Item[], overrides: Partial<WholesaleCustomer> = {}): { game: GameState; customer: WholesaleCustomer } {
  const customer: WholesaleCustomer = {
    name: 'Тест', seed: 1, pat: 5, max: 5, done: {}, msg: '', kind: 'bulk', grp: 'gear', bud: 1000, cart: [], off: 0, ...overrides,
  };
  const game = makeState({ inv: items, cust: customer, llDone: true });
  return { game, customer };
}

/** Taps the items not in the basket yet, in order (what fits goes in). */
function fill(game: GameState, customer: WholesaleCustomer, items: Item[]): void {
  items.filter(item => !customer.cart.includes(item.uid)).forEach(item => toggleCart(game, item.uid));
}

const batteries = (n: number, overrides: Partial<Item> = {}): Item[] => Array.from({ length: n }, () => makeItem('battery', { cond: 50, ...overrides }));

/** Visitors of `kind` among `visits` with `stock` batteries on the shelf. */
function shareOf(kind: 'buy' | 'bulk', stock: number, visits: number): number {
  const rng = mulberry32(stock + 7);
  let count = 0;
  for (let i = 0; i < visits; i++) {
    const game = makeState({ day: 3, slot: 0, cn: 6, llDone: true, inv: batteries(stock) });
    callNextCustomer(game, rng);
    count += game.cust?.kind === kind ? 1 : 0;
  }
  return count / visits;
}

describe('when the wholesaler comes', () => {
  it('never to a stock under 5 items; 20% of the buyers at 5–7, 40% at 8+', () => {
    expect([0, 1, 4].map(wholesaleShare)).toEqual([0, 0, 0]);
    expect([5, 7].map(wholesaleShare)).toEqual([0.2, 0.2]);
    expect([8, 30].map(wholesaleShare)).toEqual([WHOLESALE.manyShare, WHOLESALE.manyShare]);
    expect(shareOf('bulk', 4, 1000)).toBe(0);
  });

  it('is a share of the buyers: buyers and wholesalers together still follow BUYER_FLOW', () => {
    const visits = 3000;
    for (const stock of [6, 10]) {
      const bulk = shareOf('bulk', stock, visits);
      const buyers = shareOf('buy', stock, visits);
      expect(bulk).toBeCloseTo(buyerShare(stock) * wholesaleShare(stock), 1);
      expect(bulk + buyers).toBeCloseTo(buyerShare(stock), 1);
    }
  });

  it('asks for a group of his stock and brings a budget of 3 × the average estimate × the wholesale share, ±25%', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const game = makeState({ day: 3, slot: 0, cn: 6, llDone: true, inv: [...batteries(6), makeItem('comm', { cond: 80 })] });
      callNextCustomer(game, rng);
      const customer = game.cust;
      if (customer?.kind !== 'bulk') {
        continue;
      }
      const group = game.inv.filter(item => itemGroup(item.t) === customer.grp);
      const average = group.reduce((sum, item) => sum + estimatedValue(item), 0) / group.length;
      const base = WHOLESALE.budgetItems * average * WHOLESALE.priceShare;
      expect(customer.bud).toBeGreaterThanOrEqual(Math.floor(base * 0.75 / 10) * 10);
      expect(customer.bud).toBeLessThanOrEqual(Math.ceil(base * 1.25 / 10) * 10);
      expect(customer.cart).toEqual([]);
      expect(customer.off).toBe(0);
      expect(shown(customer.msg)).not.toBe('');
    }
  });

  it('groups: electronics and hardware by the catalog flag, the same as the stock filters', () => {
    const types: ItemType[] = ['comm', 'battery', 'servo', 'cutter', 'visor', 'drone', 'chip', 'arm'];
    expect(types.filter(type => itemGroup(type) === 'tech')).toEqual(['comm', 'visor', 'drone', 'chip', 'arm']);
    for (const type of types) {
      expect(matchesFilter(makeItem(type), itemGroup(type))).toBe(true);
    }
  });
});

describe('the basket', () => {
  it('a tap puts an item of his group in, a second tap takes it out; other groups are not his', () => {
    const comm = makeItem('comm');
    const { game, customer } = withWholesaler([...batteries(3), comm]);
    expect(bulkStock(game, customer)).toHaveLength(3);
    const uid = game.inv[0].uid;
    expect(toggleCart(game, uid)).toBe(true);
    expect(customer.cart).toEqual([uid]);
    expect(toggleCart(game, uid)).toBe(true);
    expect(customer.cart).toEqual([]);
    expect(toggleCart(game, comm.uid)).toBe(false);
  });

  it('price = 80% of the estimate, "Итого" never over the budget, at most 5 items', () => {
    const items = batteries(7);
    const price = bulkPrice(items[0]);
    expect(price).toBe(Math.round(estimatedValue(items[0]) * WHOLESALE.priceShare));
    const { game, customer } = withWholesaler(items, { bud: price * 2 });
    items.forEach(item => toggleCart(game, item.uid));
    expect(cartItems(game, customer)).toHaveLength(2);
    expect(shown(customer.msg)).toBe('Не, на это бюджета не хватит.');
    customer.bud = 100000;
    fill(game, customer, items);
    expect(cartItems(game, customer).length).toBeLessThanOrEqual(WHOLESALE.maxItems);
    expect(shown(customer.msg)).toBe('Хватит. Больше 5 не унесу.');
  });

  it('−10% / −20% on the whole basket lets more in; the same button takes it back unless it would break the budget', () => {
    const items = batteries(4);
    const price = bulkPrice(items[0]);
    const { game, customer } = withWholesaler(items, { bud: Math.floor(price * 3 * 0.8) });
    items.forEach(item => toggleCart(game, item.uid));
    expect(customer.cart).toHaveLength(2);
    expect(setDiscount(game, 20)).toBe(true);
    fill(game, customer, items);
    expect(customer.cart).toHaveLength(3);
    expect(cartTotal(cartItems(game, customer), 20)).toBe(Math.round(price * 3 * 0.8));
    // back to 0% or 10%: three items no longer fit
    expect(setDiscount(game, 20)).toBe(false);
    expect(setDiscount(game, 10)).toBe(false);
    expect(customer.off).toBe(20);
    expect(setDiscount(game, 15)).toBe(false);
  });

  it('an item scrapped meanwhile leaves the basket by itself', () => {
    const items = batteries(3);
    const { game, customer } = withWholesaler(items);
    items.forEach(item => toggleCart(game, item.uid));
    game.inv = game.inv.slice(1);
    expect(cartItems(game, customer)).toHaveLength(2);
  });
});

describe('selling the batch', () => {
  it('pays "Итого", takes the items, logs the batch, leaves', () => {
    const items = batteries(3);
    const { game, customer } = withWholesaler(items);
    items.forEach(item => toggleCart(game, item.uid));
    setDiscount(game, 10);
    const total = cartTotal(cartItems(game, customer), 10);
    expect(sellBatch(game)).toHaveLength(3);
    expect(game.credits).toBe(400 + total);
    expect(game.inv).toEqual([]);
    expect(game.cust).toBeNull();
    expect(game.slot).toBe(1);
    expect(logLines(game)[0]).toContain(`за ${total} кр.`);
  });

  it('stolen and AI items cost heat as ordinary sales do: +1 each stolen, +2 each infected (PM 19.11: no laundering)', () => {
    const items = [...batteries(2, { stolen: true }), makeItem('battery', { infected: true, cond: 50 }), makeItem('battery', { cond: 50 })];
    const { game } = withWholesaler(items);
    items.forEach(item => toggleCart(game, item.uid));
    sellBatch(game);
    expect(game.heat).toBe(2 + 2);
    expect(logLines(game)[0]).toContain('Краденое ушло дальше.');
    expect(logLines(game)[0]).toContain('заражена ИИ');
  });

  it('…unknown to the player or not, and never over the top of the scale', () => {
    const items = batteries(5, { stolen: true, k: { cond: true, serial: false, flaw: false } });
    const { game } = withWholesaler(items, { bud: 100000 });
    game.heat = 8;
    items.forEach(item => toggleCart(game, item.uid));
    sellBatch(game);
    expect(game.heat).toBe(MAX_HEAT);
  });

  it('"Отказать": he leaves without a fine', () => {
    const { game } = withWholesaler(batteries(5));
    customerLeaves(game);
    expect(game.cust).toBeNull();
    expect(game.heat).toBe(0);
    expect(game.credits).toBe(400);
  });

  it('nothing to sell with an empty basket', () => {
    const { game } = withWholesaler(batteries(5));
    expect(canSellBatch(game)).toBe(false);
    expect(sellBatch(game)).toEqual([]);
    expect(game.cust).not.toBeNull();
  });
});

describe('the screen', () => {
  it('the action bar: a hint until the basket holds something, then "Продать за N"; no goods left — "Отказать"', () => {
    const items = batteries(5);
    const { game, customer } = withWholesaler(items);
    expect(mainAction(game, idle, 'deal')).toEqual({ kind: 'hint', text: 'Выберите вещи для оптовика' });
    toggleCart(game, items[0].uid);
    expect(mainAction(game, idle, 'deal')).toMatchObject({ kind: 'button', action: 'bulksell', label: `Продать за ${bulkPrice(items[0])} кр.` });
    game.inv = [makeItem('comm')];
    expect(bulkStock(game, customer)).toEqual([]);
    expect(mainAction(game, idle, 'deal')).toMatchObject({ kind: 'button', action: 'refuse', label: 'Отказать' });
  });

  it('a save with the wholesaler at the counter keeps his basket and discount', () => {
    const items = batteries(5);
    const { game } = withWholesaler(items);
    toggleCart(game, items[0].uid);
    setDiscount(game, 10);
    const loaded = importSave(exportSave(game));
    expect(loaded?.cust).toEqual(game.cust);
  });
});

describe('the balance bot with the wholesaler (short run; the criteria are for 1000 seeds, see the report)', () => {
  it('owner: the stock does not pile up, junkyard finds sell within a week', () => {
    const owner = runSim(150, STRATEGIES.owner);
    expect(owner.morningStock!).toBeLessThanOrEqual(12);
    expect(owner.junkSoldInWeek!).toBeGreaterThanOrEqual(70);
    expect(owner.endings.left).toBeGreaterThanOrEqual(50);
    expect(owner.bulkItems!).toBeGreaterThan(0);
    const careful = runSim(150, STRATEGIES.careful);
    expect(careful.endings.evicted).toBeLessThanOrEqual(10);
  });
});
