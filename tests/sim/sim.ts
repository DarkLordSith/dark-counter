// =====================================================================
//  sim.ts — the balance bot (Patch A, task 22). Plays whole games of the
//  story mode with the game's own pure rules (economy.ts) and a seeded
//  rng, so one seed is one and the same game. No Node APIs here: run.ts
//  is the command line, tests/unit/sim.test.ts the quick smoke test.
// =====================================================================
import { DEBT, ITEM_TYPES, MARKET, RECIPES, START, VALUE } from '../../src/data';
import {
  askBuyer, buySeat, callNextCustomer, canBuySeat, canCraft, canGoToJunkyard, craft, canVisitMarket, closeShop, customerLeaves, deferRent, dig,
  digIsLate, estimatedValue, evict, feedback, goHome, goToJunkyard, inspect, isPresentedBuyer, offerToSeller, sellerChecks, payEarly, payRent,
  leaveWaiting, payWithCollateral, perceivedChance, planCollateral, presentItem, sleepUntilMorning, throwAway, useWorkbench, visitMarket, waitingFinds,
  bulkPrice, bulkStock, canSellBatch, sellBatch, setDiscount, toggleCart, canLeaveEarly, finalTier, leaveEarly,
} from '../../src/economy';
import type { FinalTier } from '../../src/economy';
import { mulberry32 } from '../../src/rng';
import type { Rng } from '../../src/rng';
import { createGame } from '../../src/state';
import type { BuyerCustomer, Ending, GameState, Item, SellerCustomer, WholesaleCustomer } from '../../src/types';

/** How a bot plays. */
export interface Strategy {
  name: string;
  /** Inspects all three checks before haggling (costs patience). */
  inspects: boolean;
  /** Buys only up to this share of its estimate. */
  buyShare: number;
  /** Asks the highest price whose gut feeling is at least this. */
  sellChance: number;
  /** Digs past midnight too (the junkyard v3: no drone, the bots dig until midnight, greedy beyond). */
  digsLate: boolean;
  /**
   * Keeps this much over the next payment (money to buy stock), pays the rest off the debt early.
   * An early payment lowers the debt, not the weekly payment, which still grows by 250:
   * a small reserve leaves the shop without stock and the bot evicted (300 → ~60%, 1000 → ~29%).
   */
  reserve: number;
  /** Builds whatever the recipes allow in the evening, the dearest build first. */
  crafts: boolean;
}

export const STRATEGIES: Record<string, Strategy> = {
  /** As in tasks 15–17: buys ≤ 75% of the estimate, sells at ≥ 60%, digs until midnight. */
  careful: { name: 'careful', inspects: true, buyShare: 0.75, sellChance: 0.6, digsLate: false, reserve: 1000, crafts: false },
  /**
   * "Like the owner" (balance 17.11): calibrated to the owner's playtest on debt 25 000 — by day 36
   * ~46% of the debt paid off at ~370 credits a day net (the bot: 46.2%, 354 a day; before the
   * buyer flow followed the stock). Buys cheap (≤ 50% of the estimate, no inspection), sells at
   * ≥ 35%, builds whatever the recipes allow, digs until midnight. The balance is tuned on it.
   */
  owner: { name: 'owner', inspects: false, buyShare: 0.5, sellChance: 0.35, digsLate: false, reserve: 1000, crafts: true },
  /** Takes risks: no inspection, buys up to 95%, sells at ≥ 40%, digs past midnight too (all six digs). */
  greedy: { name: 'greedy', inspects: false, buyShare: 0.95, sellChance: 0.4, digsLate: true, reserve: 150, crafts: false },
};

/**
 * Task 38, when a bot with a seat leaves: 'day60' — the last shuttle (as before), 'asap' — the
 * early cargo flight on the evening the seat is bought.
 */
export type LeavePolicy = 'day60' | 'asap';

/** One played game. */
export interface GameResult {
  /** Task 38: credits on board (after the ramp) and the patrol's toll, for the 'left' ending; else null / 0. */
  board: number | null;
  toll: number;
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
  /** Items bought from sellers and sold to buyers. */
  bought: number;
  sold: number;
  /** Debt and credits on the evening of CHECK_DAY (the owner's playtest point), if reached. */
  checkDay: { debt: number; credits: number } | null;
  /** Items in the stock each morning (task 35: the junkyard fills the stock). */
  morningStock: number[];
  /** Junkyard visits, items brought home and their estimated value (their real worth: realValue). */
  junkVisits: number;
  junkFinds: number;
  junkValue: number;
  /** Task 36: credits from ordinary sales and from the wholesaler, items sold to him, his visits. */
  saleIncome: number;
  bulkIncome: number;
  bulkSold: number;
  bulkVisits: number;
  /** Junkyard finds sold (to anyone) within a week of being dug up. */
  junkSoldInWeek: number;
}

/** The owner's playtest (16.11) stopped on day 36: the owner strategy is calibrated there. */
export const CHECK_DAY = 36;

/** What one game counts while it is played (the rules return the bought item; a sale empties a stock slot). */
interface Tally {
  bought: number; sold: number; junkVisits: number; junkFinds: number; junkValue: number;
  saleIncome: number; bulkIncome: number; bulkSold: number; bulkVisits: number; junkSoldInWeek: number;
  /** Day each junkyard find was dug up, by uid (the "sold within a week" metric). */
  dugOn: Map<number, number>;
}

/** An item left the stock as a sale: counts a junkyard find sold within a week. */
function noteSale(state: GameState, item: Item, tally: Tally): void {
  const day = tally.dugOn.get(item.uid);
  if (day !== undefined && state.day - day <= 7) {
    tally.junkSoldInWeek++;
  }
}

const PRICE_STEP = 5;

/** What an item is really worth (its true condition, defect and AI), as the rules value it: the junkyard metric. */
const realValue = (item: Item): number => ITEM_TYPES[item.t].basePrice * (VALUE.conditionFloor + VALUE.conditionSpan * item.cond / 100)
  * (item.defect ? VALUE.defectMult : 1) * (item.infected ? VALUE.infectedMult : 1);

/** The bot never lets the counter run forever: a visitor gets this many tries. */
const MAX_TRIES = 12;

function handleSeller(state: GameState, customer: SellerCustomer, strategy: Strategy, rng: Rng, tally: Tally): void {
  if (strategy.inspects) {
    // task 41: the checks of the item's category, as at the counter (none for chem and household)
    sellerChecks(customer).forEach(check => inspect(state, check));
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
      tally.bought += offerToSeller(state, customer.ask, rng) ? 1 : 0;
      return;
    }
    if (price > affordable) {
      break;
    }
    tally.bought += offerToSeller(state, price, rng) ? 1 : 0;
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

function handleBuyer(state: GameState, customer: BuyerCustomer, strategy: Strategy, rng: Rng, tally: Tally): void {
  const stock = state.inv.filter(item => item.t === customer.want).sort((a, b) => b.cond - a.cond);
  if (!stock.length) {
    customerLeaves(state);
    return;
  }
  presentItem(state, stock[0].uid);
  const stocked = state.inv.length;
  const credits = state.credits;
  for (let tries = 0; state.cust === customer && tries < MAX_TRIES; tries++) {
    askBuyer(state, bestAsk(customer, strategy.sellChance), rng);
  }
  tally.sold += stocked - state.inv.length;
  if (state.inv.length < stocked) {
    tally.saleIncome += state.credits - credits;
    noteSale(state, stock[0], tally);
  }
  if (state.cust === customer) {
    customerLeaves(state);
  }
}

/** Fills the wholesaler's basket with `off` discount: the cheapest items first (the most items leave the shelf). */
function fillCart(state: GameState, customer: WholesaleCustomer, off: number): void {
  customer.cart.slice().forEach(uid => toggleCart(state, uid));
  if (customer.off !== off) {
    setDiscount(state, off || customer.off);
  }
  for (const item of bulkStock(state, customer).sort((a, b) => bulkPrice(a) - bulkPrice(b))) {
    toggleCart(state, item.uid); // refuses what does not fit the budget or the batch
  }
}

/** Task 36: sells a batch; takes −10% when fewer than two items fit without it. */
function handleWholesaler(state: GameState, customer: WholesaleCustomer, tally: Tally): void {
  tally.bulkVisits++;
  fillCart(state, customer, 0);
  if (customer.cart.length < 2) {
    fillCart(state, customer, 10);
  }
  if (!canSellBatch(state)) {
    customerLeaves(state);
    return;
  }
  const credits = state.credits;
  const items = sellBatch(state);
  tally.bulkIncome += state.credits - credits;
  tally.bulkSold += items.length;
  tally.sold += items.length;
  items.forEach(item => noteSale(state, item, tally));
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

function playShop(state: GameState, strategy: Strategy, rng: Rng, tally: Tally): void {
  while (!state.over && callNextCustomer(state, rng)) {
    const customer = state.cust;
    if (customer?.kind === 'sell') {
      handleSeller(state, customer, strategy, rng, tally);
    } else if (customer?.kind === 'buy') {
      handleBuyer(state, customer, strategy, rng, tally);
    } else if (customer?.kind === 'rent') {
      handleLandlord(state);
    } else if (customer?.kind === 'bulk') {
      handleWholesaler(state, customer, tally);
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

/** Recipe indexes, the dearest build first. */
const BUILDS = RECIPES.map((recipe, index) => ({ index, price: ITEM_TYPES[recipe.out].basePrice }))
  .sort((a, b) => b.price - a.price).map(build => build.index);

function buildAll(state: GameState, rng: Rng): void {
  for (const index of BUILDS) {
    while (canCraft(state, RECIPES[index]) && craft(state, index, rng)) {
      // builds again while the parts last
    }
  }
}

/** The backpack is full and a find waits: throw out the cheapest in the backpack while the waiting one is worth more. */
function keepBestFinds(state: GameState): void {
  for (let next = waitingFinds(state)[0]; next; next = waitingFinds(state)[0]) {
    const cheapest = state.inv.filter(item => state.junk?.f.includes(item.uid)).sort((a, b) => realValue(a) - realValue(b))[0];
    if (!cheapest || realValue(cheapest) >= realValue(next)) {
      leaveWaiting(state);
      return;
    }
    throwAway(state, cheapest.uid);
  }
}

function playEvening(state: GameState, strategy: Strategy, rng: Rng, tally: Tally, leave: LeavePolicy): void {
  useBench(state);
  if (strategy.crafts) {
    buildAll(state, rng);
  }
  if (state.parts < 6 && canVisitMarket(state) && state.credits - MARKET.price >= state.owed) {
    visitMarket(state);
  }
  if (canGoToJunkyard(state)) {
    goToJunkyard(state, rng);
    while (state.junk && state.junk.d > 0) {
      if (!strategy.digsLate && digIsLate(state)) {
        break;
      }
      dig(state, rng);
      keepBestFinds(state);
    }
    const finds = state.inv.filter(item => state.junk?.f.includes(item.uid));
    finds.forEach(item => tally.dugOn.set(item.uid, state.day));
    tally.junkVisits++;
    tally.junkFinds += finds.length;
    tally.junkValue += finds.reduce((sum, item) => sum + realValue(item), 0);
    goHome(state);
  }
  useBench(state);
  if (strategy.crafts) {
    buildAll(state, rng);
  }
  // early payment: everything over the next payment and a reserve
  const surplus = state.credits - state.owed - strategy.reserve;
  if (state.debt > 0 && surplus > 0) {
    payEarly(state, surplus);
  }
  if (canBuySeat(state)) {
    buySeat(state);
  }
  if (leave === 'asap' && canLeaveEarly(state)) {
    leaveEarly(state);
  }
}

/** Plays one story game to its end (or the shuttle day). */
export function playGame(seed: number, strategy: Strategy, leave: LeavePolicy = 'day60'): GameResult {
  return playGameWithState(seed, strategy, leave).result;
}

/** The same, with the final game state (its log tells how the game went). */
export function playGameWithState(seed: number, strategy: Strategy, leave: LeavePolicy = 'day60'): { result: GameResult; state: GameState } {
  const rng = mulberry32(seed);
  const state = createGame('story', rng);
  const result: GameResult = {
    seed, board: null, toll: 0, ending: null, day: 1, debtClosedDay: null, weeklyCredits: [], weeklyDebt: [], bought: 0, sold: 0, checkDay: null, morningStock: [],
    junkVisits: 0, junkFinds: 0, junkValue: 0, saleIncome: 0, bulkIncome: 0, bulkSold: 0, bulkVisits: 0, junkSoldInWeek: 0,
  };
  const tally: Tally = { ...result, dugOn: new Map() };
  while (!state.over && state.day <= DEBT.shuttleDay) {
    result.morningStock.push(state.inv.length);
    playShop(state, strategy, rng, tally);
    if (!state.over) {
      playEvening(state, strategy, rng, tally, leave);
    }
    if (result.debtClosedDay === null && state.debt === 0) {
      result.debtClosedDay = state.day;
    }
    if (state.day === CHECK_DAY && !state.over) {
      result.checkDay = { debt: state.debt, credits: state.credits };
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
  for (const key of ['bought', 'sold', 'junkVisits', 'junkFinds', 'junkValue', 'saleIncome', 'bulkIncome', 'bulkSold', 'bulkVisits', 'junkSoldInWeek'] as const) {
    result[key] = tally[key];
  }
  result.ending = state.ending;
  result.day = state.day;
  if (state.ending === 'left') {
    result.board = state.credits;
    result.toll = state.st.toll ?? 0;
  }
  return { result, state };
}

const mean = (values: number[]): number | null => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
const perUnit = (total: number, units: number): number | null => units ? Math.round(10 * total / units) / 10 : null;
const share = (part: number, total: number): number => Math.round(1000 * part / total) / 10;
/** The p-th percentile (nearest rank) of the values, or null. */
const percentile = (values: number[], p: number): number | null => {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1))];
};
const median = (values: number[]): number | null => {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

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
  /** Items bought per item sold (the owner's playtest: 4 to 1). */
  buysPerSale: number | null;
  /** On the evening of CHECK_DAY (games still going): share of the start debt paid off, %… */
  checkDayClosed: number | null;
  /** …and the net pace, credits a day: debt paid off plus credits gained since the start. */
  checkDayPace: number | null;
  /** Median day the debt was closed (games that closed it). */
  debtClosedMedian: number | null;
  /** Average credits and debt at the end of week 1, 2… (over the games still going). */
  weeklyCredits: (number | null)[];
  weeklyDebt: (number | null)[];
  /** Average stock in the morning, items (over all mornings of all games). */
  morningStock: number | null;
  /** Average junkyard visit: items brought home and their estimated value, credits. */
  findsPerVisit: number | null;
  valuePerVisit: number | null;
  /** Task 36: average income a week from ordinary sales and from the wholesaler, credits. */
  saleIncomeWeek: number | null;
  bulkIncomeWeek: number | null;
  /** The wholesaler's share of the income from sales (ordinary + wholesale), % (PM 19.11: ≤ ~25). */
  bulkShare: number | null;
  /** Wholesaler visits and items sold to him per game. */
  bulkVisits: number | null;
  bulkItems: number | null;
  /** Share of junkyard finds sold within a week of being dug up, %. */
  junkSoldInWeek: number | null;
  /** Task 38, the games that left: credits on board p25 / median / p75, the tiers (% of them), the departure day. */
  board: { p25: number | null; median: number | null; p75: number | null };
  tiers: Record<FinalTier, number | null>;
  leftDay: number | null;
  /** The ramp check: % of the games that left paid the patrol, and the average toll of those who paid. */
  rampShare: number | null;
  rampToll: number | null;
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
  const checked = results.flatMap(r => r.checkDay ? [r.checkDay] : []);
  const bought = results.reduce((sum, r) => sum + r.bought, 0);
  const sold = results.reduce((sum, r) => sum + r.sold, 0);
  const visits = results.reduce((sum, r) => sum + r.junkVisits, 0);
  const finds = results.reduce((sum, r) => sum + r.junkFinds, 0);
  const left = results.filter(r => r.board !== null);
  const boards = left.map(r => r.board!);
  const paid = left.filter(r => r.toll > 0);
  const tierShare = (tier: FinalTier): number | null => left.length ? share(boards.filter(b => finalTier(b) === tier).length, left.length) : null;
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
    buysPerSale: sold ? Math.round(10 * bought / sold) / 10 : null,
    checkDayClosed: checked.length ? share(checked.reduce((sum, c) => sum + DEBT.start - c.debt, 0), checked.length * DEBT.start) : null,
    checkDayPace: mean(checked.map(c => (DEBT.start - c.debt + c.credits - START.credits) / CHECK_DAY)),
    debtClosedMedian: median(closed.map(r => r.debtClosedDay!)),
    weeklyCredits: Array.from({ length: weeks }, (_, i) => week(r => r.weeklyCredits, i)),
    weeklyDebt: Array.from({ length: weeks }, (_, i) => week(r => r.weeklyDebt, i)),
    morningStock: perUnit(results.reduce((sum, r) => sum + r.morningStock.reduce((a, b) => a + b, 0), 0), results.reduce((sum, r) => sum + r.morningStock.length, 0)),
    findsPerVisit: perUnit(results.reduce((sum, r) => sum + r.junkFinds, 0), visits),
    valuePerVisit: visits ? Math.round(results.reduce((sum, r) => sum + r.junkValue, 0) / visits) : null,
    saleIncomeWeek: mean(results.map(r => r.saleIncome * 7 / r.day)),
    bulkIncomeWeek: mean(results.map(r => r.bulkIncome * 7 / r.day)),
    bulkShare: share(results.reduce((sum, r) => sum + r.bulkIncome, 0), results.reduce((sum, r) => sum + r.saleIncome + r.bulkIncome, 0)),
    bulkVisits: perUnit(results.reduce((sum, r) => sum + r.bulkVisits, 0), results.length),
    bulkItems: perUnit(results.reduce((sum, r) => sum + r.bulkSold, 0), results.length),
    junkSoldInWeek: finds ? share(results.reduce((sum, r) => sum + r.junkSoldInWeek, 0), finds) : null,
    board: { p25: percentile(boards, 25), median: median(boards), p75: percentile(boards, 75) },
    tiers: { poor: tierShare('poor'), ok: tierShare('ok'), rich: tierShare('rich') },
    leftDay: mean(left.map(r => r.day)),
    rampShare: left.length ? share(paid.length, left.length) : null,
    rampToll: mean(paid.map(r => r.toll)),
  };
}

/** The debt numbers the grid search tries (a part of DEBT). */
export type Balance = Record<'start' | 'paymentStep' | 'seatBase' | 'seatPerDay', number>;

/**
 * Runs `play` with other debt numbers. DEBT is a constant of the game, so the bot swaps its fields
 * for the run and puts them back after; only the simulator does this, the game never changes DEBT.
 */
export function withBalance<T>(balance: Balance, play: () => T): T {
  const debt = DEBT as unknown as Balance;
  const saved: Balance = { start: DEBT.start, paymentStep: DEBT.paymentStep, seatBase: DEBT.seatBase, seatPerDay: DEBT.seatPerDay };
  Object.assign(debt, balance);
  try {
    return play();
  } finally {
    Object.assign(debt, saved);
  }
}

/** Plays `seeds` games (seeds 1…N) with one strategy. */
export function runSim(seeds: number, strategy: Strategy, leave: LeavePolicy = 'day60'): SimSummary {
  const results = Array.from({ length: seeds }, (_, i) => playGame(i + 1, strategy, leave));
  return summarize(strategy.name, results);
}
