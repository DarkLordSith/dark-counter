// =====================================================================
//  day.ts — the day (task 16): the station week, how many customers
//  come today and why, the game clock. Pure functions over a GameState
//  passed in, no DOM and no module state: state.ts (new game),
//  economy.ts (the morning), actionbar/scene/ui (the chip, the window)
//  and Vitest all use them.
//
//  The clock is derived, not saved: the day's opening (08:00 + 2 h per
//  dig past midnight), the customers served, the evening hours spent.
// =====================================================================
import { CLOCK, CUSTOMER_FLOW, CUSTOMERS_BY_WEEKDAY, CUSTOMERS_PER_DAY, DEBT, EVENING_HOURS, JUNK, WEEKDAY_REASONS } from './data';
import type { GameState } from './types';

/** Fields the day functions read. */
type DayView = Pick<GameState, 'day' | 'debt' | 'nextDue' | 'heat' | 'late' | 'cn' | 'slot' | 'phase' | 'hours'>;

/**
 * Day of the station week, 1…7: the week is the cycle of Grobov's payment, day 7 is the day he comes.
 * Counted from the payment day (no field in the save); with the debt closed — from the day of the game.
 * A deferral moves the payment day, so the week restarts from it.
 */
export function weekdayOf(game: Pick<GameState, 'day' | 'debt' | 'nextDue'>): number {
  const period = DEBT.periodDays;
  if (game.debt <= 0) {
    return ((game.day - 1) % period) + 1;
  }
  const daysToPayment = ((game.nextDue - game.day) % period + period) % period;
  return period - daysToPayment;
}

/** A reason for more or fewer customers today: a DAY_TEXT.reasons key and how many (+4, −1…). */
export type CustomerReasonKey = 'quiet' | 'payday' | 'saving' | 'heat' | 'late';
export interface CustomerReason {
  key: CustomerReasonKey;
  n: number;
}

export interface CustomersToday {
  /** Customers today, never below CUSTOMER_FLOW.minPerDay. */
  count: number;
  /** Why it differs from CUSTOMERS_PER_DAY; a list, so events and panic can add theirs later. */
  reasons: CustomerReason[];
}

/** Customers of the day by the weekday, the wanted level and last night's digs past midnight. */
export function customersToday(game: DayView): CustomersToday {
  const index = weekdayOf(game) - 1;
  const reasons: CustomerReason[] = [];
  const weekKey = WEEKDAY_REASONS[index];
  const weekDelta = CUSTOMERS_BY_WEEKDAY[index] - CUSTOMERS_PER_DAY;
  if (weekKey && weekDelta) {
    reasons.push({ key: weekKey, n: weekDelta });
  }
  if (game.heat >= CUSTOMER_FLOW.heatShy) {
    reasons.push({ key: 'heat', n: -CUSTOMER_FLOW.heatLoss });
  }
  if (game.late > 0) {
    reasons.push({ key: 'late', n: -game.late * JUNK.lateCustomerLoss });
  }
  const raw = reasons.reduce((sum, reason) => sum + reason.n, CUSTOMERS_PER_DAY);
  return { count: Math.max(CUSTOMER_FLOW.minPerDay, raw), reasons };
}

/** Hour the shop opened today: 08:00, +2 h for every dig past midnight last night. */
export const openingHour = (game: Pick<GameState, 'late'>): number =>
  Math.min(CLOCK.latestOpen, CLOCK.shiftStart + game.late * CLOCK.lateHoursPerDig);

export interface Clock {
  /** Hours since the day's 00:00; 24 and more is past midnight. */
  hour: number;
  /** "09:20", 24 h. */
  text: string;
  /** Past midnight (the chip turns `wear`, the junkyard sky goes dark). */
  night: boolean;
}

/** "HH:MM" of an hour of the day (24 and more wraps: 24.5 → "00:30"). */
export function formatHour(hour: number): string {
  const minutes = Math.round(hour * 60);
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * What the station clock shows. The shift (opening → 20:00) is split evenly between today's
 * customers, each one served moves the clock by a share; the evening is 20:00 → 24:00 by the
 * hours spent, and each dig past midnight adds its hour after 24:00.
 */
export function clockOf(game: DayView): Clock {
  let hour: number;
  if (game.phase === 'shop') {
    const open = openingHour(game);
    const customers = Math.max(1, game.cn);
    hour = open + (CLOCK.shiftEnd - open) * Math.min(game.slot, customers) / customers;
  } else {
    hour = CLOCK.shiftEnd + (EVENING_HOURS - game.hours) + game.late * JUNK.digHours;
  }
  return { hour, text: formatHour(hour), night: hour >= CLOCK.midnight };
}
