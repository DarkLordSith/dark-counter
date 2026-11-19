// The day (task 16): the station week and the customers it brings, the wanted level,
// the late opening after digs past midnight, the game clock in the scene chip.
import { gameRng } from '../../src/rng';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chipIsNight, chipLines } from '../../src/actionbar';
import { CLOCK, CUSTOMER_FLOW, CUSTOMERS_BY_WEEKDAY, CUSTOMERS_PER_DAY, DEBT, EVENING_HOURS, JUNK, WEEKDAY_REASONS } from '../../src/data';

import { clockOf, customersToday, formatHour, openingHour, weekdayOf } from '../../src/day';
import { callNextCustomer, canGoToJunkyard, closeShop, customerLeaves, dig, digIsLate, goHome, goToJunkyard, sleepUntilMorning } from '../../src/economy';
import { actor, actorReset, migrate, newGame, state } from '../../src/state';
import type { GameState, SavedGame } from '../../src/types';
import uiTs from '../../src/ui.ts?raw';
import { makeState, logLines } from './helpers';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A quiet night: no raid, no drone, nothing found. */
const quiet = (): void => void vi.spyOn(Math, 'random').mockReturnValue(0.99);

describe('the station week', () => {
  it('brings 42 customers, as 6 a day did, with payday at 10 and the payment day at 4', () => {
    expect(CUSTOMERS_BY_WEEKDAY.reduce((sum, n) => sum + n, 0)).toBe(CUSTOMERS_PER_DAY * 7);
    expect(CUSTOMERS_BY_WEEKDAY).toEqual([5, 5, 6, 6, 10, 6, 4]);
    expect(CUSTOMERS_BY_WEEKDAY).toHaveLength(DEBT.periodDays);
    // every day that differs from a usual one has its reason
    CUSTOMERS_BY_WEEKDAY.forEach((n, i) => expect(!!WEEKDAY_REASONS[i]).toBe(n !== CUSTOMERS_PER_DAY));
  });

  it('day 7 of the week is the day Grobov comes', () => {
    const game = makeState({ day: 7, nextDue: 7 });
    expect(weekdayOf(game)).toBe(7);
    expect(weekdayOf({ ...game, day: 1 })).toBe(1);
    expect(weekdayOf({ ...game, day: 5 })).toBe(5);
    // paid on day 7: the next payment is on 14, the rest of day 7 is still day 7
    expect(weekdayOf({ ...game, day: 7, nextDue: 14 })).toBe(7);
    expect(weekdayOf({ ...game, day: 8, nextDue: 14 })).toBe(1);
  });

  it('a deferral moves the payment day, and the week restarts from it', () => {
    // deferred on day 7 for 2 days: day 9 is the payment day, day 10 the first of the next week
    expect(weekdayOf({ day: 9, nextDue: 9, debt: 1000 })).toBe(7);
    expect(weekdayOf({ day: 10, nextDue: 16, debt: 1000 })).toBe(1);
  });

  it('with the debt closed (calm mode) it is counted from the day of the game', () => {
    expect(weekdayOf({ day: 12, nextDue: 3, debt: 0 })).toBe(5);
    expect(weekdayOf({ day: 14, nextDue: 3, debt: 0 })).toBe(7);
  });

  it('payday brings 10, the start of the week 5, the payment day 4 — each with its reason', () => {
    expect(customersToday(makeState({ day: 5, nextDue: 7 }))).toEqual({ count: 10, reasons: [{ key: 'payday', n: 4 }] });
    expect(customersToday(makeState({ day: 1, nextDue: 7 }))).toEqual({ count: 5, reasons: [{ key: 'quiet', n: -1 }] });
    expect(customersToday(makeState({ day: 7, nextDue: 7 }))).toEqual({ count: 4, reasons: [{ key: 'saving', n: -2 }] });
    expect(customersToday(makeState({ day: 3, nextDue: 7 }))).toEqual({ count: 6, reasons: [] });
  });
});

describe('fewer customers', () => {
  it('a high wanted level keeps one honest buyer away', () => {
    const calm = customersToday(makeState({ day: 3, nextDue: 7, heat: CUSTOMER_FLOW.heatShy - 1 }));
    const hot = customersToday(makeState({ day: 3, nextDue: 7, heat: CUSTOMER_FLOW.heatShy }));
    expect(calm.count).toBe(6);
    expect(hot).toEqual({ count: 5, reasons: [{ key: 'heat', n: -1 }] });
  });

  it('the reasons add up: payday, the wanted level and two digs past midnight', () => {
    const today = customersToday(makeState({ day: 5, nextDue: 7, heat: 8, late: 2 }));
    expect(today.reasons.map(reason => reason.key)).toEqual(['payday', 'heat', 'late']);
    expect(today.count).toBe(6 + 4 - 1 - 2);
  });

  it('never fewer than the minimum, the reasons are still listed', () => {
    expect(CUSTOMER_FLOW.minPerDay).toBeGreaterThanOrEqual(2);
    const today = customersToday(makeState({ day: 7, nextDue: 7, heat: 9, late: 5 }));
    expect(today.count).toBe(CUSTOMER_FLOW.minPerDay);
    expect(today.reasons).toHaveLength(3);
  });
});

describe('the clock', () => {
  it('runs the shift from 08:00 to 19:00 by the customers served', () => {
    makeState({ phase: 'shop', slot: 0, cn: 6 });
    expect(clockOf(state).text).toBe('08:00');
    state.slot = 3;
    expect(clockOf(state).text).toBe('13:30');
    state.slot = 6;
    expect(clockOf(state).text).toBe('19:00');
    expect(CLOCK.shiftEnd + EVENING_HOURS).toBe(CLOCK.midnight);
    expect(EVENING_HOURS).toBe(5);
  });

  it('runs faster on payday: 10 customers share the same shift', () => {
    makeState({ phase: 'shop', slot: 1, cn: 10 });
    expect(clockOf(state).text).toBe('09:06');
  });

  it('opens 2 h later for every dig past midnight', () => {
    expect(openingHour({ late: 0 })).toBe(8);
    expect(openingHour({ late: 2 })).toBe(12);
    expect(openingHour({ late: 9 })).toBe(CLOCK.latestOpen);
    makeState({ phase: 'shop', slot: 0, cn: 4, late: 2 });
    expect(clockOf(state).text).toBe('12:00');
  });

  it('shows the evening from 19:00 and past midnight as night', () => {
    makeState({ phase: 'evening', hours: EVENING_HOURS });
    expect(clockOf(state)).toMatchObject({ text: '19:00', night: false });
    state.hours = 1;
    expect(clockOf(state)).toMatchObject({ text: '23:00', night: false });
    state.hours = 0;
    expect(clockOf(state)).toMatchObject({ text: '00:00', night: true });
    state.late = 2;
    expect(clockOf(state).text).toBe('02:00');
    expect(formatHour(24.5)).toBe('00:30');
  });

  it('is the first thing in the scene chip, tinted `wear` past midnight', () => {
    makeState({ phase: 'shop', slot: 3, cn: 6, nextDue: 7 });
    expect(chipLines(state)).toEqual(['13:30', 'ОЧЕРЕДЬ: 3']);
    makeState({ phase: 'evening', hours: 3 });
    expect(chipLines(state)).toEqual(['21:00 · ВЕЧЕР']);
    expect(chipIsNight(state)).toBe(false);
    state.where = 'junk';
    state.hours = 0;
    state.late = 1;
    expect(chipLines(state)).toEqual(['01:00 · НОЧЬ']);
    expect(chipIsNight(state)).toBe(true);
    expect(uiTs).toContain(`i === 0 && night ? ' class="m-wear"' : ''`);
  });
});

describe('digs past midnight', () => {
  const evening = (): void => {
    makeState({ phase: 'evening', hours: EVENING_HOURS, day: 3, nextDue: 7 });
    goToJunkyard(state, gameRng);
  };

  it('the road takes an hour, four digs fit the evening, the fifth goes past midnight', () => {
    quiet();
    evening();
    expect(state.hours).toBe(EVENING_HOURS - JUNK.travelHours);
    dig(state, gameRng);
    dig(state, gameRng);
    dig(state, gameRng);
    expect(digIsLate(state)).toBe(false);
    dig(state, gameRng);
    expect(state.hours).toBe(0);
    expect(state.late).toBe(0);
    expect(digIsLate(state)).toBe(true);
    dig(state, gameRng);
    expect(state.late).toBe(1);
  });

  it('the shop opens later next morning and the queue is shorter', () => {
    quiet();
    evening();
    for (let i = 0; i < 5; i++) {
      dig(state, gameRng);
    }
    goHome(state);
    const { events } = sleepUntilMorning(state, gameRng);
    expect(state.day).toBe(4);
    expect(state.cn).toBe(CUSTOMERS_PER_DAY - 1);
    // in the log (the ticker), not in the morning list: the window shows it as a reason
    expect(logLines(state)).toContain('Д4: Проспал после свалки: лавка открылась позже, клиентов на 1 меньше.');
    expect(logLines(state)).toContain('Д4: Лавка открылась в 10:00.');
    expect(events.join(' ')).not.toContain('Проспал');
    expect(chipLines(state)).toEqual(['10:00', 'ОЧЕРЕДЬ: 5']);
    // the late opening lasts the day; closing the shop starts a new evening count
    closeShop(state);
    expect(state.late).toBe(0);
  });

  it('a junkyard visit needs the road and at least one dig before midnight', () => {
    makeState({ phase: 'evening', hours: JUNK.travelHours + JUNK.digHours });
    expect(canGoToJunkyard(state)).toBe(true);
    state.hours = JUNK.travelHours;
    expect(canGoToJunkyard(state)).toBe(false);
  });

  it('the panel warns before midnight and after it, in `wear`', () => {
    expect(uiTs).toContain("t('junk.pastMidnight')");
    expect(uiTs).toContain("t('junk.lastFree')");
    expect(uiTs).toContain('<div class="hint m-wear">');
  });
});

describe('a day with fewer customers', () => {
  it('ends the queue at today\'s number', () => {
    quiet();
    makeState({ day: 7, nextDue: 14, cn: 4, llDone: true });
    actorReset();
    let served = 0;
    for (let i = 0; i < 10; i++) {
      callNextCustomer(state, gameRng);
      if (!state.cust) {
        break;
      }
      customerLeaves(state);
      actor.phase = 'empty';
      served++;
    }
    expect(served).toBe(4);
    expect(chipLines(state)).toEqual(['19:00', 'СМЕНА ОКОНЧЕНА']);
  });

  it('the morning sets today\'s customers by the morning wanted level (after the night cools it)', () => {
    quiet();
    makeState({ phase: 'evening', day: 3, nextDue: 7, heat: CUSTOMER_FLOW.heatShy });
    sleepUntilMorning(state, gameRng);
    // heat cooled to 6 overnight: no "wanted" reason on day 4
    expect(state.cn).toBe(6);
    makeState({ phase: 'evening', day: 4, nextDue: 7, heat: CUSTOMER_FLOW.heatShy + 1 });
    sleepUntilMorning(state, gameRng);
    expect(state.cn).toBe(10 - 1); // day 5 is payday, still wanted
  });

  it('a new game starts on day 1 of the week: a quiet day of 5', () => {
    newGame('story');
    expect(state.cn).toBe(5);
    expect(weekdayOf(state)).toBe(1);
  });
});

describe('old saves', () => {
  it('keep 6 customers today and open at 08:00; the week starts next morning', () => {
    const old = { ...makeState({ day: 4, nextDue: 7 }) } as Partial<GameState>;
    delete old.cn;
    delete old.late;
    const migrated = migrate(old as SavedGame);
    expect(migrated).toMatchObject({ cn: CUSTOMERS_PER_DAY, late: 0 });
    // the weekday comes from the day and the payment day, no new field
    expect(weekdayOf(migrated!)).toBe(4);
  });
});

describe('the evening of 19:00–24:00 (task 17)', () => {
  it('an old save in the middle of the evening keeps its hours, and its clock reads the same', () => {
    // hours are "left until midnight": 2 h left was 22:00 in the 20:00 evening and is 22:00 now
    const migrated = migrate({ ...makeState({ phase: 'evening', hours: 2 }) } as SavedGame);
    expect(migrated?.hours).toBe(2);
    expect(clockOf(migrated!).text).toBe('22:00');
  });

  it('the junkyard is open while the road and one dig fit before midnight', () => {
    makeState({ phase: 'evening', hours: EVENING_HOURS });
    expect(canGoToJunkyard(state)).toBe(true);
    state.hours = JUNK.travelHours + JUNK.digHours;
    expect(canGoToJunkyard(state)).toBe(true);
    state.hours -= 1;
    expect(canGoToJunkyard(state)).toBe(false);
  });
});

describe('strings', () => {
  it('RU and EN have the same day words and reasons', () => {
    expect(Object.keys(EN.day).sort()).toEqual(Object.keys(RU.day).sort());
    expect(Object.keys(EN.day.reasons).sort()).toEqual(Object.keys(RU.day.reasons).sort());
    WEEKDAY_REASONS.filter(Boolean).forEach(key => expect(RU.day.reasons).toHaveProperty(key));
  });

  it('the morning window says how many customers are expected and why', () => {
    expect(uiTs).toContain('${expectedCustomers()}<ul>');
    expect(uiTs).toContain('<li class="m-wear">${t(`day.reasons.${reason.key}`, { time })} (${signed(reason.n)})</li>');
    expect(RU.day.expected).toBe('Ожидается клиентов: {n}');
  });
});
