// =====================================================================
//  sim.ts — the balance bot (Patch A, task 22). Plays whole games of the
//  story mode with the game's own pure rules (economy.ts) and a seeded
//  rng, so one seed is one and the same game. No Node APIs here: run.ts
//  is the command line, tests/unit/sim.test.ts the quick smoke test.
// =====================================================================
import { DEBT, MARKET, START } from '../../src/data';
import {
  askBuyer, buySeat, callNextCustomer, canBuySeat, canGoToJunkyard, canVisitMarket, closeShop, customerLeaves, deferRent, dig,
  digIsLate, estimatedValue, evict, feedback, goHome, goToJunkyard, inspect, isPresentedBuyer, noiseLevel, offerToSeller, payEarly, payRent,
  payWithCollateral, perceivedChance, planCollateral, presentItem, sleepUntilMorning, useWorkbench, visitMarket,
} from '../../src/economy';
import { mulberry32 } from '../../src/rng';
import type { Rng } from '../../src/rng';
import { createGame } from '../../src/state';
import type { BuyerCustomer, Ending, GameState, InspectCheck, Item, SellerCustomer } from '../../src/types';

/** How a bot plays. */
export interface Strategy {
  name: string;
  /** Inspects all three checks before haggling (costs patience). */
  inspects: boolean;
  /** Buys only up to this share of its estimate. */
  buyShare: number;
  /** Asks the highest price whose gut feeling is at least this. */
  sellChance: number;
  /** Leaves the junkyard at this noise word (0 тихо … 3 дрон рядом); 4 = digs all. */
  leaveAtNoise: number;
  /** Digs past midnight too. */
  digsLate: boolean;
  /**
   * Keeps this much over the next payment (money to buy stock), pays the rest off the debt early.
   * An early payment lowers the debt, not the weekly payment, which still grows by 250:
   * a small reserve leaves the shop without stock and the bot evicted (300 → ~60%, 1000 → ~29%).
   */
  reserve: number;
}

export const STRATEGIES: Record<string, Strategy> = {
  /** As in tasks 15–17: buys ≤ 75% of the estimate, sells at ≥ 60%, leaves the heap at "громко". */
  careful: { name: 'careful', inspects: true, buyShare: 0.75, sellChance: 0.6, leaveAtNoise: 2, digsLate: false, reserve: 1000 },
  /** Takes risks: no inspection, buys up to 95%, sells at ≥ 40%, digs all five (past midnight too). */
  greedy: { name: 'greedy', inspects: false, buyShare: 0.95, sellChance: 0.4, leaveAtNoise: 4, digsLate: true, reserve: 150 },
};

/** One played game. */
export interface GameResult {
  seed: number;
  ending: Ending | null;
  /** Last day reached. */
  day: number;
  /** Day the debt reached 0, or null. */
  debtClosedDay: number | null;
  /** Credits at the end of each week (days 7, 14…), while the game lasted. */
  weeklyCredits: number[];
  /** Debt at the end of each week. */
  weeklyDebt: number[];
}

const PRICE_STEP = 5;
const CHECKS: InspectCheck[] = ['cond', 'serial', 'flaw'];

/** The bot never lets the counter run forever: a visitor gets this many tries. */
const MAX_TRIES = 12;

function handleSeller(state: GameState, customer: SellerCustomer, strategy: Strategy, rng: Rng): void {
  if (strategy.inspects) {
    CHECKS.forEach(check => inspect(state, check));
  }
  const item = customer.item;
  const estimate = estimatedValue(item);
  const limit = Math.floor(estimate * strategy.buyShare);
  const affordable = Math.max(0, state.credits - state.owed);
  // a known AI infection is not worth the trouble
  if ((item.k.flaw && item.infected) || limit <= 0) {
    customerLeaves(state);
    return;
  }
  let price = Math.min(limit, Math.round(estimate * 0.5));
  for (let tries = 0; state.cust === customer && tries < MAX_TRIES; tries++) {
    if (customer.ask <= limit && customer.ask <= affordable) {
      offerToSeller(state, customer.ask, rng);
      return;
    }
    if (price > affordable) {
      break;
    }
    offerToSeller(state, price, rng);
    price = Math.min(limit, price + Math.max(PRICE_STEP, Math.round(estimate * 0.05)));
  }
  if (state.cust === customer) {
    customerLeaves(state);
  }
}

/** The highest price whose gut feeling is at least `chance`. */
function bestAsk(customer: BuyerCustomer, chance: number): number {
  if (!isPresentedBuyer(customer)) {
    return 0;
  }
  let price = customer.offer;
  while (perceivedChance(customer, price + PRICE_STEP) >= chance) {
    price += PRICE_STEP;
  }
  return price;
}

function handleBuyer(state: GameState, customer: BuyerCustomer, strategy: Strategy, rng: Rng): void {
  const stock = state.inv.filter(item => item.t === customer.want).sort((a, b) => b.cond - a.cond);
  if (!stock.length) {
    customerLeaves(state);
    return;
  }
  presentItem(state, stock[0].uid);
  for (let tries = 0; state.cust === customer && tries < MAX_TRIES; tries++) {
    askBuyer(state, bestAsk(customer, strategy.sellChance), rng);
  }
  if (state.cust === customer) {
    customerLeaves(state);
  }
}

function handleLandlord(state: GameState): void {
  if (state.credits >= state.owed) {
    payRent(state);
  } else if (!state.deferred) {
    deferRent(state);
  } else if (planCollateral(state).ok) {
    payWithCollateral(state);
  } else {
    evict(state);
  }
}

function playShop(state: GameState, strategy: Strategy, rng: Rng): void {
  while (!state.over && callNextCustomer(state, rng)) {
    const customer = state.cust;
    if (customer?.kind === 'sell') {
      handleSeller(state, customer, strategy, rng);
    } else if (customer?.kind === 'buy') {
      handleBuyer(state, customer, strategy, rng);
    } else if (customer?.kind === 'rent') {
      handleLandlord(state);
    }
  }
  if (!state.over) {
    closeShop(state);
  }
}

/** Fixes a defect and purges AI where the parts allow: such items sell for far more. */
function useBench(state: GameState): void {
  const worth = (item: Item): boolean => item.defect || item.infected;
  for (const item of state.inv.filter(worth)) {
    if (item.infected) {
      useWorkbench(state, item.uid, 'purge');
    }
    if (item.defect) {
      useWorkbench(state, item.uid, 'fix');
    }
  }
}

function playEvening(state: GameState, strategy: Strategy, rng: Rng): void {
  useBench(state);
  if (state.parts < 6 && canVisitMarket(state) && state.credits - MARKET.price >= state.owed) {
    visitMarket(state);
  }
  if (canGoToJunkyard(state)) {
    goToJunkyard(state, rng);
    while (state.junk && state.junk.d > 0) {
      if (noiseLevel(state.junk.n) >= strategy.leaveAtNoise || (!strategy.digsLate && digIsLate(state))) {
        break;
      }
      dig(state, rng);
    }
    goHome(state);
  }
  useBench(state);
  // early payment: everything over the next payment and a reserve
  const surplus = state.credits - state.owed - strategy.reserve;
  if (state.debt > 0 && surplus > 0) {
    payEarly(state, surplus);
  }
  if (canBuySeat(state)) {
    buySeat(state);
  }
}

/** Plays one story game to its end (or the shuttle day). */
export function playGame(seed: number, strategy: Strategy): GameResult {
  return playGameWithState(seed, strategy).result;
}

/** The same, with the final game state (its log tells how the game went). */
export function playGameWithState(seed: number, strategy: Strategy): { result: GameResult; state: GameState } {
  const rng = mulberry32(seed);
  const state = createGame('story', rng);
  const result: GameResult = { seed, ending: null, day: 1, debtClosedDay: null, weeklyCredits: [], weeklyDebt: [] };
  while (!state.over && state.day <= DEBT.shuttleDay) {
    playShop(state, strategy, rng);
    if (!state.over) {
      playEvening(state, strategy, rng);
    }
    if (result.debtClosedDay === null && state.debt === 0) {
      result.debtClosedDay = state.day;
    }
    if (state.day % DEBT.periodDays === 0) {
      result.weeklyCredits.push(state.credits);
      result.weeklyDebt.push(state.debt);
    }
    if (!state.over) {
      sleepUntilMorning(state, rng);
    }
    feedback.floats.length = 0; // nobody shows the floating numbers here
  }
  result.ending = state.ending;
  result.day = state.day;
  return { result, state };
}

const mean = (values: number[]): number | null => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
const share = (part: number, total: number): number => Math.round(1000 * part / total) / 10;

/** Averages over many games. */
export interface SimSummary {
  strategy: string;
  games: number;
  /** % of games per ending. */
  endings: Record<'left' | 'stayed' | 'evicted', number>;
  /** Average day the debt was closed (games that closed it), and how many did. */
  debtClosedDay: number | null;
  debtClosedShare: number;
  /** Average day of eviction. */
  evictedDay: number | null;
  /** Average weekly gain (credits earned + debt paid off), weeks 1…8. */
  weeklyGain: number | null;
  /** Average credits and debt at the end of week 1, 2… (over the games still going). */
  weeklyCredits: (number | null)[];
  weeklyDebt: (number | null)[];
}

/** Credits earned plus debt paid off, per full week played. */
function gainPerWeek(result: GameResult): number {
  const weeks = result.weeklyCredits.length;
  const credits = result.weeklyCredits[weeks - 1] - START.credits;
  const debtPaid = DEBT.start - result.weeklyDebt[weeks - 1];
  return (credits + debtPaid) / weeks;
}

export function summarize(strategy: string, results: GameResult[]): SimSummary {
  const count = (ending: Ending): number => results.filter(r => r.ending === ending).length;
  const closed = results.filter(r => r.debtClosedDay !== null);
  const weeks = Math.max(0, ...results.map(r => r.weeklyCredits.length));
  const week = (pick: (r: GameResult) => number[], i: number): number | null =>
    mean(results.filter(r => pick(r).length > i).map(r => pick(r)[i]));
  return {
    strategy,
    games: results.length,
    endings: { left: share(count('left'), results.length), stayed: share(count('stayed'), results.length), evicted: share(count('evicted'), results.length) },
    debtClosedDay: mean(closed.map(r => r.debtClosedDay!)),
    debtClosedShare: share(closed.length, results.length),
    evictedDay: mean(results.filter(r => r.ending === 'evicted').map(r => r.day)),
    weeklyGain: mean(results.filter(r => r.weeklyCredits.length > 0).map(gainPerWeek)),
    weeklyCredits: Array.from({ length: weeks }, (_, i) => week(r => r.weeklyCredits, i)),
    weeklyDebt: Array.from({ length: weeks }, (_, i) => week(r => r.weeklyDebt, i)),
  };
}

/** Plays `seeds` games (seeds 1…N) with one strategy. */
export function runSim(seeds: number, strategy: Strategy): SimSummary {
  const results = Array.from({ length: seeds }, (_, i) => playGame(i + 1, strategy));
  return summarize(strategy.name, results);
}
