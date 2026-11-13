// Weekly rent (hotfix 13.11.2026): the landlord comes on day 7, then every 7 days.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDLORD_SEED, RENT } from '../../src/data';
import { callNextCustomer, closeShop, customerLeaves, isLandlordDue, payRent, sleepUntilMorning } from '../../src/economy';
import { actorReset, newGame, state } from '../../src/state';
import { daysRu, pluralRu } from '../../src/util';
import { makeState } from './helpers';

function seedRandom(seed: number): void {
  let value = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => (value = value * 16807 % 2147483647) / 2147483647);
}

/** Ends the current day without trading. */
function skipDay(): string[] {
  closeShop();
  return sleepUntilMorning();
}

/** Calls customers until the landlord stands at the counter. */
function waitForLandlord(): void {
  for (let guard = 0; guard < 20 && state.cust?.kind !== 'rent'; guard++) {
    if (state.cust) {
      customerLeaves();
    }
    actorReset();
    callNextCustomer();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  actorReset();
});

describe('rent schedule', () => {
  it('uses the weekly numbers', () => {
    expect(RENT).toMatchObject({ start: 750, periodDays: 7, increase: 250 });
  });

  it('new game → the first payment is due on day 7', () => {
    seedRandom(3);
    newGame();
    expect(state).toMatchObject({ day: 1, rent: 750, owed: 750, nextDue: 7 });
    expect(state.log.at(-1)).toContain('раз в 7 дней');
    while (state.day < 7) {
      expect(isLandlordDue()).toBe(false);
      const events = skipDay();
      expect(events.some(event => event.includes('арендодатель'))).toBe(state.day === 7);
    }
    expect(isLandlordDue()).toBe(true);
    waitForLandlord();
    expect(state.cust).toMatchObject({ kind: 'rent', seed: LANDLORD_SEED });
  });

  it('after paying, the next visit is 7 days later and the rent grows by 250', () => {
    makeState({ day: 7, nextDue: 7, rent: 750, owed: 750, credits: 1000 });
    state.cust = { kind: 'rent', name: 'Гробов', seed: LANDLORD_SEED, msg: '', pat: 0, max: 0, done: {} };
    payRent();
    expect(state).toMatchObject({ credits: 250, rent: 1000, owed: 1000, nextDue: 14, llDone: true });
    expect(state.log.at(-1)).toContain('1000 кр. на день 14');
  });
});

describe('pluralRu / daysRu', () => {
  it('picks the Russian plural form', () => {
    expect([1, 2, 5, 7, 11, 12, 21, 22, 25, 101, 111].map(daysRu)).toEqual([
      '1 день', '2 дня', '5 дней', '7 дней', '11 дней', '12 дней', '21 день', '22 дня', '25 дней', '101 день', '111 дней',
    ]);
    expect(pluralRu(0, 'a', 'b', 'c')).toBe('c');
  });
});
