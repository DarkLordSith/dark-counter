// Buyers follow the stock (balance 17.11): an empty shop draws sellers, a full one buyers.
import { describe, expect, it } from 'vitest';
import { BUYER_FLOW, buyerShare, CUSTOMER } from '../../src/data';
import { callNextCustomer } from '../../src/economy';
import { mulberry32 } from '../../src/rng';
import { makeItem, makeState } from './helpers';

/** Share of buyers among `visits` visitors with `stock` items on the shelf. */
function buyersAmong(stock: number, visits: number): number {
  const rng = mulberry32(stock + 1);
  let buyers = 0;
  for (let i = 0; i < visits; i++) {
    const inv = Array.from({ length: stock }, (_, uid) => makeItem('battery', { uid: uid + 1 }));
    const game = makeState({ day: 3, slot: 0, cn: 6, llDone: true, inv });
    callNextCustomer(game, rng);
    buyers += game.cust?.kind === 'buy' ? 1 : 0;
  }
  return buyers / visits;
}

describe('buyerShare', () => {
  it('is 0.30 with 0–2 items and 0.65 with 8 or more', () => {
    expect(BUYER_FLOW).toEqual({ few: 2, fewShare: 0.3, many: 8, manyShare: 0.65 });
    for (const stock of [0, 1, 2]) {
      expect(buyerShare(stock)).toBeCloseTo(0.3, 10);
    }
    for (const stock of [8, 9, 30]) {
      expect(buyerShare(stock)).toBeCloseTo(0.65, 10);
    }
  });

  it('grows linearly in between', () => {
    expect(buyerShare(5)).toBeCloseTo(0.475, 10);
    for (let stock = 0; stock < 10; stock++) {
      expect(buyerShare(stock + 1)).toBeGreaterThanOrEqual(buyerShare(stock));
    }
  });

  it('leaves the buyers\' wish for stocked goods as it was', () => {
    expect(CUSTOMER.buyerWantsStockedChance).toBe(0.7);
  });
});

describe('the customer flow follows the stock', () => {
  it('with an empty shelf everybody sells', () => {
    expect(buyersAmong(0, 200)).toBe(0);
  });

  it('few items → about 30% buyers, a full shelf → about 65%', () => {
    expect(buyersAmong(1, 2000)).toBeCloseTo(0.3, 1);
    expect(buyersAmong(10, 2000)).toBeCloseTo(0.65, 1);
  });
});
