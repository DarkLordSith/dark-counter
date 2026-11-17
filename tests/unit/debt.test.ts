// Concept skeleton: the father's debt to Grobov, early payments, the shuttle seat, endings on day 60.
import { gameRng } from '../../src/rng';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEBT, ENDING_TEXT, LANDLORD_SEED } from '../../src/data';
import {
  buySeat, canBuySeat, closeShop, deferRent, evict, isLandlordDue, payEarly, payRent, payWithCollateral, seatPrice, sleepUntilMorning,
} from '../../src/economy';
import { actorReset, newGame, state } from '../../src/state';
import { makeItem, makeState } from './helpers';

const landlordAtCounter = (): void => {
  state.cust = { kind: 'rent', name: 'Гробов', seed: LANDLORD_SEED, msg: '', pat: 0, max: 0, done: {} };
};

/** Pays the weekly payment on its day, with exactly enough money. */
function payOnDueDay(): number {
  state.day = state.nextDue;
  state.credits = state.owed;
  state.llDone = false;
  const paid = state.owed;
  landlordAtCounter();
  payRent(state);
  return paid;
}

function sleep(): string[] {
  closeShop(state);
  return sleepUntilMorning(state, gameRng).events;
}

afterEach(() => {
  vi.restoreAllMocks();
  actorReset();
});

describe('a new game', () => {
  it('starts with a debt of 20 000 and the shuttle on day 60, no buyout (temporary balance 17.11)', () => {
    newGame();
    expect(state).toMatchObject({ debt: 20000, shuttleDay: 60, seat: false, ending: null, over: null });
    expect(state).not.toHaveProperty('won');
    // the numbers picked by `npm run sim:grid` (tests/sim/README.md)
    expect(DEBT).toMatchObject({ start: 20000, firstPayment: 400, paymentStep: 150, shuttleDay: 60, seatBase: 2000, seatPerDay: 50, legacyStart: 25000 });
  });
});

describe('weekly payment', () => {
  it('reduces the debt', () => {
    makeState({ day: 7, nextDue: 7, rent: 400, owed: 400, credits: 400, debt: 25000 });
    landlordAtCounter();
    payRent(state);
    expect(state).toMatchObject({ debt: 24600, credits: 0 });
  });

  it('follows 400, 550, 700, 850 … every 7 days', () => {
    newGame();
    const paid = [payOnDueDay(), payOnDueDay(), payOnDueDay(), payOnDueDay()];
    expect(paid).toEqual([400, 550, 700, 850]);
    expect(state.nextDue).toBe(35);
    expect(state.debt).toBe(20000 - 2500);
  });

  it('paid with goods also comes off the debt', () => {
    makeState({ day: 7, nextDue: 7, rent: 400, owed: 400, credits: 100, debt: 5000, inv: [makeItem('arm')] });
    landlordAtCounter();
    payWithCollateral(state);
    expect(state.debt).toBe(4600);
  });

  it('never asks for more than the debt left; with no debt Grobov stops coming', () => {
    makeState({ day: 7, nextDue: 7, rent: 400, owed: 400, credits: 1000, debt: 500 });
    landlordAtCounter();
    payRent(state);
    expect(state).toMatchObject({ debt: 100, owed: 100 });
    payOnDueDay();
    expect(state.debt).toBe(0);
    state.day = state.nextDue;
    state.llDone = false;
    expect(isLandlordDue(state)).toBe(false);
  });
});

describe('deferral', () => {
  it('puts the +20% fine onto the debt', () => {
    makeState({ day: 7, nextDue: 7, rent: 400, owed: 400, credits: 0, debt: 25000 });
    landlordAtCounter();
    deferRent(state);
    expect(state).toMatchObject({ owed: 480, debt: 25080, deferred: true, nextDue: 9 });
    // paying the bigger payment later: the fine was a cost, only 400 of the father's debt is gone
    payOnDueDay();
    expect(state.debt).toBe(24600);
  });

  it('eviction stays: it is the "evicted" ending', () => {
    makeState({ day: 9, nextDue: 9, owed: 480, deferred: true, credits: 0 });
    landlordAtCounter();
    evict(state);
    expect(state).toMatchObject({ ending: 'evicted', over: ENDING_TEXT.ru.evicted.line, cust: null });
  });
});

describe('early payment', () => {
  it('reduces the debt by the step, any day', () => {
    makeState({ day: 3, credits: 700, debt: 25000 });
    expect(payEarly(state, 500)).toBe(500);
    expect(state).toMatchObject({ credits: 200, debt: 24500 });
    expect(payEarly(state, 500)).toBe(200); // no more than the credits
    expect(state).toMatchObject({ credits: 0, debt: 24300 });
    expect(payEarly(state, 100)).toBe(0);
  });

  it('no more than the debt; the weekly payment shrinks to what is left', () => {
    makeState({ day: 3, credits: 5000, debt: 300, owed: 650 });
    expect(payEarly(state, 5000)).toBe(300);
    expect(state).toMatchObject({ credits: 4700, debt: 0, owed: 0 });
    expect(state.log[0]).toContain('выплачен');
  });

  it('does nothing after the game has ended', () => {
    makeState({ credits: 500, debt: 1000, over: 'конец', ending: 'stayed' });
    expect(payEarly(state, 100)).toBe(0);
    expect(state.debt).toBe(1000);
  });
});

describe('shuttle seat', () => {
  it('costs 2000 + 50 × day', () => {
    expect(seatPrice(1)).toBe(2050);
    expect(seatPrice(30)).toBe(3500);
    expect(seatPrice(59)).toBe(4950);
  });

  it('is not sold while there is any debt', () => {
    makeState({ day: 20, credits: 99999, debt: 1 });
    expect(canBuySeat(state)).toBe(false);
    expect(buySeat(state)).toBe(false);
    expect(state.seat).toBe(false);
  });

  it('is sold at zero debt for the price of the day, once', () => {
    makeState({ day: 20, credits: 5000, debt: 0 });
    expect(buySeat(state)).toBe(true);
    expect(state).toMatchObject({ seat: true, credits: 2000 });
    expect(buySeat(state)).toBe(false);
    expect(state.credits).toBe(2000);
  });

  it('needs the money', () => {
    makeState({ day: 20, credits: 2999, debt: 0 });
    expect(canBuySeat(state)).toBe(false);
  });
});

describe('endings on day 60', () => {
  it('with a seat → "left"', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // no raid
    makeState({ day: 59, debt: 0, seat: true, nextDue: 63 });
    const events = sleep();
    expect(state).toMatchObject({ day: 60, ending: 'left', over: ENDING_TEXT.ru.left.line });
    expect(events).toEqual([ENDING_TEXT.ru.left.line]);
  });

  it('without a seat → "stayed", even with the debt paid', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    makeState({ day: 59, debt: 0, seat: false, nextDue: 63 });
    sleep();
    expect(state).toMatchObject({ day: 60, ending: 'stayed' });
  });

  it('not before day 60; reminders a week and a day before', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    makeState({ day: 52, nextDue: 90 });
    expect(sleep().some(event => event.includes('7 дней'))).toBe(true);
    expect(state.ending).toBeNull();
    state.day = 58;
    expect(sleep().some(event => event.includes('1 день'))).toBe(true);
    expect(state.ending).toBeNull();
  });

  it('uses the save\'s shuttle day (old saves get a later one)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    makeState({ day: 60, shuttleDay: 71, nextDue: 90 });
    sleep();
    expect(state.ending).toBeNull();
  });

  it('betray and takeover exist as strings but nothing reaches them yet', () => {
    expect(Object.keys(ENDING_TEXT.ru)).toEqual(['left', 'stayed', 'evicted', 'betray', 'takeover']);
    expect(Object.keys(ENDING_TEXT.en)).toEqual(Object.keys(ENDING_TEXT.ru));
  });
});
