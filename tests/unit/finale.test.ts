// Task 38, "Финал v1": the early flight, the ramp check, the tiers by money on board, the run stats.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FINAL } from '../../src/data';
import {
  buyFromSeller, buySeat, canBuySeat, canLeaveEarly, closeShop, dig, finalTier, goToJunkyard, leaveEarly, payEarly, rampToll,
  sellBatch, sellToBuyer, sleepUntilMorning, toggleCart,
} from '../../src/economy';
import { gameRng, mulberry32 } from '../../src/rng';
import { actorReset, createGame, importSaveCode, migrate } from '../../src/state';
import type { GameState, SavedGame } from '../../src/types';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';
import { makeItem, makePresentedBuyer, makeSeller, makeState, shown } from './helpers';

/** An evening at home with the debt closed and the seat bought: the early flight is possible. */
const ready = (overrides: Partial<GameState> = {}): GameState =>
  makeState({ day: 45, debt: 0, seat: true, phase: 'evening', where: 'home', hours: 5, nextDue: 90, ...overrides });

const rampCheck = FINAL.rampCheck;
afterEach(() => {
  vi.restoreAllMocks();
  actorReset();
  FINAL.rampCheck = rampCheck;
});

describe('the early flight: only with every condition of п.1', () => {
  it('is possible on an evening at home, debt 0, seat bought, before the shuttle', () => {
    expect(canLeaveEarly(ready())).toBe(true);
  });

  it.each<[string, Partial<GameState>]>([
    ['calm "Без таймера"', { mode: 'calm' }],
    ['the debt is not closed', { debt: 100 }],
    ['no seat', { seat: false }],
    ['in the shop by day', { phase: 'shop' }],
    ['at the junkyard', { where: 'junk' }],
    ['on the shuttle day', { day: 60 }],
    ['the game is over', { over: '"x"' }],
  ])('not: %s', (_name, overrides) => {
    const game = ready(overrides);
    expect(canLeaveEarly(game)).toBe(false);
    expect(leaveEarly(game)).toBe(false);
    expect(game.ending).toBeNull();
  });

  it('ends as "left" with the day of departure and its own line', () => {
    const game = ready({ credits: 1800 });
    expect(leaveEarly(game)).toBe(true);
    expect(game).toMatchObject({ ending: 'left', lv: 45, credits: 1800 });
    expect(shown(game.over)).toBe('Грузовой рейс ушёл ночью. Вы на борту. День 45.');
  });

  it('the shuttle of day 60 works as before and keeps lv = shuttleDay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no raid
    const game = makeState({ day: 59, debt: 0, seat: true, nextDue: 63 });
    closeShop(game);
    sleepUntilMorning(game, gameRng);
    expect(game).toMatchObject({ day: 60, ending: 'left', lv: 60 });
    expect(shown(game.over)).toBe(RU.ending.left.line);
  });

  it('a game that stayed has no day of departure', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const game = makeState({ day: 59, debt: 0, seat: false, nextDue: 63 });
    closeShop(game);
    sleepUntilMorning(game, gameRng);
    expect(game.ending).toBe('stayed');
    expect(game.lv).toBeUndefined();
  });
});

describe('the ramp check', () => {
  it('heat at the threshold or more: the patrol takes its share of the money on board', () => {
    const game = ready({ credits: 2000, heat: FINAL.rampHeat });
    expect(rampToll(game)).toBe(500);
    leaveEarly(game);
    expect(game.credits).toBe(1500);
    expect(game.st.toll).toBe(500);
  });

  it('below the threshold: nothing', () => {
    const game = ready({ credits: 2000, heat: FINAL.rampHeat - 1 });
    leaveEarly(game);
    expect(game.credits).toBe(2000);
    expect(game.st.toll).toBeUndefined();
  });

  it('rampCheck = false: nothing, whatever the heat', () => {
    FINAL.rampCheck = false;
    const game = ready({ credits: 2000, heat: 10 });
    expect(rampToll(game)).toBe(0);
    leaveEarly(game);
    expect(game.credits).toBe(2000);
  });

  it('on day 60 too', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const game = makeState({ day: 59, debt: 0, seat: true, nextDue: 63, credits: 4000, heat: 10 });
    closeShop(game);
    const heat = game.heat; // the night cools the heat by one: the check is on the morning's heat
    sleepUntilMorning(game, gameRng);
    expect(game.ending).toBe('left');
    expect(game.st.toll).toBe(heat - 1 >= FINAL.rampHeat ? 1000 : undefined);
  });
});

describe('the tier by money on board', () => {
  it('poor < tierOk ≤ ok < tierRich ≤ rich', () => {
    expect(finalTier(FINAL.tierOk - 1)).toBe('poor');
    expect(finalTier(FINAL.tierOk)).toBe('ok');
    expect(finalTier(FINAL.tierRich - 1)).toBe('ok');
    expect(finalTier(FINAL.tierRich)).toBe('rich');
  });

  it('every tier and the final lines are in both dictionaries', () => {
    expect(Object.keys(EN.final.tier)).toEqual(Object.keys(RU.final.tier));
    expect(EN.ending.left.lineEarly).toContain('{day}');
  });
});

describe('the run stats', () => {
  it('a new game counts from day 1', () => {
    expect(createGame('story', mulberry32(1)).st).toEqual({ from: 1, dc: null, earn: 0, deals: 0, raids: 0, star: null });
  });

  it('sales add to "earned" and every deal is counted: seller, buyer, wholesaler batch', () => {
    const game = makeState({ credits: 1000 });
    game.cust = makeSeller({ ask: 100 });
    buyFromSeller(game);
    const sold = makeItem('battery');
    game.inv.push(sold);
    game.cust = makePresentedBuyer({ item: sold, offer: 120 });
    sellToBuyer(game);
    const batch = [makeItem('cutter'), makeItem('cutter')];
    game.inv.push(...batch);
    game.cust = { name: 'Тест', seed: 1, pat: 5, max: 5, done: {}, msg: '', kind: 'bulk', grp: 'gear', bud: 5000, cart: [], off: 0 };
    batch.forEach(item => toggleCart(game, item.uid));
    const before = game.credits;
    sellBatch(game);
    expect(game.st.deals).toBe(3);
    expect(game.st.earn).toBe(120 + game.credits - before);
  });

  it('the day the debt first reached 0', () => {
    const game = makeState({ day: 30, debt: 500, credits: 800 });
    payEarly(game, 300);
    expect(game.st.dc).toBeNull();
    game.day = 31;
    payEarly(game, 500);
    expect(game.st.dc).toBe(31);
  });

  it('digs and the best ★ find', () => {
    const game = makeState({ phase: 'evening', hours: 5 });
    goToJunkyard(game, gameRng);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValue(0); // one find, rare
    dig(game, gameRng);
    expect(game.st.raids).toBe(1);
    expect(game.st.star).not.toBeNull();
  });
});

describe('a save before the finale (day 42, debt closed)', () => {
  const fixture = import.meta.glob<string>('../fixtures/finale/day42-debt0-dc2.txt', { query: '?raw', import: 'default', eager: true });
  const code = Object.values(fixture)[0].trim();

  it('loads; its stats count from the load day, the debt day is unknown', async () => {
    const game = (await importSaveCode(code))!;
    expect(game).toMatchObject({ day: 42, debt: 0, seat: false, mode: 'story' });
    expect(game.st).toEqual({ from: 42, dc: null, earn: 0, deals: 0, raids: 0, star: null });
  });

  it('the early flight is there once the seat is bought, in the evening', async () => {
    const game = (await importSaveCode(code))!;
    expect(canLeaveEarly(game)).toBe(false); // no seat yet
    game.credits = 5000; // the seat costs 4100 on day 42
    expect(canBuySeat(game)).toBe(true);
    buySeat(game);
    closeShop(game);
    expect(canLeaveEarly(game)).toBe(true);
    expect(leaveEarly(game)).toBe(true);
    expect(game).toMatchObject({ ending: 'left', lv: 42 });
  });

  it('migrate() keeps the stats a newer save already has', () => {
    const game = makeState();
    game.st.deals = 7;
    expect(migrate(structuredClone(game) as SavedGame)?.st.deals).toBe(7);
  });
});
