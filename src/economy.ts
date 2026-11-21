// =====================================================================
//  economy.ts — game rules: item value, customers and haggling, the debt
//  (weekly payment, early payments, shuttle seat, endings),
//  evening (junkyard, flea market), night events, workbench, crafting.
//  No DOM and no globals (task 21): every rule gets the game `state` and,
//  if it rolls dice, an `rng` as parameters, changes the state and returns
//  a result. The screen (selection, tab, the figure in the scene) is ui.ts's
//  business: it reads the result. Floating numbers are queued in `feedback`.
// =====================================================================
import {
  ACCEPT, HUNCH_VERDICT, BENCH_COST, COLLATERAL,
  buyerShare, CRAFT_CONDITION_BONUS, CUSTOMER, DEBT, EXPENSES, FINAL, DIG_LOOT, DIG_ODDS, EVENING_HOURS, HAGGLE, HUMAN_NAMES,
  BULK_CATEGORIES, canBeStolen, canHaveFlaw, checksFor, hidesCondition, INSPECT, isBulkCategory, ITEM_TYPES, itemCategory, JUNK, JUNK_WEIGHTS, LANDLORD_NAME, LANDLORD_SEED, MARKET, MAX_HEAT, NIGHT, RARE_FINDS,
  RECIPES, RENT, REPAIR_AMOUNT, ROBOT_NAMES, SUPPLIER, VALUE, WHOLESALE, wholesaleChance,
} from './data';
import { itemRef, listLength, nameRef, say, tx } from './i18n';
import type { ListKey, TextKey, Tx } from './i18n';
import type { RU } from './lang/ru';
import { COLOR, MEANING } from './palette';
import { appearanceFor } from './appearance';
import { customersToday, formatHour, openingHour, weekdayOf } from './day';
import { addLog, createItem, findItem, fullKnowledge, randomLandlordSlot } from './state';
import { pickRandom, randomBetween, randomInt, randomSeed } from './rng';
import type { Rng } from './rng';
import { isRareItem } from './star';
import type { StarKind } from './star';
import type {
  BuyerCustomer, Ending, GameState, InspectCheck, Item, ItemType, JunkVisit, PresentedBuyer, Recipe, SellerCustomer,
  WholesaleCustomer,
} from './types';
import type { BulkCategory } from './data';
import { clamp, roundTo10 } from './util';

/**
 * Texts (task 34): the rules never translate. They keep messages — tx(key, params) for the log,
 * say(…) for the string fields of the save (cust.msg, jmsg, over) — and the screen translates them.
 */

/** A random line of a dictionary list, as its key ('lines.seller.2'): one rng() call, like pickRandom. */
const lineKey = (rng: Rng, key: ListKey): TextKey => `${key}.${Math.floor(rng() * listLength(key))}` as TextKey;

/* =====================================================================
   Feedback for the UI: floating numbers to show after the action.
   ===================================================================== */

export interface FloatingText {
  /** A number ("+120") or a word to translate. */
  text: string | Tx;
  color: string;
  /** A pixel star drawn before the text (a rare find). */
  star?: StarKind;
}

export const feedback: { floats: FloatingText[] } = { floats: [] };

function floatText(text: string | Tx, color: string, star?: StarKind): void {
  feedback.floats.push(star ? { text, color, star } : { text, color });
}

/* =====================================================================
   Item value
   ===================================================================== */

function conditionValue(type: ItemType, condition: number): number {
  return ITEM_TYPES[type].basePrice * (VALUE.conditionFloor + VALUE.conditionSpan * condition / 100);
}

/** Price as if the item had no hidden problems. */
const cleanValue = (item: Item): number => Math.round(conditionValue(item.t, item.cond));

/** Real worth, counting defect and AI infection. */
const trueValue = (item: Item): number =>
  Math.round(cleanValue(item) * (item.defect ? VALUE.defectMult : 1) * (item.infected ? VALUE.infectedMult : 1));

/** What the player can estimate from what they know. */
export function estimatedValue(item: Item): number {
  const condition = item.k.cond ? item.cond : VALUE.unknownConditionGuess;
  let value = conditionValue(item.t, condition);
  if (item.k.flaw && item.defect) {
    value *= VALUE.defectMult;
  }
  if (item.k.flaw && item.infected) {
    value *= VALUE.infectedMult;
  }
  return Math.round(value);
}

const buyerBaseValue = (item: Item): number => conditionValue(item.t, item.cond) * (item.defect ? VALUE.buyerDefectMult : 1);

export const isFullyKnown = (item: Item): boolean => item.k.cond && item.k.serial && item.k.flaw;
export const showsInfection = (item: Item): boolean => item.k.flaw && item.infected;

function raiseHeat(state: GameState, amount: number): void {
  state.heat = Math.min(MAX_HEAT, state.heat + amount);
}

function pickRandomItemType(rng: Rng): ItemType {
  const types = Object.keys(ITEM_TYPES) as ItemType[];
  const totalWeight = types.reduce((sum, type) => sum + ITEM_TYPES[type].spawnWeight, 0);
  let roll = rng() * totalWeight;
  for (const type of types) {
    roll -= ITEM_TYPES[type].spawnWeight;
    if (roll <= 0) {
      return type;
    }
  }
  return types[0];
}

/* =====================================================================
   Customers & shop flow
   ===================================================================== */

export function isPresentedBuyer(customer: BuyerCustomer): customer is PresentedBuyer {
  return customer.item !== null && customer.offer !== undefined && customer.max2 !== undefined;
}

/** Customer at the counter if it is a seller, else null. */
function currentSeller(state: GameState): SellerCustomer | null {
  return state.cust?.kind === 'sell' ? state.cust : null;
}

function currentBuyer(state: GameState): BuyerCustomer | null {
  return state.cust?.kind === 'buy' ? state.cust : null;
}

/**
 * Note on field order: the object literals below keep the same key order
 * as the original code, so saves stay byte-identical (parity tests).
 */
function createCustomer(state: GameState, forceSeller: boolean, rng: Rng): void {
  const isBuyer = !forceSeller && state.inv.length > 0 && rng() < buyerShare(state.inv.length);
  const seed = randomSeed(rng);
  const appearance = appearanceFor(seed);
  const name = pickRandom(rng, appearance.kind === 'human' ? HUMAN_NAMES : ROBOT_NAMES);
  const pat = randomInt(rng, CUSTOMER.patienceMin, CUSTOMER.patienceMax);
  const noise = randomBetween(rng, -CUSTOMER.feelNoise, CUSTOMER.feelNoise);
  const base = { name, seed, pat, done: {}, noise, max: pat };
  if (isBuyer) {
    const want = rng() < CUSTOMER.buyerWantsStockedChance ? pickRandom(rng, state.inv).t : pickRandomItemType(rng);
    const mult = randomBetween(rng, CUSTOMER.buyerMarkupMin, CUSTOMER.buyerMarkupMax);
    const msg = say(lineKey(rng, 'lines.buyer'), { t: itemRef(want) });
    state.cust = { ...base, kind: 'buy', want, mult, item: null, msg };
  } else {
    const item = createItem(state, pickRandomItemType(rng), {}, rng);
    const ask = Math.round(cleanValue(item) * randomBetween(rng, CUSTOMER.sellerAskMin, CUSTOMER.sellerAskMax));
    const min = Math.round(trueValue(item) * (item.stolen ? CUSTOMER.sellerMinStolen : CUSTOMER.sellerMinClean));
    const msg = item.stolen && rng() < CUSTOMER.stolenRushLineChance ? say('lines.sellerStolen') : say(lineKey(rng, 'lines.seller'));
    state.cust = { ...base, kind: 'sell', item, ask, min, msg };
  }
}

/* =====================================================================
   The wholesaler (task 36): a batch of one group, "as is", within a budget
   ===================================================================== */

/** Stocked items of the mass categories (task 40): only these bring the wholesaler and go to him. */
export const massStock = (state: GameState): Item[] => state.inv.filter(item => isBulkCategory(itemCategory(item.t)));

function bulkCategoryOf(item: Item): BulkCategory {
  const cat = itemCategory(item.t);
  return isBulkCategory(cat) ? cat : BULK_CATEGORIES[0];
}

/** What the wholesaler pays for an item: a share of the estimate, no checks. */
export const bulkPrice = (item: Item): number => Math.round(estimatedValue(item) * WHOLESALE.priceShare);

function createWholesaler(state: GameState, rng: Rng): void {
  const seed = randomSeed(rng);
  const appearance = appearanceFor(seed);
  const name = pickRandom(rng, appearance.kind === 'human' ? HUMAN_NAMES : ROBOT_NAMES);
  const pat = randomInt(rng, CUSTOMER.patienceMin, CUSTOMER.patienceMax);
  // the category of a random stocked mass item: the bigger category comes more often
  const grp = bulkCategoryOf(pickRandom(rng, massStock(state)));
  const group = state.inv.filter(item => itemCategory(item.t) === grp);
  const average = group.reduce((sum, item) => sum + estimatedValue(item), 0) / group.length;
  const spread = randomBetween(rng, 1 - WHOLESALE.budgetSpread, 1 + WHOLESALE.budgetSpread);
  const bud = roundTo10(WHOLESALE.budgetItems * average * WHOLESALE.priceShare * spread);
  const msg = say(lineKey(rng, `bulk.greet.${grp}`), { n: bud });
  state.cust = { name, seed, pat, done: {}, max: pat, kind: 'bulk', grp, bud, cart: [], off: 0, msg };
}

function currentWholesaler(state: GameState): WholesaleCustomer | null {
  return state.cust?.kind === 'bulk' ? state.cust : null;
}

/** Stocked items the wholesaler takes: his category, in shelf order. */
export const bulkStock = (state: GameState, customer: WholesaleCustomer): Item[] =>
  state.inv.filter(item => itemCategory(item.t) === customer.grp);

/** Items in the basket that are still in stock (one could be scrapped at the bench meanwhile). */
export const cartItems = (state: GameState, customer: WholesaleCustomer): Item[] =>
  bulkStock(state, customer).filter(item => customer.cart.includes(item.uid));

/** The basket's total with a discount (the current one by default). */
export function cartTotal(items: readonly Item[], off: number): number {
  return Math.round(items.reduce((sum, item) => sum + bulkPrice(item), 0) * (1 - off / 100));
}

/** The item can go into the basket: his category, a place in the batch, the budget holds. */
export function fitsCart(state: GameState, customer: WholesaleCustomer, item: Item): boolean {
  const items = cartItems(state, customer);
  return itemCategory(item.t) === customer.grp && !customer.cart.includes(item.uid) && items.length < WHOLESALE.maxItems
    && cartTotal([...items, item], customer.off) <= customer.bud;
}

/** A tap on a tile: in the basket, or out of it if it was there. Returns whether the basket changed. */
export function toggleCart(state: GameState, uid: number): boolean {
  const customer = currentWholesaler(state);
  const item = findItem(state, uid);
  if (!customer || !item) {
    return false;
  }
  if (customer.cart.includes(uid)) {
    customer.cart = customer.cart.filter(inCart => inCart !== uid);
    return true;
  }
  if (!fitsCart(state, customer, item)) {
    customer.msg = say(cartItems(state, customer).length >= WHOLESALE.maxItems ? 'bulk.enough' : 'bulk.tooMuch', { n: WHOLESALE.maxItems });
    return false;
  }
  customer.cart.push(uid);
  return true;
}

/** The discount can be set: the basket with it stays within the budget (taking a discount back may not fit). */
export const canSetDiscount = (state: GameState, customer: WholesaleCustomer, off: number): boolean =>
  cartTotal(cartItems(state, customer), off) <= customer.bud;

/** −10% / −20% on the whole basket; the same button again takes it back. Returns whether it changed. */
export function setDiscount(state: GameState, off: number): boolean {
  const customer = currentWholesaler(state);
  if (!customer || !(WHOLESALE.discounts as readonly number[]).includes(off)) {
    return false;
  }
  const next = customer.off === off ? 0 : off;
  if (!canSetDiscount(state, customer, next)) {
    return false;
  }
  customer.off = next;
  return true;
}

/** "Продать" is possible: something in the basket, within the budget. */
export function canSellBatch(state: GameState): boolean {
  const customer = currentWholesaler(state);
  if (!customer) {
    return false;
  }
  const items = cartItems(state, customer);
  return items.length > 0 && cartTotal(items, customer.off) <= customer.bud;
}

/**
 * The batch is sold. The consequences are those of ordinary sales, item by item (PM 19.11: the
 * wholesaler is no free laundering): every stolen item +1 heat, every AI-infected one +2.
 * Returns the items sold.
 */
export function sellBatch(state: GameState): Item[] {
  const customer = currentWholesaler(state);
  if (!customer || !canSellBatch(state)) {
    return [];
  }
  const items = cartItems(state, customer);
  const paid = cartTotal(items, customer.off);
  const stolen = items.filter(item => item.stolen).length;
  const infected = items.filter(item => item.infected).length;
  state.credits += paid;
  countSale(state, paid);
  state.inv = state.inv.filter(item => !items.includes(item));
  raiseHeat(state, stolen + 2 * infected);
  addLog(state, tx('bulk.sold', {
    items: items.map(item => itemRef(item.t)), n: paid, name: nameRef(customer.name),
    stolen: stolen ? tx('log.soldStolen') : '',
    ai: infected ? tx('log.soldAi') : '',
  }));
  floatText(`+${paid}`, MEANING.action);
  finishCustomer(state);
  return items;
}

export function isLandlordDue(state: GameState): boolean {
  return state.debt > 0 && !state.over && state.phase === 'shop' && state.day >= state.nextDue && !state.llDone;
}

/**
 * The next visitor comes to the counter: Grobov on a payment day once his slot is reached,
 * else a customer while the queue lasts. Returns whether someone came (ui.ts walks them in;
 * it also waits until the scene's figure is gone before calling).
 */
export function callNextCustomer(state: GameState, rng: Rng): boolean {
  if (state.phase !== 'shop' || state.cust || state.over) {
    return false;
  }
  if (isLandlordDue(state) && state.slot >= Math.min(state.llAt, state.cn)) {
    spawnLandlord(state);
    return true;
  }
  if (state.slot >= state.cn) {
    return false;
  }
  // task 36: the wholesaler squeezes in between the customers once his turn comes; not a slot of the day
  if (state.bk !== undefined && state.slot >= state.bk) {
    delete state.bk;
    if (massStock(state).length >= WHOLESALE.minStock) {
      createWholesaler(state, rng);
      return true;
    }
  }
  // the very first visitor of a new game always sells, to teach the basics
  createCustomer(state, state.day === 1 && state.slot === 0, rng);
  return true;
}

function landlordGreeting(state: GameState): string {
  const key = state.deferred ? 'landlord.deferred' : state.credits >= state.owed ? 'landlord.due' : 'landlord.short';
  return say(key, { n: state.owed });
}

function spawnLandlord(state: GameState): void {
  const msg = landlordGreeting(state);
  state.cust = { kind: 'rent', name: LANDLORD_NAME, seed: LANDLORD_SEED, msg, pat: 0, max: 0, done: {} };
}

export function customerLeaves(state: GameState, reason?: Tx): void {
  if (!state.cust) {
    return;
  }
  const name = state.cust.kind === 'rent' ? tx('landlord.name') : nameRef(state.cust.name);
  addLog(state, tx('log.left', { name, reason: reason ?? '' }));
  finishCustomer(state);
}

/** The visitor leaves the counter (ui.ts sees `cust` gone and walks the figure out). */
function finishCustomer(state: GameState): void {
  const customer = state.cust;
  if (!customer) {
    return;
  }
  // Grobov and the wholesaler come on top of the day's customers: the queue and the clock stay
  const extra = customer.kind === 'rent' || customer.kind === 'bulk';
  state.cust = null;
  if (!extra) {
    state.slot++;
  }
}

function losePatience(state: GameState, amount: number): void {
  if (state.cust) {
    state.cust.pat = Math.max(0, state.cust.pat - amount);
  }
}

export function closeShop(state: GameState): void {
  state.phase = 'evening';
  state.hours = EVENING_HOURS;
  state.late = 0; // today's late opening is over; tonight counts its own digs past midnight
  state.where = 'home';
  state.market = false;
  addLog(state, tx('log.shopClosed'));
}

/* =====================================================================
   Debt: weekly payment (the landlord's visit), early payments, shuttle seat
   ===================================================================== */

/** Size of the payment after this one (before capping by the debt left). */
export const nextRent = (state: GameState): number => state.rent + DEBT.paymentStep;
/** The payment after a deferral (+20%). */
export const deferredDebt = (state: GameState): number => roundTo10(state.owed * RENT.deferPenalty);
/** Shuttle seat price on a given day: grows towards the evacuation. */
export const seatPrice = (day: number): number => DEBT.seatBase + DEBT.seatPerDay * day;

/** A weekly payment never asks for more than the debt left. */
function capPaymentByDebt(state: GameState): void {
  state.owed = Math.min(state.owed, state.debt);
}

/** Pays `amount` off the debt; the floating number and the log line are the caller's. */
function reduceDebt(state: GameState, amount: number): void {
  const before = state.debt;
  state.debt = Math.max(0, state.debt - amount);
  if (before > 0 && state.debt === 0 && state.st.dc === null) {
    state.st.dc = state.day; // the first time only: the morning bills may put a little back on the debt
  }
}

/** Last line of a payment: the debt is gone. */
function logIfDebtPaid(state: GameState): void {
  if (state.debt === 0) {
    addLog(state, tx('debt.debtPaid'));
  }
}

const collateralValue = (item: Item): number =>
  Math.max(COLLATERAL.minValue, Math.round(trueValue(item) * (item.stolen ? COLLATERAL.stolenRate : COLLATERAL.cleanRate)));

/** Landlord prefers stolen goods: the cheapest one that covers the rest, else the most valuable. */
function pickCollateralItem(candidates: Item[], remaining: number): Item {
  const stolen = candidates.filter(item => item.stolen);
  const pool = stolen.length ? stolen : candidates;
  const covering = pool
    .filter(item => collateralValue(item) >= remaining)
    .sort((a, b) => collateralValue(a) - collateralValue(b));
  return covering[0] || pool.sort((a, b) => collateralValue(b) - collateralValue(a))[0];
}

export interface CollateralPlan {
  /** Cash taken (all credits up to the debt). */
  cash: number;
  /** Goods taken. */
  items: Item[];
  /** Cash and goods cover the debt. */
  ok: boolean;
  /** Overpayment, no change given. */
  over: number;
  /** Number of stolen items taken. */
  hot: number;
}

/** What the landlord would take: all cash up to the debt, then goods. */
export function planCollateral(state: GameState): CollateralPlan {
  const cash = Math.min(state.credits, state.owed);
  let remaining = state.owed - cash;
  const items: Item[] = [];
  while (remaining > 0) {
    const candidates = state.inv.filter(item => !items.includes(item));
    if (!candidates.length) {
      break;
    }
    const item = pickCollateralItem(candidates, remaining);
    items.push(item);
    remaining -= collateralValue(item);
  }
  return {
    cash,
    items,
    ok: remaining <= 0,
    over: Math.max(0, -remaining),
    hot: items.filter(item => item.stolen).length,
  };
}

export const collateralHeatRelief = (state: GameState, plan: CollateralPlan): number => Math.min(state.heat, plan.hot * COLLATERAL.heatReliefPerStolen);

/** The weekly payment is made (cash or goods): it comes off the debt, the next one is a week later and bigger. */
function settleRent(state: GameState): void {
  const paid = state.owed;
  state.deferred = false;
  state.rent += DEBT.paymentStep;
  state.nextDue = state.day + DEBT.periodDays;
  state.owed = state.rent;
  state.llDone = true;
  reduceDebt(state, paid);
  capPaymentByDebt(state);
}

export function payRent(state: GameState): void {
  if (state.credits < state.owed || !state.cust) {
    return;
  }
  const amount = state.owed;
  state.credits -= amount;
  floatText(`−${amount}`, MEANING.risk); // payment to the landlord
  state.cust.msg = say('landlord.thanks');
  settleRent(state);
  const paid = tx('debt.paymentPaid', { amount, debt: state.debt });
  addLog(state, state.debt > 0 ? tx('join.pair', { a: paid, b: tx('debt.paymentNext', { amount: state.owed, day: state.nextDue }) }) : paid);
  logIfDebtPaid(state);
  finishCustomer(state);
}

export function deferRent(state: GameState): void {
  if (state.deferred) {
    return;
  }
  const owed = deferredDebt(state);
  // the fine is not a separate bill: it goes onto the father's debt
  state.debt += owed - state.owed;
  state.owed = owed;
  state.nextDue = state.day + RENT.deferDays;
  state.deferred = true;
  state.llDone = true;
  addLog(state, tx('debt.deferred', { day: state.nextDue, amount: state.owed, debt: state.debt }));
  finishCustomer(state);
}

export function payWithCollateral(state: GameState): void {
  const plan = planCollateral(state);
  if (!plan.ok) {
    return;
  }
  state.credits -= plan.cash;
  state.inv = state.inv.filter(item => !plan.items.includes(item));
  if (plan.cash) {
    floatText(`−${plan.cash}`, MEANING.risk);
  }
  const relief = collateralHeatRelief(state, plan);
  state.heat -= relief;
  addLog(state, tx('log.collateral', {
    cash: plan.cash,
    items: plan.items.map(item => itemRef(item.t)),
    over: plan.over ? tx('log.noChange', { n: plan.over }) : '',
    hot: plan.hot ? tx('log.hotGone', { n: plan.hot, relief }) : '',
  }));
  settleRent(state);
  logIfDebtPaid(state);
  finishCustomer(state);
}

export function evict(state: GameState): void {
  endGame(state, 'evicted');
  finishCustomer(state);
}

/** Early payment, any day: as much of `amount` as the credits and the debt allow. Returns what was paid. */
export function payEarly(state: GameState, amount: number): number {
  const paid = Math.max(0, Math.min(Math.floor(amount), state.credits, state.debt));
  if (!paid || state.over) {
    return 0;
  }
  state.credits -= paid;
  floatText(`−${paid}`, MEANING.risk);
  addLog(state, tx('debt.paidEarly', { amount: paid, debt: state.debt - paid }));
  reduceDebt(state, paid);
  capPaymentByDebt(state);
  logIfDebtPaid(state);
  return paid;
}

/** Only the story mode has the last shuttle (calm "Без таймера" has no evacuation). */
export const hasShuttle = (state: GameState): boolean => state.mode === 'story';

/** calm: the debt is paid, the shop goes on without payments (a sandbox until a new game). */
export const isDebtClosed = (state: GameState): boolean => state.mode === 'calm' && state.debt === 0;

/** Grobov sells a seat only with the debt at zero, before the shuttle leaves. */
export const canBuySeat = (state: GameState): boolean =>
  hasShuttle(state) && !state.over && !state.seat && state.debt === 0 && state.day < state.shuttleDay && state.credits >= seatPrice(state.day);

export function buySeat(state: GameState): boolean {
  if (!canBuySeat(state)) {
    return false;
  }
  const price = seatPrice(state.day);
  state.credits -= price;
  state.seat = true;
  floatText(`−${price}`, MEANING.risk);
  addLog(state, tx('debt.seatBought', { price }));
  return true;
}

/** Ends the game: the ending's line becomes the game-over text. */
export function endGame(state: GameState, ending: Ending): void {
  state.ending = ending;
  state.over = say(`ending.${ending}.line`);
  addLog(state, tx(`ending.${ending}.line`));
}

/* =====================================================================
   The finale (task 38): the early flight, the ramp check, the run stats
   ===================================================================== */

/** A sale is counted for the final window: credits earned and one deal. */
function countSale(state: GameState, paid: number): void {
  state.st.earn += paid;
  state.st.deals++;
}

/** A rare find: the best one (by its value at that condition) is remembered for the final window. */
function noteStar(state: GameState, item: Item): void {
  const best = state.st.star;
  if (!best || conditionValue(item.t, item.cond) > conditionValue(best.t, best.c)) {
    state.st.star = { t: item.t, c: item.cond };
  }
}

/**
 * The early flight (story only): the debt is closed, the seat is bought, an evening at home
 * before the last shuttle. The cargo flight leaves tonight, the game ends.
 */
export const canLeaveEarly = (state: GameState): boolean =>
  hasShuttle(state) && !state.over && state.debt === 0 && state.seat
  && state.phase === 'evening' && state.where === 'home' && state.day < state.shuttleDay;

/** What the patrol at the ramp would take now: a share of the credits with the wanted level high; 0 below it or with the check off. */
export const rampToll = (state: GameState): number =>
  FINAL.rampCheck && state.heat >= FINAL.rampHeat ? Math.round(state.credits * FINAL.rampToll) : 0;

/** The departure (early or on the shuttle day): the ramp check, the day of departure, the 'left' ending. */
function depart(state: GameState, early: boolean): void {
  const toll = rampToll(state);
  if (toll > 0) {
    state.credits -= toll;
    state.st.toll = toll;
    addLog(state, tx('final.rampLog', { n: toll }));
  }
  state.lv = state.day;
  if (early) {
    state.ending = 'left';
    state.over = say('ending.left.lineEarly', { day: state.day });
    addLog(state, tx('ending.left.lineEarly', { day: state.day }));
  } else {
    endGame(state, 'left');
  }
}

/** "Улететь": leaves tonight. Returns whether the flight left. */
export function leaveEarly(state: GameState): boolean {
  if (!canLeaveEarly(state)) {
    return false;
  }
  depart(state, true);
  return true;
}

export type FinalTier = 'poor' | 'ok' | 'rich';

/** How well the player left: by the credits on board (after the ramp). */
export const finalTier = (credits: number): FinalTier =>
  credits >= FINAL.tierRich ? 'rich' : credits >= FINAL.tierOk ? 'ok' : 'poor';

/* =====================================================================
   Inspection of a seller's item
   ===================================================================== */

/** The condition line of the seller (an implant's diagnostics, task 41: only an implant hides it). */
const conditionLine = (item: Item): string =>
  say('lines.cond', { n: item.cond, note: tx(item.cond < INSPECT.lowCondition ? 'lines.condLow' : 'lines.condGood') });

function revealSerial(customer: SellerCustomer, item: Item): void {
  item.k.serial = true;
  if (item.stolen) {
    customer.ask = Math.max(customer.min, Math.round(customer.ask * INSPECT.stolenAskMult));
    customer.min = Math.round(customer.min * INSPECT.stolenMinMult);
    customer.msg = say('lines.serialStolen');
  } else {
    customer.msg = say('lines.serialClean');
  }
}

/**
 * The AI scanner of electronics or the diagnostics of an implant (task 41): the AI virus or a defect
 * (for an implant — the rejection), the price goes down; the diagnostics also shows the condition.
 */
function revealFlaw(customer: SellerCustomer, item: Item): void {
  item.k.flaw = true;
  const implant = hidesCondition(item.t);
  item.k.cond = true;
  if (item.infected) {
    customer.ask = Math.max(customer.min, Math.round(customer.ask * INSPECT.infectedAskMult));
    customer.min = Math.round(customer.min * INSPECT.infectedMinMult);
    customer.msg = say('lines.aiFound');
  } else if (item.defect) {
    customer.ask = Math.max(customer.min, Math.round(customer.ask * INSPECT.defectAskMult));
    customer.msg = say(implant ? 'lines.rejectFound' : 'lines.defectFound');
  } else {
    customer.msg = implant ? conditionLine(item) : say('lines.insidesOk');
  }
}

const REVEALS: Record<Exclude<InspectCheck, 'cond'>, (customer: SellerCustomer, item: Item) => void> = {
  serial: revealSerial,
  flaw: revealFlaw,
};

/** A check value of a button (data-v); 'cond' is no check of its own since task 41 (an implant's diagnostics shows it). */
export function isInspectCheck(value: string | undefined): value is InspectCheck {
  return value === 'serial' || value === 'flaw';
}

/** The checks of the seller's item at the counter (task 41: by its category; none — haggle at once). */
export const sellerChecks = (customer: SellerCustomer): readonly InspectCheck[] => checksFor(customer.item.t);

/** Each check costs patience (never the last point). Returns whether the check was made (ui.ts plays the scan). */
export function inspect(state: GameState, check: InspectCheck): boolean {
  const customer = currentSeller(state);
  if (!customer || check === 'cond' || customer.done[check] || !sellerChecks(customer).includes(check)) {
    return false;
  }
  customer.done[check] = 1;
  if (customer.pat > 1) {
    losePatience(state, 1);
  }
  REVEALS[check](customer, customer.item);
  return true;
}

/* =====================================================================
   Haggling
   ===================================================================== */

/** Chance a seller accepts `price`: 50% at the hidden limit, ~97% near their own price. */
export function sellerAcceptChance(customer: SellerCustomer, price: number): number {
  if (price >= customer.ask) {
    return 1;
  }
  const floor = customer.min * HAGGLE.sellerInsultShare;
  if (price <= floor) {
    return 0;
  }
  if (price < customer.min) {
    return ACCEPT.atLimit * (price - floor) / (customer.min - floor);
  }
  return clamp(ACCEPT.atLimit + ACCEPT.slope * (price - customer.min) / Math.max(1, customer.ask - customer.min), 0, ACCEPT.cap);
}

/** Chance a buyer accepts `price`: sure at their offer, 50% at the hidden limit, 0 far above it. */
export function buyerAcceptChance(customer: PresentedBuyer, price: number): number {
  if (price <= customer.offer) {
    return 1;
  }
  const ceiling = customer.max2 * HAGGLE.buyerCeilingShare;
  if (price >= ceiling) {
    return 0;
  }
  if (price <= customer.max2) {
    return clamp(1 - ACCEPT.atLimit * (price - customer.offer) / Math.max(1, customer.max2 - customer.offer), ACCEPT.atLimit, ACCEPT.cap);
  }
  return ACCEPT.atLimit * (ceiling - price) / (ceiling - customer.max2);
}

/** The player's "gut feeling": true chance plus per-customer noise, rounded to 5%. */
export function perceivedChance(customer: SellerCustomer | PresentedBuyer, price: number): number {
  const chance = customer.kind === 'sell' ? sellerAcceptChance(customer, price) : buyerAcceptChance(customer, price);
  if (chance >= 1 || chance <= 0) {
    return chance;
  }
  return clamp(Math.round((chance + customer.noise) * ACCEPT.feelStep) / ACCEPT.feelStep, ACCEPT.feelMin, ACCEPT.feelMax);
}

export type HunchVerdict = keyof typeof RU.verdict;

/** One word for the gut feeling: "unlikely" < 25% ≤ "maybe" < 55% ≤ "likely" < 85% ≤ "deal". */
export function hunchVerdict(chance: number): HunchVerdict {
  if (chance >= HUNCH_VERDICT.deal) {
    return 'deal';
  }
  if (chance >= HUNCH_VERDICT.likely) {
    return 'likely';
  }
  return chance >= HUNCH_VERDICT.maybe ? 'maybe' : 'unlikely';
}

/** The player offers `price` to a seller. Returns the bought item if the seller agreed (ui.ts selects it). */
export function offerToSeller(state: GameState, price: number, rng: Rng): Item | null {
  const customer = currentSeller(state);
  if (!customer) {
    return null;
  }
  if (price > state.credits) {
    customer.msg = say('lines.noMoney');
    return null;
  }
  if (price >= customer.ask) {
    return buyFromSeller(state, customer.ask);
  }
  if (rng() < sellerAcceptChance(customer, price)) {
    return buyFromSeller(state, price);
  }
  if (price < customer.min * HAGGLE.sellerInsultShare) {
    losePatience(state, HAGGLE.insultPatienceLoss);
    customer.msg = say(lineKey(rng, 'lines.sellerInsulted'));
  } else {
    losePatience(state, HAGGLE.counterPatienceLoss);
    customer.ask = Math.round(Math.max(customer.min, customer.ask - (customer.ask - price) * HAGGLE.sellerConcession));
    customer.msg = say('lines.counter', { line: tx(lineKey(rng, 'lines.sellerCounter')), n: customer.ask });
  }
  if (customer.pat <= 0) {
    customerLeaves(state, tx('log.noDeal'));
  }
  return null;
}

/** Buy the seller's item; price defaults to their asking price. Returns the bought item. */
export function buyFromSeller(state: GameState, price?: number): Item | null {
  const customer = currentSeller(state);
  if (!customer) {
    return null;
  }
  const paid = price ?? customer.ask;
  const item = customer.item;
  state.credits -= paid;
  state.st.deals++;
  state.inv.push(item);
  if (item.stolen) {
    raiseHeat(state, 1);
  }
  addLog(state, tx('log.bought', { item: itemRef(item.t), n: paid, name: nameRef(customer.name) }));
  floatText(`−${paid}`, COLOR.fg); // a purchase: plain spending, no meaning color
  finishCustomer(state);
  return item;
}

/** Put a stocked item on the counter for a buyer; they name an opening price. */
export function presentItem(state: GameState, uid: number): void {
  const customer = currentBuyer(state);
  const item = findItem(state, uid);
  if (!customer || !item) {
    return;
  }
  customer.item = item;
  customer.max2 = Math.round(buyerBaseValue(item) * customer.mult);
  customer.offer = Math.round(customer.max2 * CUSTOMER.buyerOpeningShare);
  customer.msg = say('lines.offer', { worn: item.cond < CUSTOMER.worndownCondition ? tx('lines.worn') : '', n: customer.offer });
}

export function askBuyer(state: GameState, price: number, rng: Rng): void {
  const customer = currentBuyer(state);
  if (!customer || !isPresentedBuyer(customer)) {
    return;
  }
  if (price <= customer.offer) {
    sellToBuyer(state, customer.offer);
    return;
  }
  if (rng() < buyerAcceptChance(customer, price)) {
    sellToBuyer(state, price);
    return;
  }
  if (price > customer.max2 * HAGGLE.buyerInsultShare) {
    losePatience(state, HAGGLE.insultPatienceLoss);
    customer.msg = say(lineKey(rng, 'lines.buyerInsulted'));
  } else {
    losePatience(state, HAGGLE.counterPatienceLoss);
    customer.offer = Math.round(customer.offer + (customer.max2 - customer.offer) * HAGGLE.buyerConcession);
    customer.msg = say('lines.counter', { line: tx(lineKey(rng, 'lines.buyerCounter')), n: customer.offer });
  }
  if (customer.pat <= 0) {
    customerLeaves(state, tx('log.noDeal'));
  }
}

/** Sell the shown item; price defaults to the buyer's offer. */
export function sellToBuyer(state: GameState, price?: number): void {
  const customer = currentBuyer(state);
  if (!customer || !isPresentedBuyer(customer)) {
    return;
  }
  const paid = price ?? customer.offer;
  const item = customer.item;
  state.credits += paid;
  countSale(state, paid);
  state.inv = state.inv.filter(i => i.uid !== item.uid);
  if (item.stolen) {
    raiseHeat(state, 1);
  }
  if (item.infected) {
    raiseHeat(state, 2);
  }
  addLog(state, tx('log.sold', {
    item: itemRef(item.t), n: paid, name: nameRef(customer.name),
    stolen: item.stolen ? tx('log.soldStolen') : '',
    ai: item.infected ? tx('log.soldAi') : '',
  }));
  floatText(`+${paid}`, MEANING.action);
  finishCustomer(state);
}

/* =====================================================================
   Evening: junkyard, flea market, supplier
   ===================================================================== */

/** Extra digs per visit: always 0 for now — the hook for Patch D gear and skills and for events. */
export const digBonus = (_state: GameState): number => 0;

/** Digs of a fresh visit: the safety cap (midnight and the backpack are the real limits). */
export const digsPerVisit = (state: GameState): number => JUNK.maxDigs + digBonus(state);

/** Evening hours the road to the junkyard costs; every dig then pays its own JUNK.digHours. */
export const junkVisitHours = (): number => JUNK.travelHours;

/** The junkyard is open while the road and at least one dig still fit in the evening. */
export const canGoToJunkyard = (state: GameState): boolean =>
  state.phase === 'evening' && state.where === 'home' && state.hours >= junkVisitHours() + JUNK.digHours;

/** The next dig goes past midnight: the evening hours are spent (each such dig costs a customer tomorrow). */
export const digIsLate = (state: GameState): boolean => state.hours < JUNK.digHours;

/** A dig takes its hour of the evening, or, once the evening is spent, goes past midnight. */
function spendDigTime(state: GameState): void {
  if (digIsLate(state)) {
    state.late++;
  } else {
    state.hours -= JUNK.digHours;
  }
}

/** Rare chance of each find of a dig at this depth (digs done before it): JUNK.rarePerDepth per level. */
export const rareChance = (depth: number): number => DIG_ODDS.rare + JUNK.rarePerDepth * Math.max(0, depth);

/** The backpack has no free place (the finds of this visit still in it). */
export const isBackpackFull = (state: GameState): boolean =>
  !!state.junk && state.junk.f.length >= JUNK.backpackSize;

/** Finds of the last dig waiting for a free place (the backpack was full). */
export const waitingFinds = (state: GameState): Item[] => state.junk?.w ?? [];

export function goToJunkyard(state: GameState, rng: Rng): void {
  if (!canGoToJunkyard(state)) {
    return;
  }
  state.hours -= junkVisitHours();
  state.where = 'junk';
  state.st.raids++; // a run to the junkyard, not every dig
  state.junk = { d: digsPerVisit(state), n: 0, dp: 0, f: [], s: randomSeed(rng) };
  state.jmsg = say('junk.arrive');
}

export function goHome(state: GameState): void {
  if (state.where === 'junk' && state.junk) {
    addLog(state, tx('junk.home', { n: state.junk.f.length }));
  }
  state.where = 'home';
  state.junk = null;
  state.jmsg = '';
}

/** What one dig gave; ui.ts picks the sound and the animation by `kind` (the best find of the dig). */
export interface DigResult {
  kind: 'empty' | 'parts' | 'broken' | 'rare';
  message: Tx;
  /** Items dug up, in the backpack or waiting (`left` of them did not fit). */
  items: Item[];
  parts: number;
  left: number;
}

/** How many items a dig gives: 0 (DIG_ODDS.empty), else 1–3 by DIG_ODDS.items. One rng() call. */
function rollFindCount(rng: Rng): number {
  let roll = rng() - DIG_ODDS.empty;
  if (roll < 0) {
    return 0;
  }
  roll /= 1 - DIG_ODDS.empty;
  const index = DIG_ODDS.items.findIndex(chance => (roll -= chance) < 0);
  return index < 0 ? DIG_ODDS.items.length : index + 1;
}

function pickJunkType(rng: Rng): ItemType {
  const types = Object.keys(JUNK_WEIGHTS) as ItemType[];
  const total = types.reduce((sum, type) => sum + JUNK_WEIGHTS[type], 0);
  let roll = rng() * total;
  return types.find(type => (roll -= JUNK_WEIGHTS[type]) < 0) ?? types[0];
}

/**
 * One find at this depth: rare (★, good condition, clean) or broken (cheap, low condition).
 * You dug it out yourself and saw it: the condition is known, the serial and the insides are not
 * (task 41: unless the category has no check for them — then there is nothing hidden).
 */
function rollFind(state: GameState, depth: number, rng: Rng): Item {
  if (rng() < rareChance(depth)) {
    const item = createItem(state, pickRandom(rng, RARE_FINDS), { cond: randomInt(rng, DIG_LOOT.rareCondMin, DIG_LOOT.rareCondMax), stolen: false, rare: true }, rng);
    item.k.cond = true;
    return item;
  }
  const type = pickJunkType(rng);
  // task 41: a filed serial only where the category has the serial check (the rolls stay in order)
  const item = createItem(state, type, {
    cond: randomInt(rng, DIG_LOOT.brokenCondMin, DIG_LOOT.brokenCondMax),
    defect: rng() < DIG_LOOT.brokenDefect,
    stolen: rng() < DIG_LOOT.brokenStolen && canBeStolen(type),
  }, rng);
  item.k.cond = true;
  // a broken find of a category without the scanner or the diagnostics shows its defect at once: nothing hidden
  if (!canHaveFlaw(type)) {
    item.k.flaw = true;
  }
  return item;
}

/** Puts a find into the backpack (and the stock) if there is a place; false when it is full. */
function packFind(state: GameState, visit: JunkVisit, item: Item): boolean {
  if (visit.f.length >= JUNK.backpackSize) {
    return false;
  }
  state.inv.push(item);
  visit.f.push(item.uid);
  return true;
}

/** The message of a dig: the finds (a rare one first, with its key junk.rare for the ★), the parts, what did not fit. */
function digMessage(items: Item[], parts: number, waiting: Item[]): Tx {
  const rare = items.find(isRareItem);
  const others = items.filter(item => item !== rare).map(item => itemRef(item.t));
  let message: Tx;
  if (rare) {
    const found = tx('junk.rare', { name: itemRef(rare.t) });
    message = others.length ? tx('junk.rareWith', { r: found, list: others }) : found;
  } else if (items.length) {
    message = tx('junk.found', { list: others });
  } else {
    message = tx(parts ? 'junk.parts' : 'junk.empty', { n: parts });
  }
  if (items.length && parts) {
    message = tx('junk.andParts', { m: message, n: parts });
  }
  if (waiting.length) {
    message = tx('junk.full', { m: message, list: waiting.map(item => itemRef(item.t)) });
  }
  return message;
}

/**
 * "Копать": one dig of the heap, one level deeper. Gives 0–3 items (each may be rare, more so
 * deeper) and 0–2 parts. The items go into the backpack while it has places; the rest wait for
 * a place (throwAway lets them in) and are left behind by the next dig or the road home.
 */
export function dig(state: GameState, rng: Rng): DigResult | null {
  const visit = state.junk;
  if (state.where !== 'junk' || !visit || visit.d <= 0) {
    return null;
  }
  delete visit.w; // what waited for a place is left on the heap
  const depth = visit.dp;
  visit.d--;
  visit.dp++;
  spendDigTime(state);
  const items = Array.from({ length: rollFindCount(rng) }, () => rollFind(state, depth, rng));
  const parts = randomInt(rng, DIG_LOOT.partsMin, DIG_LOOT.partsMax);
  state.parts += parts;
  items.filter(isRareItem).forEach(item => noteStar(state, item));
  const waiting = items.filter(item => !packFind(state, visit, item));
  if (waiting.length) {
    visit.w = waiting;
  }
  const kind: DigResult['kind'] = items.some(isRareItem) ? 'rare' : items.length ? 'broken' : parts ? 'parts' : 'empty';
  if (parts) {
    floatText(`+${parts} ⚙`, MEANING.action);
  }
  if (kind === 'rare') {
    floatText('', MEANING.rare, 'rare'); // a rare find: the pixel ★, not a font glyph
  } else if (items.length) {
    floatText(`+${items.length}`, MEANING.wear); // broken finds
  }
  const message = digMessage(items, parts, waiting);
  state.jmsg = JSON.stringify(message);
  addLog(state, tx('log.dig', { m: message }));
  if (visit.d === 0) {
    addLog(state, tx('junk.noDigs'));
  }
  return { kind, message, items, parts, left: waiting.length };
}

/**
 * "Выбросить": a find of this visit leaves the backpack and is gone (not to the stock). If a find
 * of the last dig waits for a place, the first one takes it. Returns the find that came in, if any.
 */
export function throwAway(state: GameState, uid: number): Item | null {
  const visit = state.junk;
  if (state.where !== 'junk' || !visit || !visit.f.includes(uid)) {
    return null;
  }
  visit.f = visit.f.filter(found => found !== uid);
  state.inv = state.inv.filter(item => item.uid !== uid);
  const next = visit.w?.shift() ?? null;
  if (next) {
    packFind(state, visit, next);
  }
  if (visit.w && !visit.w.length) {
    delete visit.w;
  }
  return next;
}

/** "Оставить находку": the finds waiting for a place stay on the heap. */
export function leaveWaiting(state: GameState): void {
  if (state.junk) {
    delete state.junk.w;
  }
}

export const canVisitMarket = (state: GameState): boolean => state.hours >= MARKET.hours && !state.market && state.credits >= MARKET.price;

export function visitMarket(state: GameState): void {
  if (!canVisitMarket(state)) {
    return;
  }
  state.hours -= MARKET.hours;
  state.market = true;
  state.credits -= MARKET.price;
  state.parts += MARKET.parts;
  addLog(state, tx('log.market', { n: MARKET.parts, price: MARKET.price }));
}

export function orderParts(state: GameState): void {
  if (state.credits < SUPPLIER.price) {
    return;
  }
  state.credits -= SUPPLIER.price;
  state.parts += SUPPLIER.parts;
  addLog(state, tx('log.supplier', { n: SUPPLIER.parts }));
}

/* =====================================================================
   Night
   ===================================================================== */

/** Each infected item may infect one more electronic item on the shelf. */
function spreadInfection(state: GameState, events: Tx[], rng: Rng): void {
  const infectedCount = state.inv.filter(item => item.infected).length;
  for (let i = 0; i < infectedCount; i++) {
    if (rng() >= NIGHT.infectionSpreadChance) {
      continue;
    }
    const targets = state.inv.filter(item => !item.infected && ITEM_TYPES[item.t]?.electronic);
    if (!targets.length) {
      continue;
    }
    const victim = pickRandom(rng, targets);
    victim.infected = true;
    victim.k.flaw = false;
    events.push(tx('night.infection', { item: itemRef(victim.t) }));
  }
}

/**
 * Task 36: will the wholesaler come today, and after how many customers. By the morning stock;
 * no roll for a small stock (the games stay as before the wholesaler).
 */
function rollWholesaler(state: GameState, rng: Rng): void {
  delete state.bk;
  const chance = wholesaleChance(massStock(state).length);
  if (chance > 0 && rng() < chance) {
    state.bk = randomInt(rng, 0, state.cn - 1);
  }
}

function startNewDay(state: GameState, rng: Rng): void {
  state.day++;
  state.slot = 0;
  // state.late stays: last night's digs past midnight open the shop later today
  state.phase = 'shop';
  state.hours = 0;
  state.junk = null;
  state.llDone = false;
  state.llAt = randomLandlordSlot(rng);
}

/** Heat cools by 1 overnight, but yesterday's heat decides the raid chance. */
function coolDownAndMaybeRaid(state: GameState, events: Tx[], rng: Rng): void {
  const heatBefore = state.heat;
  state.heat = Math.max(0, state.heat - 1);
  if (state.over || rng() >= heatBefore * NIGHT.raidChancePerHeat) {
    return;
  }
  const stolen = state.inv.filter(item => item.stolen);
  const fine = NIGHT.raidBaseFine + stolen.length * NIGHT.raidFinePerItem;
  state.inv = state.inv.filter(item => !item.stolen);
  state.credits = Math.max(0, state.credits - fine);
  state.heat = 0;
  events.push(tx('night.raid', { n: stolen.length, fine }));
}

/** What the morning took (or nothing: the game ended, or a closed calm debt pays no bills). */
export interface ExpensesPaid {
  energy: number;
  /** The weekly fee to the deck, 0 on other days. */
  tier: number;
  /** Paid from the credits. */
  paid: number;
  /** Not covered by the credits. */
  shortfall: number;
  /** The part of the shortfall that went onto the debt: all of it, or 0 once the seat is bought. */
  toDebt: number;
}

/** Today's bills: energy every day, the deck fee on the first day of the station week. The hook for Patch C events. */
export function expensesToday(state: GameState): Pick<ExpensesPaid, 'energy' | 'tier'> {
  return {
    energy: EXPENSES.energyPerDay,
    tier: weekdayOf(state) === EXPENSES.tierFeeWeekday ? EXPENSES.tierFee : 0,
  };
}

/**
 * The morning bills: from the credits, the rest onto the debt. Once the seat on the shuttle is
 * bought the rest is not written onto the debt (balance 17.11): the bought seat is never at risk.
 */
export function payExpenses(state: GameState): ExpensesPaid | null {
  if (isDebtClosed(state)) {
    return null; // calm after the debt: the shop goes on without payments
  }
  const { energy, tier } = expensesToday(state);
  const paid = Math.min(state.credits, energy + tier);
  const shortfall = energy + tier - paid;
  const toDebt = state.seat ? 0 : shortfall;
  state.credits -= paid;
  state.debt += toDebt;
  return { energy, tier, paid, shortfall, toDebt };
}

/** Lines of the morning bills for the log and the morning window; `debt` is the debt after them. */
export function expenseLines(expenses: ExpensesPaid, debt: number): { paid: Tx; shortfall: Tx | null } {
  const items = [tx('expense.energy', { n: expenses.energy })];
  if (expenses.tier) {
    items.push(tx('expense.tier', { n: expenses.tier }));
  }
  const shortfall = expenses.toDebt ? tx('expense.shortfall', { n: expenses.shortfall, debt }) : tx('expense.unpaid', { n: expenses.shortfall });
  return {
    paid: tx('expense.paid', { items }),
    shortfall: expenses.shortfall ? shortfall : null,
  };
}

/** The night is over: its events for the morning window, and the morning bills. */
export interface MorningReport {
  /** Night events as messages (the screen translates them). */
  events: Tx[];
  expenses: ExpensesPaid | null;
}

/** Ends the day; returns the night events and the morning bills for the morning report. */
export function sleepUntilMorning(state: GameState, rng: Rng): MorningReport {
  state.where = 'home';
  const events: Tx[] = [];
  spreadInfection(state, events, rng);
  startNewDay(state, rng);
  if (hasShuttle(state) && state.day >= state.shuttleDay) {
    // the last shuttle leaves this morning: the game ends, no raid and no landlord
    if (state.seat) {
      depart(state, false);
      if (state.st.toll) {
        events.push(tx('final.rampLog', { n: state.st.toll }));
      }
      events.push(tx('ending.left.line'));
    } else {
      endGame(state, 'stayed');
      events.push(tx('ending.stayed.line'));
    }
    return { events, expenses: null };
  }
  const daysToShuttle = state.shuttleDay - state.day;
  if (hasShuttle(state) && (DEBT.shuttleReminders as readonly number[]).includes(daysToShuttle)) {
    events.push(tx('debt.shuttleSoon', { days: tx('plural.days', { n: daysToShuttle }) }));
  }
  if (state.debt > 0 && state.day >= state.nextDue) {
    const today = tx('debt.landlordToday', { amount: state.owed });
    events.push(state.deferred ? tx('join.glue', { a: today, b: tx('debt.noMoreDefer') }) : today);
  }
  coolDownAndMaybeRaid(state, events, rng);
  // the bills come after the raid's fine: what is left pays them
  const expenses = payExpenses(state);
  // the morning's heat (after the night and a raid) and last night's digs decide today's customers
  state.cn = customersToday(state).count;
  rollWholesaler(state, rng);
  // the late opening goes to the log only: the morning window already lists it as a reason
  if (state.late > 0) {
    addLog(state, tx('day.overslept', { n: state.late * JUNK.lateCustomerLoss }));
    addLog(state, tx('day.opened', { time: formatHour(openingHour(state)) }));
  }
  if (!events.length) {
    events.push(tx('night.quiet'));
  }
  events.forEach(event => addLog(state, event));
  if (expenses) {
    const lines = expenseLines(expenses, state.debt);
    addLog(state, lines.paid);
    if (lines.shortfall) {
      addLog(state, lines.shortfall);
    }
  }
  return { events, expenses };
}

/* =====================================================================
   Workbench & crafting
   ===================================================================== */

export const scrapValue = (item: Item): number => Math.max(1, Math.round(ITEM_TYPES[item.t].basePrice / 80 + item.cond / 50));
export const isOnCounter = (state: GameState, item: Item): boolean => !!state.cust && 'item' in state.cust && !!state.cust.item && state.cust.item.uid === item.uid;

const BENCH_ACTIONS: Record<string, (state: GameState, item: Item) => void> = {
  diag(state, item) {
    item.k = fullKnowledge();
    addLog(state, tx('log.diag', { item: itemRef(item.t) }));
  },
  repair(state, item) {
    item.cond = Math.min(100, item.cond + REPAIR_AMOUNT);
    item.k.cond = true;
    addLog(state, tx('log.repair', { item: itemRef(item.t), n: item.cond }));
  },
  fix(state, item) {
    item.defect = false;
    addLog(state, tx('log.fix', { item: itemRef(item.t) }));
  },
  purge(state, item) {
    item.infected = false;
    addLog(state, tx('log.purge', { item: itemRef(item.t) }));
  },
  wipe(state, item) {
    item.stolen = false;
    raiseHeat(state, 1);
    addLog(state, tx('log.wipe', { item: itemRef(item.t) }));
  },
  scrap(state, item) {
    if (isOnCounter(state, item)) {
      return;
    }
    const gained = scrapValue(item);
    state.parts += gained;
    state.inv = state.inv.filter(i => i !== item);
    addLog(state, tx('log.scrap', { item: itemRef(item.t), n: gained }));
  },
};

/** A workbench action on the item `uid` (the selected one). */
export function useWorkbench(state: GameState, uid: number | null, action: string): void {
  const item = findItem(state, uid);
  if (!item) {
    return;
  }
  const cost = BENCH_COST[action] || 0;
  if (state.parts < cost) {
    return;
  }
  state.parts -= cost;
  if (Object.hasOwn(BENCH_ACTIONS, action)) {
    BENCH_ACTIONS[action](state, item);
  }
}

/** Stock of a type that is free to use (not lying on the counter). */
export const availableOfType = (state: GameState, type: ItemType): Item[] =>
  state.inv.filter(item => item.t === type && !isOnCounter(state, item));

/** Ingredients of a recipe as [type, count] pairs. */
export const recipeNeeds = (recipe: Recipe): [ItemType, number][] =>
  Object.entries(recipe.need) as [ItemType, number][];

export function canCraft(state: GameState, recipe: Recipe): boolean {
  return state.parts >= recipe.parts && recipeNeeds(recipe).every(([type, count]) => availableOfType(state, type).length >= count);
}

/** Builds recipe `index`; returns the new item (ui.ts selects it on the stock tab). */
export function craft(state: GameState, index: number, rng: Rng): Item | null {
  const recipe = RECIPES[index];
  if (!recipe || !canCraft(state, recipe)) {
    return null;
  }
  const used: Item[] = [];
  recipeNeeds(recipe).forEach(([type, count]) => used.push(...availableOfType(state, type).slice(0, count)));
  state.inv = state.inv.filter(item => !used.includes(item));
  state.parts -= recipe.parts;
  const averageCondition = used.reduce((sum, item) => sum + item.cond, 0) / used.length;
  const cond = Math.min(100, Math.round(averageCondition + CRAFT_CONDITION_BONUS));
  // a new build gets a fresh serial number, but the AI virus survives
  const item = createItem(state, recipe.out, { cond, stolen: false, defect: false, infected: used.some(part => part.infected), known: true }, rng);
  state.inv.push(item);
  floatText(tx('float.crafted'), MEANING.action);
  addLog(state, tx('log.crafted', { item: itemRef(recipe.out), n: cond, ai: item.infected ? tx('log.craftedAi') : '' }));
  return item;
}
