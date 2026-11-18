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
  ACCEPT, HUNCH_VERDICT, HUNCH_VERDICT_TEXT, BENCH_COST, BUYER_COUNTER_LINES, BUYER_INSULTED_LINES, BUYER_LINES, COLLATERAL,
  buyerShare, CRAFT_CONDITION_BONUS, CUSTOMER, DAY_TEXT, DEBT, DEBT_TEXT, ENDING_TEXT, EXPENSE_TEXT, EXPENSES, DIG_LOOT, DIG_ODDS, EVENING_HOURS, JUNK_TEXT, HAGGLE, HUMAN_NAMES,
  INSPECT, ITEM_TYPES, JUNK, LANDLORD_NAME, LANDLORD_SEED, MARKET, MAX_HEAT, NIGHT, RARE_FINDS,
  RECIPES, RENT, REPAIR_AMOUNT, ROBOT_NAMES, SELLER_COUNTER_LINES, SELLER_INSULTED_LINES, SELLER_LINES,
  SELLER_STOLEN_LINE, SUPPLIER, VALUE,
} from './data';
import { COLOR, MEANING } from './palette';
import { appearanceFor } from './appearance';
import { customersToday, formatHour, openingHour, weekdayOf } from './day';
import { addLog, createItem, findItem, fullKnowledge, randomLandlordSlot } from './state';
import { pickRandom, randomBetween, randomInt, randomSeed } from './rng';
import type { Rng } from './rng';
import type { StarKind } from './star';
import type {
  BuyerCustomer, Ending, GameState, InspectCheck, Item, ItemType, JunkVisit, PresentedBuyer, Recipe, SellerCustomer,
} from './types';
import { clamp, daysRu, fill, roundTo10 } from './util';

const TEXT = DEBT_TEXT.ru;
const JUNK_WORDS = JUNK_TEXT.ru;
const DAY_WORDS = DAY_TEXT.ru;

/* =====================================================================
   Feedback for the UI: floating numbers to show after the action.
   ===================================================================== */

export interface FloatingText {
  text: string;
  color: string;
  /** A pixel star drawn before the text (a rare find). */
  star?: StarKind;
}

export const feedback: { floats: FloatingText[] } = { floats: [] };

function floatText(text: string, color: string, star?: StarKind): void {
  feedback.floats.push(star ? { text, color, star } : { text, color });
}

/* =====================================================================
   Item value
   ===================================================================== */

export const itemName = (type: ItemType): string => ITEM_TYPES[type].name;

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
    const msg = pickRandom(rng, BUYER_LINES).replace('{t}', itemName(want).toLowerCase());
    state.cust = { ...base, kind: 'buy', want, mult, item: null, msg };
  } else {
    const item = createItem(state, pickRandomItemType(rng), {}, rng);
    const ask = Math.round(cleanValue(item) * randomBetween(rng, CUSTOMER.sellerAskMin, CUSTOMER.sellerAskMax));
    const min = Math.round(trueValue(item) * (item.stolen ? CUSTOMER.sellerMinStolen : CUSTOMER.sellerMinClean));
    const msg = item.stolen && rng() < CUSTOMER.stolenRushLineChance ? SELLER_STOLEN_LINE : pickRandom(rng, SELLER_LINES);
    state.cust = { ...base, kind: 'sell', item, ask, min, msg };
  }
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
  // the very first visitor of a new game always sells, to teach the basics
  createCustomer(state, state.day === 1 && state.slot === 0, rng);
  return true;
}

function landlordGreeting(state: GameState): string {
  if (state.deferred) {
    return `Отсрочка кончилась. С тебя ${state.owed} кр., сегодня.`;
  }
  if (state.credits >= state.owed) {
    return `Платёж. ${state.owed} кр., как договаривались.`;
  }
  return `Платёж, ${state.owed} кр. Не хватает? Могу подождать пару дней. Под процент.`;
}

function spawnLandlord(state: GameState): void {
  const msg = landlordGreeting(state);
  state.cust = { kind: 'rent', name: LANDLORD_NAME, seed: LANDLORD_SEED, msg, pat: 0, max: 0, done: {} };
}

export function customerLeaves(state: GameState, reason?: string): void {
  if (!state.cust) {
    return;
  }
  addLog(state, `${state.cust.name} ушёл(ла). ${reason || ''}`);
  finishCustomer(state);
}

/** The visitor leaves the counter (ui.ts sees `cust` gone and walks the figure out). */
function finishCustomer(state: GameState): void {
  const customer = state.cust;
  if (!customer) {
    return;
  }
  const wasLandlord = customer.kind === 'rent';
  state.cust = null;
  if (!wasLandlord) {
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
  addLog(state, 'Лавка закрыта. Вечер свободен.');
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
  state.debt = Math.max(0, state.debt - amount);
}

/** Last line of a payment: the debt is gone. */
function logIfDebtPaid(state: GameState): void {
  if (state.debt === 0) {
    addLog(state, TEXT.debtPaid);
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
  state.cust.msg = 'Приятно иметь дело.';
  settleRent(state);
  addLog(state, fill(TEXT.paymentPaid, { amount, debt: state.debt }) + (state.debt > 0 ? ' ' + fill(TEXT.paymentNext, { amount: state.owed, day: state.nextDue }) : ''));
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
  addLog(state, fill(TEXT.deferred, { day: state.nextDue, amount: state.owed, debt: state.debt }));
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
  const taken = plan.items.map(item => itemName(item.t)).join(', ');
  const overNote = plan.over ? ` Сдачи не будет (переплата ~${plan.over} кр.).` : '';
  const hotNote = plan.hot ? ` Краденое (${plan.hot}) ушло по его каналам, розыск −${relief}.` : '';
  addLog(state, `Гробов забрал ${plan.cash} кр. и товар: ${taken}.${overNote}${hotNote}`);
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
  addLog(state, fill(TEXT.paidEarly, { amount: paid, debt: state.debt - paid }));
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
  addLog(state, fill(TEXT.seatBought, { price }));
  return true;
}

/** Ends the game: the ending's line becomes the game-over text. */
export function endGame(state: GameState, ending: Ending): void {
  state.ending = ending;
  state.over = ENDING_TEXT.ru[ending].line;
  addLog(state, state.over);
}

/* =====================================================================
   Inspection of a seller's item
   ===================================================================== */

function revealCondition(customer: SellerCustomer, item: Item): void {
  item.k.cond = true;
  customer.msg = `Состояние ${item.cond}%. ${item.cond < INSPECT.lowCondition ? 'Ну, работает же.' : 'Видишь, хорошая вещь.'}`;
}

function revealSerial(customer: SellerCustomer, item: Item): void {
  item.k.serial = true;
  if (item.stolen) {
    customer.ask = Math.max(customer.min, Math.round(customer.ask * INSPECT.stolenAskMult));
    customer.min = Math.round(customer.min * INSPECT.stolenMinMult);
    customer.msg = '…Серийник? Его и не было. Ладно, скину цену.';
  } else {
    customer.msg = 'Серийник чистый, сам видишь.';
  }
}

function revealFlaw(customer: SellerCustomer, item: Item): void {
  item.k.flaw = true;
  if (item.infected) {
    customer.ask = Math.max(customer.min, Math.round(customer.ask * INSPECT.infectedAskMult));
    customer.min = Math.round(customer.min * INSPECT.infectedMinMult);
    customer.msg = 'Какой ещё ИИ? Я не знал! Забирай дешевле.';
  } else if (item.defect) {
    customer.ask = Math.max(customer.min, Math.round(customer.ask * INSPECT.defectAskMult));
    customer.msg = 'Ну да, контакт отходит. Учту в цене.';
  } else {
    customer.msg = 'Начинка в порядке. Говорил же.';
  }
}

const REVEALS: Record<InspectCheck, (customer: SellerCustomer, item: Item) => void> = {
  cond: revealCondition,
  serial: revealSerial,
  flaw: revealFlaw,
};

export function isInspectCheck(value: string | undefined): value is InspectCheck {
  return value === 'cond' || value === 'serial' || value === 'flaw';
}

/** Each check costs patience (never the last point). Returns whether the check was made (ui.ts plays the scan). */
export function inspect(state: GameState, check: InspectCheck): boolean {
  const customer = currentSeller(state);
  if (!customer || customer.done[check]) {
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

export type HunchVerdict = keyof typeof HUNCH_VERDICT_TEXT.ru;

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
    customer.msg = 'У тебя столько нет, не смеши.';
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
    customer.msg = pickRandom(rng, SELLER_INSULTED_LINES);
  } else {
    losePatience(state, HAGGLE.counterPatienceLoss);
    customer.ask = Math.round(Math.max(customer.min, customer.ask - (customer.ask - price) * HAGGLE.sellerConcession));
    customer.msg = pickRandom(rng, SELLER_COUNTER_LINES) + ` ${customer.ask} кр.`;
  }
  if (customer.pat <= 0) {
    customerLeaves(state, 'Не сторговались.');
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
  state.inv.push(item);
  if (item.stolen) {
    raiseHeat(state, 1);
  }
  addLog(state, `Куплено: ${itemName(item.t)} за ${paid} кр. у ${customer.name}.`);
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
  customer.msg = `${item.cond < CUSTOMER.worndownCondition ? 'Потрёпан. ' : ''}Дам ${customer.offer} кр.`;
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
    customer.msg = pickRandom(rng, BUYER_INSULTED_LINES);
  } else {
    losePatience(state, HAGGLE.counterPatienceLoss);
    customer.offer = Math.round(customer.offer + (customer.max2 - customer.offer) * HAGGLE.buyerConcession);
    customer.msg = pickRandom(rng, BUYER_COUNTER_LINES) + ` ${customer.offer} кр.`;
  }
  if (customer.pat <= 0) {
    customerLeaves(state, 'Не сторговались.');
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
  state.inv = state.inv.filter(i => i.uid !== item.uid);
  let note = '';
  if (item.stolen) {
    raiseHeat(state, 1);
    note = ' Краденое ушло дальше.';
  }
  if (item.infected) {
    raiseHeat(state, 2);
    note += ' Вещь была заражена ИИ, служба безопасности насторожилась.';
  }
  addLog(state, `Продано: ${itemName(item.t)} за ${paid} кр. (${customer.name}).${note}`);
  floatText(`+${paid}`, MEANING.action);
  finishCustomer(state);
}

/* =====================================================================
   Evening: junkyard, flea market, supplier
   ===================================================================== */

/** Extra digs per visit: always 0 for now — the hook for Patch D gear and skills and for events. */
export const digBonus = (_state: GameState): number => 0;

/** Digs of a fresh visit. */
export const digsPerVisit = (state: GameState): number => JUNK.digsBase + digBonus(state);

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

/** Noise word index: 0 тихо, 1 слышно, 2 громко, 3 дрон рядом. */
export type NoiseLevel = 0 | 1 | 2 | 3;

export function noiseLevel(noise: number): NoiseLevel {
  const index = JUNK.noiseLevels.findIndex(limit => noise < limit);
  return (index < 0 ? 3 : index) as NoiseLevel;
}

/** Drone chance of the next dig: (noise / scale)², never on the first dig of a visit. */
export function droneChance(visit: JunkVisit): number {
  if (visit.dp === 0) {
    return 0;
  }
  return Math.min(1, (visit.n / JUNK.droneNoiseScale) ** 2);
}

/** Rare-find chance of a dig at this depth: deeper digs take chance from "empty". */
export const rareChance = (depth: number): number =>
  DIG_ODDS.rare + Math.min(DIG_ODDS.empty, JUNK.rarePerDepth * depth);

export function goToJunkyard(state: GameState, rng: Rng): void {
  if (!canGoToJunkyard(state)) {
    return;
  }
  state.hours -= junkVisitHours();
  state.where = 'junk';
  state.junk = { d: digsPerVisit(state), n: 0, dp: 0, f: [], s: randomSeed(rng) };
  state.jmsg = JUNK_WORDS.arrive;
}

export function goHome(state: GameState): void {
  if (state.where === 'junk' && state.junk) {
    addLog(state, fill(JUNK_WORDS.home, { n: state.junk.f.length }));
  }
  state.where = 'home';
  state.junk = null;
  state.jmsg = '';
}

/** What one dig gave; ui.ts picks the sound and the animation by `kind`. */
export interface DigResult {
  kind: 'empty' | 'parts' | 'broken' | 'rare' | 'drone';
  message: string;
}

/** Rolls the heap's loot at this depth; applies it and returns the result. */
function rollLoot(state: GameState, visit: JunkVisit, rng: Rng): DigResult {
  let roll = rng();
  roll -= DIG_ODDS.parts;
  if (roll < 0) {
    const found = randomInt(rng, DIG_LOOT.partsMin, DIG_LOOT.partsMax);
    state.parts += found;
    floatText(`+${found} ⚙`, MEANING.action);
    return { kind: 'parts', message: fill(JUNK_WORDS.parts, { n: found }) };
  }
  roll -= DIG_ODDS.broken;
  if (roll < 0) {
    const type = pickRandomItemType(rng);
    const item = createItem(state, type, {
      cond: randomInt(rng, DIG_LOOT.brokenCondMin, DIG_LOOT.brokenCondMax),
      defect: rng() < DIG_LOOT.brokenDefect,
      stolen: rng() < DIG_LOOT.brokenStolen,
    }, rng);
    state.inv.push(item);
    visit.f.push(item.uid);
    floatText('+1', MEANING.wear); // a broken find
    return { kind: 'broken', message: fill(JUNK_WORDS.broken, { name: itemName(type) }) };
  }
  roll -= rareChance(visit.dp - 1);
  if (roll < 0) {
    const type = pickRandom(rng, RARE_FINDS);
    const item = createItem(state, type, { cond: randomInt(rng, DIG_LOOT.rareCondMin, DIG_LOOT.rareCondMax), stolen: false, rare: true }, rng);
    state.inv.push(item);
    visit.f.push(item.uid);
    floatText('', MEANING.rare, 'rare'); // a rare find: the pixel ★, not a font glyph
    return { kind: 'rare', message: fill(JUNK_WORDS.rare, { name: itemName(type) }) };
  }
  return { kind: 'empty', message: JUNK_WORDS.empty };
}

/** The guard drone: takes one find of this visit (if any is still here) or raises the wanted level; the visit ends. */
function droneCatches(state: GameState, visit: JunkVisit, rng: Rng): DigResult {
  visit.d = 0;
  visit.run = true;
  const finds = state.inv.filter(item => visit.f.includes(item.uid));
  if (finds.length) {
    const taken = pickRandom(rng, finds);
    state.inv = state.inv.filter(item => item.uid !== taken.uid);
    visit.f = visit.f.filter(uid => uid !== taken.uid);
    floatText('−1', MEANING.risk);
    return { kind: 'drone', message: fill(JUNK_WORDS.droneTook, { name: itemName(taken.t) }) };
  }
  state.heat = Math.min(MAX_HEAT, state.heat + JUNK.droneHeat);
  floatText(`+${JUNK.droneHeat}`, MEANING.risk);
  return { kind: 'drone', message: fill(JUNK_WORDS.droneHeat, { n: JUNK.droneHeat }) };
}

/**
 * "Копать": one dig of the heap. The drone may come first (its chance is set by the
 * noise so far); otherwise the dig makes noise, goes one level deeper and rolls the loot.
 */
export function dig(state: GameState, rng: Rng): DigResult | null {
  const visit = state.junk;
  if (state.where !== 'junk' || !visit || visit.d <= 0) {
    return null;
  }
  const caught = rng() < droneChance(visit);
  visit.n = Math.min(100, visit.n + JUNK.noisePerDig + randomInt(rng, -JUNK.noiseSpread, JUNK.noiseSpread));
  visit.d--;
  visit.dp++;
  spendDigTime(state);
  const result = caught ? droneCatches(state, visit, rng) : rollLoot(state, visit, rng);
  state.jmsg = result.message;
  addLog(state, 'Свалка: ' + result.message);
  if (!caught && visit.d === 0) {
    addLog(state, JUNK_WORDS.noDigs);
  }
  return result;
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
  addLog(state, 'Барахолка: 5 запчастей за 50 кр.');
}

export function orderParts(state: GameState): void {
  if (state.credits < SUPPLIER.price) {
    return;
  }
  state.credits -= SUPPLIER.price;
  state.parts += SUPPLIER.parts;
  addLog(state, 'Заказано 5 запчастей у снабженца.');
}

/* =====================================================================
   Night
   ===================================================================== */

/** Each infected item may infect one more electronic item on the shelf. */
function spreadInfection(state: GameState, events: string[], rng: Rng): void {
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
    events.push(`Ночью на складе что-то мигало. ${itemName(victim.t)} ведёт себя странно.`);
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
function coolDownAndMaybeRaid(state: GameState, events: string[], rng: Rng): void {
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
  events.push(`Утренний рейд патруля. Изъято краденого: ${stolen.length}. Штраф ${fine} кр.`);
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
export function expenseLines(expenses: ExpensesPaid, debt: number): { paid: string; shortfall: string | null } {
  const words = EXPENSE_TEXT.ru;
  const items = [fill(words.energy, { n: expenses.energy })];
  if (expenses.tier) {
    items.push(fill(words.tier, { n: expenses.tier }));
  }
  const shortfall = expenses.toDebt ? fill(words.shortfall, { n: expenses.shortfall, debt }) : fill(words.unpaid, { n: expenses.shortfall });
  return {
    paid: fill(words.paid, { items: items.join(', ') }),
    shortfall: expenses.shortfall ? shortfall : null,
  };
}

/** The night is over: its events for the morning window, and the morning bills. */
export interface MorningReport {
  events: string[];
  expenses: ExpensesPaid | null;
}

/** Ends the day; returns the night events and the morning bills for the morning report. */
export function sleepUntilMorning(state: GameState, rng: Rng): MorningReport {
  state.where = 'home';
  const events: string[] = [];
  spreadInfection(state, events, rng);
  startNewDay(state, rng);
  if (hasShuttle(state) && state.day >= state.shuttleDay) {
    // the last shuttle leaves this morning: the game ends, no raid and no landlord
    endGame(state, state.seat ? 'left' : 'stayed');
    events.push(state.over ?? '');
    return { events, expenses: null };
  }
  const daysToShuttle = state.shuttleDay - state.day;
  if (hasShuttle(state) && (DEBT.shuttleReminders as readonly number[]).includes(daysToShuttle)) {
    events.push(fill(TEXT.shuttleSoon, { days: daysRu(daysToShuttle) }));
  }
  if (state.debt > 0 && state.day >= state.nextDue) {
    events.push(fill(TEXT.landlordToday, { amount: state.owed }) + (state.deferred ? ' Отсрочки больше не будет.' : ''));
  }
  coolDownAndMaybeRaid(state, events, rng);
  // the bills come after the raid's fine: what is left pays them
  const expenses = payExpenses(state);
  // the morning's heat (after the night and a raid) and last night's digs decide today's customers
  state.cn = customersToday(state).count;
  // the late opening goes to the log only: the morning window already lists it as a reason
  if (state.late > 0) {
    addLog(state, fill(DAY_WORDS.overslept, { n: state.late * JUNK.lateCustomerLoss }));
    addLog(state, fill(DAY_WORDS.opened, { time: formatHour(openingHour(state)) }));
  }
  if (!events.length) {
    events.push('Тихая ночь на нижнем ярусе.');
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
    addLog(state, `Диагностика: ${itemName(item.t)}.`);
  },
  repair(state, item) {
    item.cond = Math.min(100, item.cond + REPAIR_AMOUNT);
    item.k.cond = true;
    addLog(state, `Ремонт: ${itemName(item.t)} → ${item.cond}%.`);
  },
  fix(state, item) {
    item.defect = false;
    addLog(state, `Дефект устранён: ${itemName(item.t)}.`);
  },
  purge(state, item) {
    item.infected = false;
    addLog(state, `ИИ вычищен из: ${itemName(item.t)}.`);
  },
  wipe(state, item) {
    item.stolen = false;
    raiseHeat(state, 1);
    addLog(state, `Серийник перебит: ${itemName(item.t)}.`);
  },
  scrap(state, item) {
    if (isOnCounter(state, item)) {
      return;
    }
    const gained = scrapValue(item);
    state.parts += gained;
    state.inv = state.inv.filter(i => i !== item);
    addLog(state, `Разобрано: ${itemName(item.t)}, +${gained} запч.`);
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
  floatText('СОБРАНО', MEANING.action);
  addLog(state, `Собрано: ${itemName(recipe.out)} (${cond}%).${item.infected ? ' Похоже, ИИ перебрался в новую сборку.' : ''}`);
  return item;
}
