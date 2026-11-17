// Daily expenses (Patch A, task 22): every morning the shop's energy, on the first day of
// the station week also the deck fee; what the credits do not cover goes onto the debt.
import { describe, expect, it } from 'vitest';
import { EXPENSES } from '../../src/data';
import { expenseLines, expensesToday, payExpenses, sleepUntilMorning } from '../../src/economy';
import { mulberry32 } from '../../src/rng';
import uiTs from '../../src/ui.ts?raw';
import { makeState } from './helpers';

/** Evening of `day`, Grobov's next visit on `nextDue`; no heat, so no raid. */
const evening = (day: number, nextDue: number, credits: number) =>
  makeState({ phase: 'evening', day, nextDue, credits, heat: 0, debt: 20000 });

describe('the morning bills', () => {
  it('energy is paid every morning and shows in the log', () => {
    const state = evening(3, 7, 500);
    const { expenses } = sleepUntilMorning(state, mulberry32(1));
    expect(expenses).toEqual({ energy: EXPENSES.energyPerDay, tier: 0, paid: EXPENSES.energyPerDay, shortfall: 0, toDebt: 0 });
    expect(state.credits).toBe(500 - EXPENSES.energyPerDay);
    expect(state.debt).toBe(20000);
    expect(state.log.some(line => line.endsWith('Расходы: энергия −20 кр.'))).toBe(true);
  });

  it('the deck fee comes on the first day of the station week (the morning after the payment day)', () => {
    // day 7 was the payment day, Grobov's next visit is on day 14: morning of day 8 is weekday 1
    const state = evening(7, 14, 500);
    const { expenses } = sleepUntilMorning(state, mulberry32(1));
    expect(expenses?.tier).toBe(EXPENSES.tierFee);
    expect(state.credits).toBe(500 - EXPENSES.energyPerDay - EXPENSES.tierFee);
    expect(state.log.some(line => line.endsWith('Расходы: энергия −20 кр., взнос ярусу −50 кр.'))).toBe(true);
  });

  it('without enough credits the rest goes onto the debt, with a line of its own', () => {
    const state = makeState({ day: 8, nextDue: 14, credits: 30, debt: 20000 });
    const paid = payExpenses(state)!;
    expect(paid).toEqual({ energy: 20, tier: 50, paid: 30, shortfall: 40, toDebt: 40 });
    expect(state.credits).toBe(0);
    expect(state.debt).toBe(20040);
    expect(expenseLines(paid, state.debt).shortfall).toBe('Не хватило 40 кр.: ушло в долг, долг 20040 кр.');
  });

  it('with no credits at all the whole bill is debt; nothing goes below zero', () => {
    const state = makeState({ day: 3, nextDue: 7, credits: 0, debt: 0, mode: 'story' });
    payExpenses(state);
    expect(state.credits).toBe(0);
    expect(state.debt).toBe(EXPENSES.energyPerDay);
  });

  it('once the seat is bought, the shortfall does not go onto the debt (the seat is never at risk)', () => {
    const state = makeState({ day: 52, nextDue: 56, credits: 5, debt: 0, seat: true });
    const paid = payExpenses(state)!;
    expect(paid).toEqual({ energy: 20, tier: 0, paid: 5, shortfall: 15, toDebt: 0 });
    expect(state).toMatchObject({ credits: 0, debt: 0, seat: true });
    expect(expenseLines(paid, state.debt).shortfall).toBe('Не хватило 15 кр. В долг не пишут: место на шаттле оплачено.');
  });

  it('a whole night after the seat: the morning leaves the debt at zero', () => {
    const state = makeState({ phase: 'evening', day: 55, nextDue: 56, credits: 0, debt: 0, seat: true, heat: 0 });
    const { expenses } = sleepUntilMorning(state, mulberry32(1));
    expect(expenses?.toDebt).toBe(0);
    expect(state.debt).toBe(0);
    expect(state.over).toBeNull();
  });

  it('calm with the debt closed pays no bills (the shop goes on without payments)', () => {
    const state = makeState({ mode: 'calm', debt: 0, credits: 100 });
    expect(payExpenses(state)).toBeNull();
    expect(state.credits).toBe(100);
  });

  it('the shuttle morning ends the game before any bill', () => {
    const state = makeState({ phase: 'evening', day: 59, shuttleDay: 60, credits: 100 });
    const { expenses } = sleepUntilMorning(state, mulberry32(1));
    expect(state.over).not.toBeNull();
    expect(expenses).toBeNull();
    expect(state.credits).toBe(100);
  });

  it('expensesToday is the hook for events: it names the bills, payExpenses applies them', () => {
    expect(expensesToday(makeState({ day: 3, nextDue: 7 }))).toEqual({ energy: 20, tier: 0 });
    expect(expensesToday(makeState({ day: 8, nextDue: 14 }))).toEqual({ energy: 20, tier: 50 });
  });

  it('the morning window shows the bills, the shortfall in the risk colour', () => {
    const report = uiTs.match(/function showMorningReport[\s\S]*?\n}/)?.[0] ?? '';
    expect(report).toContain('expenseLines(report.expenses, state.debt)');
    expect(report).toContain('<li class="m-risk">${bills.shortfall}</li>');
  });
});
