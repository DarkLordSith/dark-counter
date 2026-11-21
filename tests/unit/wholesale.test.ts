// Task 36: the wholesaler — comes to a full stock, takes a batch of one group "as is" within a budget.
import { describe, expect, it } from 'vitest';
import { mainAction } from '../../src/actionbar';
import { BULK_CATEGORIES, ITEM_CATEGORIES, itemCategory, ITEM_TYPES, MAX_HEAT, WHOLESALE, wholesaleChance } from '../../src/data';
import { clockOf } from '../../src/day';
import {
  bulkPrice, bulkStock, callNextCustomer, canSellBatch, cartItems, cartTotal, customerLeaves, estimatedValue, sellBatch, setDiscount,
  sleepUntilMorning, toggleCart,
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
    name: 'Тест', seed: 1, pat: 5, max: 5, done: {}, msg: '', kind: 'bulk', grp: 'household', bud: 1000, cart: [], off: 0, ...overrides,
  };
  const game = makeState({ inv: items, cust: customer, llDone: true });
  return { game, customer };
}

/** Taps the items not in the basket yet, in order (what fits goes in). */
function fill(game: GameState, customer: WholesaleCustomer, items: Item[]): void {
  items.filter(item => !customer.cart.includes(item.uid)).forEach(item => toggleCart(game, item.uid));
}

const batteries = (n: number, overrides: Partial<Item> = {}): Item[] => Array.from({ length: n }, () => makeItem('battery', { cond: 50, ...overrides }));

/** Mornings out of `nights` when the wholesaler is due today, with `stock` batteries on the shelf; checks his slot. */
function morningsWithWholesaler(stock: number, nights: number): number {
  const rng = mulberry32(stock + 7);
  let count = 0;
  for (let i = 0; i < nights; i++) {
    const game = makeState({ day: 3, phase: 'evening', llDone: true, inv: batteries(stock) });
    sleepUntilMorning(game, rng);
    if (game.bk !== undefined) {
      count++;
      expect(game.bk).toBeGreaterThanOrEqual(0);
      expect(game.bk).toBeLessThan(game.cn);
    }
  }
  return count / nights;
}

describe('when the wholesaler comes (PM 19.11, variant C: on top of the queue, at most once a day)', () => {
  it('the morning decides by the stock: never under 5 items, 30% at 5–7, 90% at 8+', () => {
    expect([0, 1, 4].map(wholesaleChance)).toEqual([0, 0, 0]);
    expect([5, 7].map(wholesaleChance)).toEqual([WHOLESALE.fewChance, WHOLESALE.fewChance]);
    expect([8, 30].map(wholesaleChance)).toEqual([WHOLESALE.manyChance, WHOLESALE.manyChance]);
    expect(morningsWithWholesaler(4, 300)).toBe(0);
    expect(morningsWithWholesaler(6, 1000)).toBeCloseTo(WHOLESALE.fewChance, 1);
    expect(morningsWithWholesaler(10, 1000)).toBeCloseTo(WHOLESALE.manyChance, 1);
  });

  it('a morning without him clears yesterday\'s unused turn', () => {
    const game = makeState({ phase: 'evening', llDone: true, inv: batteries(2), bk: 3 });
    sleepUntilMorning(game, mulberry32(1));
    expect(game.bk).toBeUndefined();
  });

  it('never instead of a buyer: without his turn today a full stock gets ordinary customers only', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 300; i++) {
      const game = makeState({ llDone: true, inv: batteries(12) });
      callNextCustomer(game, rng);
      expect(game.cust?.kind).not.toBe('bulk');
    }
  });

  it('comes once his turn is reached, takes no slot of the day and does not move the clock; then the queue goes on', () => {
    const game = makeState({ llDone: true, inv: batteries(6), slot: 1, bk: 2 });
    callNextCustomer(game, mulberry32(1));
    expect(game.cust?.kind).not.toBe('bulk');
    customerLeaves(game);
    expect(game.slot).toBe(2);
    const clock = clockOf(game).text;
    callNextCustomer(game, mulberry32(2));
    expect(game.cust?.kind).toBe('bulk');
    expect(game.bk).toBeUndefined();
    customerLeaves(game);
    expect(game.slot).toBe(2);
    expect(clockOf(game).text).toBe(clock);
    callNextCustomer(game, mulberry32(3));
    expect(game.cust?.kind).not.toBe('bulk');
  });

  it('skips the day if the stock is under 5 by his turn', () => {
    const game = makeState({ llDone: true, inv: batteries(4), bk: 0 });
    callNextCustomer(game, mulberry32(1));
    expect(game.cust?.kind).not.toBe('bulk');
    expect(game.bk).toBeUndefined();
  });

  it('Grobov goes first when both are due', () => {
    const game = makeState({ llDone: false, nextDue: 3, llAt: 0, inv: batteries(6), bk: 0 });
    callNextCustomer(game, mulberry32(1));
    expect(game.cust?.kind).toBe('rent');
    expect(game.bk).toBe(0);
  });

  it('asks for a group of his stock and brings a budget of 3 × the average estimate × the wholesale share, ±25%', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const game = makeState({ day: 3, slot: 0, cn: 6, llDone: true, inv: [...batteries(6), makeItem('comm', { cond: 80 })], bk: 0 });
      callNextCustomer(game, rng);
      const customer = game.cust;
      if (customer?.kind !== 'bulk') {
        throw new Error('the wholesaler should come at his turn');
      }
      const group = game.inv.filter(item => itemCategory(item.t) === customer.grp);
      const average = group.reduce((sum, item) => sum + estimatedValue(item), 0) / group.length;
      const base = WHOLESALE.budgetItems * average * WHOLESALE.priceShare;
      expect(customer.bud).toBeGreaterThanOrEqual(Math.floor(base * 0.75 / 10) * 10);
      expect(customer.bud).toBeLessThanOrEqual(Math.ceil(base * 1.25 / 10) * 10);
      expect(customer.cart).toEqual([]);
      expect(customer.off).toBe(0);
      expect(shown(customer.msg)).not.toBe('');
    }
  });

  it('task 40: asks for one mass category only (household, electronics, chem), the same as the stock filter', () => {
    expect(BULK_CATEGORIES).toEqual(['household', 'electronics', 'chem']);
    for (const type of Object.keys(ITEM_TYPES) as ItemType[]) {
      expect(matchesFilter(makeItem(type), itemCategory(type))).toBe(true);
    }
    const rng = mulberry32(9);
    const asked = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const inv = [...batteries(5), makeItem('comm'), makeItem('medkit'), makeItem('railgun'), makeItem('arm'), makeItem('coin')];
      const game = makeState({ day: 3, slot: 0, cn: 6, llDone: true, inv, bk: 0 });
      callNextCustomer(game, rng);
      if (game.cust?.kind !== 'bulk') {
        throw new Error('the wholesaler should come at his turn');
      }
      asked.add(game.cust.grp);
    }
    expect([...asked].sort()).toEqual(['chem', 'electronics', 'household']);
    expect(ITEM_CATEGORIES.filter(cat => !(BULK_CATEGORIES as readonly string[]).includes(cat))).toEqual(['weapon', 'implant', 'collectible']);
  });

  it('task 40: only the mass goods bring him — a shelf of weapons and implants does not', () => {
    const heavy = (): Item[] => [...Array.from({ length: 6 }, () => makeItem('railgun')), ...Array.from({ length: 6 }, () => makeItem('arm'))];
    const rng = mulberry32(4);
    for (let i = 0; i < 200; i++) {
      const game = makeState({ day: 3, phase: 'evening', llDone: true, inv: heavy() });
      sleepUntilMorning(game, rng);
      expect(game.bk).toBeUndefined();
    }
    const game = makeState({ llDone: true, inv: heavy(), bk: 0 });
    callNextCustomer(game, mulberry32(1));
    expect(game.cust?.kind).not.toBe('bulk');
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

  it('price = 75% of the estimate, "Итого" never over the budget, at most 5 items', () => {
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
    const { game, customer } = withWholesaler(items, { bud: Math.round(price * 3 * 0.8) });
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
    expect(game.slot).toBe(0);
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
    // task 40: weapons, implants and collectibles do not go to the wholesaler, the shelf keeps ~2 more (1000 seeds: 11.7)
    expect(owner.morningStock!).toBeLessThanOrEqual(13);
    expect(owner.junkSoldInWeek!).toBeGreaterThanOrEqual(70);
    expect(owner.endings.left).toBeGreaterThanOrEqual(50);
    expect(owner.bulkItems!).toBeGreaterThan(0);
    expect(owner.bulkShare!).toBeLessThanOrEqual(30);
    expect(owner.saleIncomeWeek!).toBeGreaterThanOrEqual(3200);
    const careful = runSim(150, STRATEGIES.careful);
    expect(careful.endings.evicted).toBeLessThanOrEqual(10);
  });
});
