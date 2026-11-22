// Task 44, «знание = деньги»: a check never makes a deal worse — the reveal lowers the seller's prices more
// than the risk costs at the sale, the buyers and the wholesaler pay by what they see, not by what the player knows.
import { describe, expect, it } from 'vitest';
import { INSPECT, VALUE, WHOLESALE } from '../../src/data';
import { bulkPrice, callNextCustomer, estimatedValue, inspect, sellerChecks } from '../../src/economy';
import { mulberry32 } from '../../src/rng';
import type { GameState, SellerCustomer } from '../../src/types';
import { playGame, SIM_OPTIONS, STRATEGIES } from '../sim/sim';
import { makeItem, makeState } from './helpers';

/** Sellers of a seeded day, each at its own counter. */
function sellers(count: number): GameState[] {
  const rng = mulberry32(44);
  const games: GameState[] = [];
  while (games.length < count) {
    const game = makeState({ inv: [] });
    callNextCustomer(game, rng);
    if (game.cust?.kind === 'sell') {
      games.push(game);
    }
  }
  return games;
}

describe('a check never makes the deal worse', () => {
  it('on 300 seeded sellers: after every check of the category the ask and the lowest price never go up', () => {
    let revealed = 0;
    for (const game of sellers(300)) {
      const customer = game.cust as SellerCustomer;
      const { ask, min } = customer;
      sellerChecks(customer).forEach(check => inspect(game, check));
      expect(customer.ask).toBeLessThanOrEqual(ask);
      expect(customer.min).toBeLessThanOrEqual(min);
      revealed += customer.min < min ? 1 : 0;
    }
    expect(revealed).toBeGreaterThan(20);
  });

  it('a found risk costs the seller more than the sale: the lowest price drops below what the risk takes off', () => {
    expect(INSPECT.defectMinMult).toBeLessThanOrEqual(VALUE.buyerDefectMult);
    expect(INSPECT.stolenMinMult).toBeLessThanOrEqual(VALUE.knownStolenMult);
    expect(INSPECT.infectedMinMult).toBeLessThanOrEqual(VALUE.knownInfectedMult);
  });

  it('the estimate of a known risk is what it fetches (a defect as the buyer pays), not the seller\'s dumping price', () => {
    const clean = estimatedValue(makeItem('visor', { cond: 80 }));
    expect(estimatedValue(makeItem('visor', { cond: 80, defect: true }))).toBe(Math.round(clean * VALUE.knownDefectMult));
    expect(estimatedValue(makeItem('visor', { cond: 80, infected: true }))).toBe(Math.round(clean * VALUE.knownInfectedMult));
  });

  it('the wholesaler pays "as is": a known risk and an unknown one fetch the same', () => {
    const known = makeItem('comm', { cond: 70, defect: true, infected: true });
    const unknown = makeItem('comm', { cond: 70, defect: true, infected: true, k: { cond: true, serial: false, flaw: false } });
    expect(bulkPrice(known)).toBe(bulkPrice(unknown));
    expect(bulkPrice(known)).toBe(Math.round(bulkPrice(makeItem('comm', { cond: 70 }))));
    expect(WHOLESALE.priceShare).toBe(0.75);
  });

  it('the owner bot with all three level-1 devices for free ends richer than without them (60 seeds)', () => {
    const net = (give: typeof SIM_OPTIONS.give): number => {
      SIM_OPTIONS.give = give;
      SIM_OPTIONS.devices = false;
      try {
        return Array.from({ length: 60 }, (_, i) => playGame(i + 1, STRATEGIES.owner).netEnd).reduce((a, b) => a + b, 0);
      } finally {
        SIM_OPTIONS.give = [];
        SIM_OPTIONS.devices = true;
      }
    };
    expect(net(['serial', 'scan', 'diag'])).toBeGreaterThanOrEqual(net([]));
  });
});
