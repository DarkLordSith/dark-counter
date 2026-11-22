// Task 42 («Играбельная v1», п.4): the shop's fame — the customer flow grows with it, never shrinks below the week.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_FLOW, FAME, fameFlow, fameStars, itemCategory, PREMIUM_CATEGORIES, premiumWish } from '../../src/data';
import { customersToday } from '../../src/day';
import { askBuyer, callNextCustomer, closeShop, offerToSeller, presentItem, sellToBuyer, sleepUntilMorning } from '../../src/economy';
import { gameRng, mulberry32 } from '../../src/rng';
import { createGame, importSaveCode, migrate } from '../../src/state';
import type { BuyerCustomer, GameState, SavedGame } from '../../src/types';
import { playGame, STRATEGIES } from '../sim/sim';
import { makeItem, makePresentedBuyer, makeSeller, makeState } from './helpers';
import uiTs from '../../src/ui.ts?raw';
import realDay42 from '../fixtures/finale/day42-real-dc2.txt?raw';

afterEach(() => vi.restoreAllMocks());

describe('stars and what they give', () => {
  it('1–5 stars by 20 points; a new game starts at 20 (★2)', () => {
    expect([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(fameStars)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(createGame('story', mulberry32(1))).toMatchObject({ fame: FAME.start, cr: 0, fd: { s: FAME.start, g: 0, w: 0, l: 0 } });
  });

  it('extra customers: ★1–2 none, ★3 +1, ★4 +2, ★5 +3', () => {
    expect([10, 30, 50, 70, 90].map(fameFlow)).toEqual([0, 0, 1, 2, 3]);
  });

  it('the flow never goes below the week: any fame, any weekday, wanted or not', () => {
    for (let day = 1; day <= 14; day++) {
      for (const heat of [0, CUSTOMER_FLOW.heatShy]) {
        for (const cr of [-1, 0, 1]) {
          const base = customersToday(makeState({ day, nextDue: 7, heat, cr, fame: 0 })).count;
          for (let fame = 0; fame <= 100; fame += 5) {
            expect(customersToday(makeState({ day, nextDue: 7, heat, cr, fame })).count).toBeGreaterThanOrEqual(base);
          }
        }
      }
    }
  });

  it('the reasons of the day: the chance and the fame; while wanted the fame draws nobody', () => {
    const famous = customersToday(makeState({ day: 3, nextDue: 7, fame: 70, cr: -1 }));
    expect(famous.reasons).toEqual([{ key: 'chance', n: -1 }, { key: 'fame', n: 2 }]);
    expect(famous.count).toBe(6 - 1 + 2);
    const wanted = customersToday(makeState({ day: 3, nextDue: 7, fame: 70, heat: CUSTOMER_FLOW.heatShy }));
    expect(wanted.reasons.map(reason => reason.key)).toEqual(['heat']);
  });

  it('the dear categories: as now at ★1, twice the weight at ★5 (1 of 4 stocked: the share 0.26 → 0.38)', () => {
    expect(premiumWish(0)).toBe(1);
    expect(premiumWish(100)).toBe(FAME.premiumMax);
    const wishes = (fame: number): number => {
      const rng = mulberry32(42);
      let premium = 0;
      let buyers = 0;
      for (let i = 0; i < 2000; i++) {
        const game = makeState({ fame, inv: [makeItem('ration'), makeItem('battery'), makeItem('cutter'), makeItem('lamp')] });
        callNextCustomer(game, rng);
        const customer = game.cust as BuyerCustomer | null;
        if (customer?.kind === 'buy') {
          buyers++;
          premium += PREMIUM_CATEGORIES.includes(itemCategory(customer.want)) ? 1 : 0;
        }
      }
      return premium / buyers;
    };
    expect(wishes(90)).toBeGreaterThan(wishes(0) * 1.35);
  });
});

describe('what moves the fame', () => {
  const buyerWith = (game: GameState, rare = false): void => {
    const item = makeItem('battery', rare ? { rare: true } : {});
    game.inv.push(item);
    game.cust = makePresentedBuyer({ item, offer: 60, max2: 100 });
  };

  it('a sale: +2 without an insult, +1 after one, +3 for a rare find', () => {
    const game = makeState();
    buyerWith(game);
    sellToBuyer(game);
    expect(game.fame).toBe(22);
    expect(game.fd.g).toBe(1);
    buyerWith(game);
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // refuses
    askBuyer(game, 1000, gameRng); // an insult
    expect(game.cust?.ins).toBe(1);
    sellToBuyer(game);
    expect(game.fame).toBe(23);
    expect(game.fd.g).toBe(1);
    buyerWith(game, true);
    sellToBuyer(game);
    expect(game.fame).toBe(26);
  });

  it('a customer walking out, patience gone: −1; never more than −5 in a day', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const game = makeState({ credits: 5000 });
    for (let i = 0; i < 8; i++) {
      game.cust = makeSeller({ pat: 1, ask: 300, min: 200 });
      offerToSeller(game, 250, gameRng);
      expect(game.cust).toBeNull();
    }
    expect(game.fd.w).toBe(8);
    expect(game.fame).toBe(20 - FAME.dayLossCap);
  });

  it('the morning: above 20 it slides back, yesterday becomes the report, a new tally starts', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const game = makeState({ fame: 50, fd: { s: 40, g: 5, w: 1, l: 1 }, phase: 'evening', nextDue: 7 });
    closeShop(game);
    const report = sleepUntilMorning(game, gameRng);
    expect(game.fame).toBe(50 - Math.round(30 * FAME.decayShare));
    expect(report.fame).toEqual({ from: 40, to: game.fame, good: 5, walked: 1 });
    expect(game.fd).toEqual({ s: game.fame, g: 0, w: 0, l: 0 });
    expect(game.cr).toBe(0); // Math.random 0.5 → the middle of −1…+1
  });
});

describe('saves and determinism', () => {
  it('an older save gets fame 20, no chance today, a fresh tally', () => {
    const old = structuredClone(makeState()) as Partial<GameState>;
    delete old.fame;
    delete old.cr;
    delete old.fd;
    expect(migrate(old as SavedGame)).toMatchObject({ fame: 20, cr: 0, fd: { s: 20, g: 0, w: 0, l: 0 } });
    // a save of this build keeps its own
    expect(migrate(structuredClone(makeState({ fame: 63, cr: 1 })) as SavedGame)).toMatchObject({ fame: 63, cr: 1 });
  });

  it('the real day-42 save loads with fame 20', async () => {
    const game = (await importSaveCode(realDay42.trim()))!;
    expect(game).toMatchObject({ day: 42, fame: 20, cr: 0 });
  });

  it('the same seed plays the same game (the chance of the day is the rules\' rng)', () => {
    expect(playGame(7, STRATEGIES.owner)).toEqual(playGame(7, STRATEGIES.owner));
    const counts = (seed: number): number[] => playGame(seed, STRATEGIES.owner).dayCustomers;
    expect(counts(3)).toEqual(counts(3));
    expect(counts(3)).not.toEqual(counts(4));
  });
});

describe('the screen', () => {
  it('the morning window has the fame line, ☰ has «Лавка»', () => {
    expect(uiTs).toMatch(/report\.fame \? fameMorningLine\(report\.fame\)/);
    expect(uiTs).toMatch(/data-a="fame"/);
    expect(uiTs).toMatch(/fame: \(\) => openFame\(\)/);
  });
});

it('presentItem stays a pure rule (no fame on showing)', () => {
  const game = makeState();
  const item = makeItem('battery');
  game.inv.push(item);
  game.cust = { ...makePresentedBuyer(), item: null, offer: undefined, max2: undefined } as unknown as BuyerCustomer;
  presentItem(game, item.uid);
  expect(game.fame).toBe(20);
});
