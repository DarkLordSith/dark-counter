// =====================================================================
//  economy.ts — game rules: item value, customers and haggling, the debt
//  (weekly payment, early payments, shuttle seat, endings),
//  evening (junkyard, flea market), night events, workbench, crafting.
//  No DOM here: rules change `state` and return results; floating
//  numbers are queued in `feedback` and shown by ui.ts.
// =====================================================================
import {
  ACCEPT, HUNCH_VERDICT, HUNCH_VERDICT_TEXT, BENCH_COST, BUYER_COUNTER_LINES, BUYER_INSULTED_LINES, BUYER_LINES, COLLATERAL,
  CRAFT_CONDITION_BONUS, CUSTOMER, CUSTOMERS_PER_DAY, DEBT, DEBT_TEXT, ENDING_TEXT, DIG_LOOT, DIG_ODDS, EVENING_HOURS, JUNK_TEXT, HAGGLE, HUMAN_NAMES,
  INSPECT, ITEM_TYPES, JUNK, LANDLORD_NAME, LANDLORD_SEED, MARKET, MAX_HEAT, NIGHT, RARE_FINDS,
  RECIPES, RENT, REPAIR_AMOUNT, ROBOT_NAMES, SELLER_COUNTER_LINES, SELLER_INSULTED_LINES, SELLER_LINES,
  SELLER_STOLEN_LINE, SUPPLIER, VALUE,
} from './data';
import { COLOR, MEANING } from './palette';
import { appearanceFor } from './appearance';
import {
  actor, actorEnter, addLog, createItem, findItem, fullKnowledge, randomLandlordSlot, state, ui,
} from './state';
import type {
  BuyerCustomer, Ending, GameState, InspectCheck, Item, ItemType, JunkVisit, PresentedBuyer, Recipe, SellerCustomer,
} from './types';
import { clamp, daysRu, fill, pickRandom, randomBetween, randomInt, randomSeed, roundTo10 } from './util';

const TEXT = DEBT_TEXT.ru;
const JUNK_WORDS = JUNK_TEXT.ru;

/* =====================================================================
   Feedback for the UI: floating numbers to show after the action.
   ===================================================================== */

export interface FloatingText {
  text: string;
  color: string;
}

export const feedback: { floats: FloatingText[] } = { floats: [] };

function floatText(text: string, color: string): void {
  feedback.floats.push({ text, color });
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

function raiseHeat(amount: number): void {
  state.heat = Math.min(MAX_HEAT, state.heat + amount);
}

function pickRandomItemType(): ItemType {
  const types = Object.keys(ITEM_TYPES) as ItemType[];
  const totalWeight = types.reduce((sum, type) => sum + ITEM_TYPES[type].spawnWeight, 0);
  let roll = Math.random() * totalWeight;
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
function currentSeller(): SellerCustomer | null {
  return state.cust?.kind === 'sell' ? state.cust : null;
}

function currentBuyer(): BuyerCustomer | null {
  return state.cust?.kind === 'buy' ? state.cust : null;
}

/**
 * Note on field order: the object literals below keep the same key order
 * as the original code, so saves stay byte-identical (parity tests).
 */
function createCustomer(forceSeller: boolean): void {
  const isBuyer = !forceSeller && state.inv.length > 0 && Math.random() < CUSTOMER.buyerChance;
  const seed = randomSeed();
  const appearance = appearanceFor(seed);
  const name = pickRandom(appearance.kind === 'human' ? HUMAN_NAMES : ROBOT_NAMES);
  const pat = randomInt(CUSTOMER.patienceMin, CUSTOMER.patienceMax);
  const noise = randomBetween(-CUSTOMER.feelNoise, CUSTOMER.feelNoise);
  const base = { name, seed, pat, done: {}, noise, max: pat };
  if (isBuyer) {
    const want = Math.random() < CUSTOMER.buyerWantsStockedChance ? pickRandom(state.inv).t : pickRandomItemType();
    const mult = randomBetween(CUSTOMER.buyerMarkupMin, CUSTOMER.buyerMarkupMax);
    const msg = pickRandom(BUYER_LINES).replace('{t}', itemName(want).toLowerCase());
    state.cust = { ...base, kind: 'buy', want, mult, item: null, msg };
  } else {
    const item = createItem(pickRandomItemType());
    const ask = Math.round(cleanValue(item) * randomBetween(CUSTOMER.sellerAskMin, CUSTOMER.sellerAskMax));
    const min = Math.round(trueValue(item) * (item.stolen ? CUSTOMER.sellerMinStolen : CUSTOMER.sellerMinClean));
    const msg = item.stolen && Math.random() < CUSTOMER.stolenRushLineChance ? SELLER_STOLEN_LINE : pickRandom(SELLER_LINES);
    state.cust = { ...base, kind: 'sell', item, ask, min, msg };
  }
}

export function isLandlordDue(): boolean {
  return state.debt > 0 && !state.over && state.phase === 'shop' && state.day >= state.nextDue && !state.llDone;
}

export function callNextCustomer(): void {
  if (state.phase !== 'shop' || state.cust || state.over || actor.phase !== 'empty') {
    return;
  }
  if (isLandlordDue() && state.slot >= Math.min(state.llAt, CUSTOMERS_PER_DAY)) {
    spawnLandlord();
    return;
  }
  if (state.slot >= CUSTOMERS_PER_DAY) {
    return;
  }
  // the very first visitor of a new game always sells, to teach the basics
  createCustomer(state.day === 1 && state.slot === 0);
  actorEnter(state.cust!.seed);
  ui.tab = 'deal';
}

function landlordGreeting(): string {
  if (state.deferred) {
    return `Отсрочка кончилась. С тебя ${state.owed} кр., сегодня.`;
  }
  if (state.credits >= state.owed) {
    return `Платёж. ${state.owed} кр., как договаривались.`;
  }
  return `Платёж, ${state.owed} кр. Не хватает? Могу подождать пару дней. Под процент.`;
}

function spawnLandlord(): void {
  const msg = landlordGreeting();
  state.cust = { kind: 'rent', name: LANDLORD_NAME, seed: LANDLORD_SEED, msg, pat: 0, max: 0, done: {} };
  actorEnter(LANDLORD_SEED);
  ui.tab = 'deal';
}

export function customerLeaves(reason?: string): void {
  if (!state.cust) {
    return;
  }
  addLog(`${state.cust.name} ушёл(ла). ${reason || ''}`);
  finishCustomer();
}

function finishCustomer(): void {
  const customer = state.cust;
  if (!customer) {
    return;
  }
  actor.phase = 'out';
  actor.seed = customer.seed;
  const wasLandlord = customer.kind === 'rent';
  state.cust = null;
  if (!wasLandlord) {
    state.slot++;
  }
}

function losePatience(amount: number): void {
  if (state.cust) {
    state.cust.pat = Math.max(0, state.cust.pat - amount);
  }
}

export function closeShop(): void {
  state.phase = 'evening';
  state.hours = EVENING_HOURS;
  state.where = 'home';
  state.market = false;
  ui.tab = 'deal';
  addLog('Лавка закрыта. Вечер свободен.');
}

/* =====================================================================
   Debt: weekly payment (the landlord's visit), early payments, shuttle seat
   ===================================================================== */

/** Size of the payment after this one (before capping by the debt left). */
export const nextRent = (): number => state.rent + DEBT.paymentStep;
/** The payment after a deferral (+20%). */
export const deferredDebt = (): number => roundTo10(state.owed * RENT.deferPenalty);
/** Shuttle seat price on a given day: grows towards the evacuation. */
export const seatPrice = (day: number = state.day): number => DEBT.seatBase + DEBT.seatPerDay * day;

/** A weekly payment never asks for more than the debt left. */
function capPaymentByDebt(): void {
  state.owed = Math.min(state.owed, state.debt);
}

/** Pays `amount` off the debt; the floating number and the log line are the caller's. */
function reduceDebt(amount: number): void {
  state.debt = Math.max(0, state.debt - amount);
}

/** Last line of a payment: the debt is gone. */
function logIfDebtPaid(): void {
  if (state.debt === 0) {
    addLog(TEXT.debtPaid);
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
export function planCollateral(): CollateralPlan {
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

export const collateralHeatRelief = (plan: CollateralPlan): number => Math.min(state.heat, plan.hot * COLLATERAL.heatReliefPerStolen);

/** The weekly payment is made (cash or goods): it comes off the debt, the next one is a week later and bigger. */
function settleRent(): void {
  const paid = state.owed;
  state.deferred = false;
  state.rent += DEBT.paymentStep;
  state.nextDue = state.day + DEBT.periodDays;
  state.owed = state.rent;
  state.llDone = true;
  reduceDebt(paid);
  capPaymentByDebt();
}

export function payRent(): void {
  if (state.credits < state.owed || !state.cust) {
    return;
  }
  const amount = state.owed;
  state.credits -= amount;
  floatText(`−${amount}`, MEANING.risk); // payment to the landlord
  state.cust.msg = 'Приятно иметь дело.';
  settleRent();
  addLog(fill(TEXT.paymentPaid, { amount, debt: state.debt }) + (state.debt > 0 ? ' ' + fill(TEXT.paymentNext, { amount: state.owed, day: state.nextDue }) : ''));
  logIfDebtPaid();
  finishCustomer();
}

export function deferRent(): void {
  if (state.deferred) {
    return;
  }
  const owed = deferredDebt();
  // the fine is not a separate bill: it goes onto the father's debt
  state.debt += owed - state.owed;
  state.owed = owed;
  state.nextDue = state.day + RENT.deferDays;
  state.deferred = true;
  state.llDone = true;
  addLog(fill(TEXT.deferred, { day: state.nextDue, amount: state.owed, debt: state.debt }));
  finishCustomer();
}

export function payWithCollateral(): void {
  const plan = planCollateral();
  if (!plan.ok) {
    return;
  }
  state.credits -= plan.cash;
  state.inv = state.inv.filter(item => !plan.items.includes(item));
  if (plan.items.some(item => item.uid === ui.sel)) {
    ui.sel = null;
  }
  if (plan.cash) {
    floatText(`−${plan.cash}`, MEANING.risk);
  }
  const relief = collateralHeatRelief(plan);
  state.heat -= relief;
  const taken = plan.items.map(item => itemName(item.t)).join(', ');
  const overNote = plan.over ? ` Сдачи не будет (переплата ~${plan.over} кр.).` : '';
  const hotNote = plan.hot ? ` Краденое (${plan.hot}) ушло по его каналам, розыск −${relief}.` : '';
  addLog(`Гробов забрал ${plan.cash} кр. и товар: ${taken}.${overNote}${hotNote}`);
  settleRent();
  logIfDebtPaid();
  finishCustomer();
}

export function evict(): void {
  endGame('evicted');
  finishCustomer();
}

/** Early payment, any day: as much of `amount` as the credits and the debt allow. Returns what was paid. */
export function payEarly(amount: number): number {
  const paid = Math.max(0, Math.min(Math.floor(amount), state.credits, state.debt));
  if (!paid || state.over) {
    return 0;
  }
  state.credits -= paid;
  floatText(`−${paid}`, MEANING.risk);
  addLog(fill(TEXT.paidEarly, { amount: paid, debt: state.debt - paid }));
  reduceDebt(paid);
  capPaymentByDebt();
  logIfDebtPaid();
  return paid;
}

/** Only the story mode has the last shuttle (calm "Без таймера" has no evacuation). */
export const hasShuttle = (): boolean => state.mode === 'story';

/** calm: the debt is paid, the shop goes on without payments (a sandbox until a new game). */
export const isDebtClosed = (): boolean => state.mode === 'calm' && state.debt === 0;

/** Grobov sells a seat only with the debt at zero, before the shuttle leaves. */
export const canBuySeat = (): boolean =>
  hasShuttle() && !state.over && !state.seat && state.debt === 0 && state.day < state.shuttleDay && state.credits >= seatPrice();

export function buySeat(): boolean {
  if (!canBuySeat()) {
    return false;
  }
  const price = seatPrice();
  state.credits -= price;
  state.seat = true;
  floatText(`−${price}`, MEANING.risk);
  addLog(fill(TEXT.seatBought, { price }));
  return true;
}

/** Ends the game: the ending's line becomes the game-over text. */
export function endGame(ending: Ending): void {
  state.ending = ending;
  state.over = ENDING_TEXT.ru[ending].line;
  addLog(state.over);
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

/** Each check costs patience (never the last point). */
export function inspect(check: InspectCheck): void {
  const customer = currentSeller();
  if (!customer || customer.done[check]) {
    return;
  }
  customer.done[check] = 1;
  actor.scanStart = performance.now();
  if (customer.pat > 1) {
    losePatience(1);
  }
  REVEALS[check](customer, customer.item);
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

export function offerToSeller(price: number): void {
  const customer = currentSeller();
  if (!customer) {
    return;
  }
  if (price > state.credits) {
    customer.msg = 'У тебя столько нет, не смеши.';
    return;
  }
  if (price >= customer.ask) {
    buyFromSeller(customer.ask);
    return;
  }
  if (Math.random() < sellerAcceptChance(customer, price)) {
    buyFromSeller(price);
    return;
  }
  if (price < customer.min * HAGGLE.sellerInsultShare) {
    losePatience(HAGGLE.insultPatienceLoss);
    customer.msg = pickRandom(SELLER_INSULTED_LINES);
  } else {
    losePatience(HAGGLE.counterPatienceLoss);
    customer.ask = Math.round(Math.max(customer.min, customer.ask - (customer.ask - price) * HAGGLE.sellerConcession));
    customer.msg = pickRandom(SELLER_COUNTER_LINES) + ` ${customer.ask} кр.`;
  }
  if (customer.pat <= 0) {
    customerLeaves('Не сторговались.');
  }
}

/** Buy the seller's item; price defaults to their asking price. */
export function buyFromSeller(price?: number): void {
  const customer = currentSeller();
  if (!customer) {
    return;
  }
  const paid = price ?? customer.ask;
  const item = customer.item;
  state.credits -= paid;
  state.inv.push(item);
  if (item.stolen) {
    raiseHeat(1);
  }
  addLog(`Куплено: ${itemName(item.t)} за ${paid} кр. у ${customer.name}.`);
  floatText(`−${paid}`, COLOR.fg); // a purchase: plain spending, no meaning color
  ui.sel = item.uid;
  finishCustomer();
}

/** Put a stocked item on the counter for a buyer; they name an opening price. */
export function presentItem(uid: number): void {
  const customer = currentBuyer();
  const item = findItem(uid);
  if (!customer || !item) {
    return;
  }
  customer.item = item;
  customer.max2 = Math.round(buyerBaseValue(item) * customer.mult);
  customer.offer = Math.round(customer.max2 * CUSTOMER.buyerOpeningShare);
  customer.msg = `${item.cond < CUSTOMER.worndownCondition ? 'Потрёпан. ' : ''}Дам ${customer.offer} кр.`;
}

export function askBuyer(price: number): void {
  const customer = currentBuyer();
  if (!customer || !isPresentedBuyer(customer)) {
    return;
  }
  if (price <= customer.offer) {
    sellToBuyer(customer.offer);
    return;
  }
  if (Math.random() < buyerAcceptChance(customer, price)) {
    sellToBuyer(price);
    return;
  }
  if (price > customer.max2 * HAGGLE.buyerInsultShare) {
    losePatience(HAGGLE.insultPatienceLoss);
    customer.msg = pickRandom(BUYER_INSULTED_LINES);
  } else {
    losePatience(HAGGLE.counterPatienceLoss);
    customer.offer = Math.round(customer.offer + (customer.max2 - customer.offer) * HAGGLE.buyerConcession);
    customer.msg = pickRandom(BUYER_COUNTER_LINES) + ` ${customer.offer} кр.`;
  }
  if (customer.pat <= 0) {
    customerLeaves('Не сторговались.');
  }
}

/** Sell the shown item; price defaults to the buyer's offer. */
export function sellToBuyer(price?: number): void {
  const customer = currentBuyer();
  if (!customer || !isPresentedBuyer(customer)) {
    return;
  }
  const paid = price ?? customer.offer;
  const item = customer.item;
  state.credits += paid;
  state.inv = state.inv.filter(i => i.uid !== item.uid);
  if (ui.sel === item.uid) {
    ui.sel = null;
  }
  let note = '';
  if (item.stolen) {
    raiseHeat(1);
    note = ' Краденое ушло дальше.';
  }
  if (item.infected) {
    raiseHeat(2);
    note += ' Вещь была заражена ИИ, служба безопасности насторожилась.';
  }
  addLog(`Продано: ${itemName(item.t)} за ${paid} кр. (${customer.name}).${note}`);
  floatText(`+${paid}`, MEANING.action);
  finishCustomer();
}

/* =====================================================================
   Evening: junkyard, flea market, supplier
   ===================================================================== */

/** Extra digs per visit: always 0 for now — the hook for Patch D gear and skills and for events. */
export const digBonus = (_game: GameState = state): number => 0;

/** Digs of a fresh visit. */
export const digsPerVisit = (game: GameState = state): number => JUNK.digsBase + digBonus(game);

/** Evening hours a junkyard visit costs (fixed: road + the heap). */
export const junkVisitHours = (): number => JUNK.travelHours + JUNK.visitHours;

export const canGoToJunkyard = (): boolean => state.phase === 'evening' && state.where === 'home' && state.hours >= junkVisitHours();

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

export function goToJunkyard(): void {
  if (!canGoToJunkyard()) {
    return;
  }
  state.hours -= junkVisitHours();
  state.where = 'junk';
  state.junk = { d: digsPerVisit(), n: 0, dp: 0, f: [], s: randomSeed() };
  state.jmsg = JUNK_WORDS.arrive;
}

export function goHome(): void {
  if (state.where === 'junk' && state.junk) {
    addLog(fill(JUNK_WORDS.home, { n: state.junk.f.length }));
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
function rollLoot(visit: JunkVisit): DigResult {
  let roll = Math.random();
  roll -= DIG_ODDS.parts;
  if (roll < 0) {
    const found = randomInt(DIG_LOOT.partsMin, DIG_LOOT.partsMax);
    state.parts += found;
    floatText(`+${found} ⚙`, MEANING.action);
    return { kind: 'parts', message: fill(JUNK_WORDS.parts, { n: found }) };
  }
  roll -= DIG_ODDS.broken;
  if (roll < 0) {
    const type = pickRandomItemType();
    const item = createItem(type, {
      cond: randomInt(DIG_LOOT.brokenCondMin, DIG_LOOT.brokenCondMax),
      defect: Math.random() < DIG_LOOT.brokenDefect,
      stolen: Math.random() < DIG_LOOT.brokenStolen,
    });
    state.inv.push(item);
    visit.f.push(item.uid);
    floatText('+1', MEANING.wear); // a broken find
    return { kind: 'broken', message: fill(JUNK_WORDS.broken, { name: itemName(type) }) };
  }
  roll -= rareChance(visit.dp - 1);
  if (roll < 0) {
    const type = pickRandom(RARE_FINDS);
    const item = createItem(type, { cond: randomInt(DIG_LOOT.rareCondMin, DIG_LOOT.rareCondMax), stolen: false });
    state.inv.push(item);
    visit.f.push(item.uid);
    floatText('★', MEANING.action); // a rare find
    return { kind: 'rare', message: fill(JUNK_WORDS.rare, { name: itemName(type) }) };
  }
  return { kind: 'empty', message: JUNK_WORDS.empty };
}

/** The guard drone: takes one find of this visit (if any is still here) or raises the wanted level; the visit ends. */
function droneCatches(visit: JunkVisit): DigResult {
  visit.d = 0;
  visit.run = true;
  const finds = state.inv.filter(item => visit.f.includes(item.uid));
  if (finds.length) {
    const taken = pickRandom(finds);
    state.inv = state.inv.filter(item => item.uid !== taken.uid);
    visit.f = visit.f.filter(uid => uid !== taken.uid);
    if (ui.sel === taken.uid) {
      ui.sel = null;
    }
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
export function dig(): DigResult | null {
  const visit = state.junk;
  if (state.where !== 'junk' || !visit || visit.d <= 0) {
    return null;
  }
  const caught = Math.random() < droneChance(visit);
  visit.n = Math.min(100, visit.n + JUNK.noisePerDig + randomInt(-JUNK.noiseSpread, JUNK.noiseSpread));
  visit.d--;
  visit.dp++;
  const result = caught ? droneCatches(visit) : rollLoot(visit);
  state.jmsg = result.message;
  addLog('Свалка: ' + result.message);
  if (!caught && visit.d === 0) {
    addLog(JUNK_WORDS.noDigs);
  }
  return result;
}

export const canVisitMarket = (): boolean => state.hours >= MARKET.hours && !state.market && state.credits >= MARKET.price;

export function visitMarket(): void {
  if (!canVisitMarket()) {
    return;
  }
  state.hours -= MARKET.hours;
  state.market = true;
  state.credits -= MARKET.price;
  state.parts += MARKET.parts;
  addLog('Барахолка: 5 запчастей за 50 кр.');
}

export function orderParts(): void {
  if (state.credits < SUPPLIER.price) {
    return;
  }
  state.credits -= SUPPLIER.price;
  state.parts += SUPPLIER.parts;
  addLog('Заказано 5 запчастей у снабженца.');
}

/* =====================================================================
   Night
   ===================================================================== */

/** Each infected item may infect one more electronic item on the shelf. */
function spreadInfection(events: string[]): void {
  const infectedCount = state.inv.filter(item => item.infected).length;
  for (let i = 0; i < infectedCount; i++) {
    if (Math.random() >= NIGHT.infectionSpreadChance) {
      continue;
    }
    const targets = state.inv.filter(item => !item.infected && ITEM_TYPES[item.t]?.electronic);
    if (!targets.length) {
      continue;
    }
    const victim = pickRandom(targets);
    victim.infected = true;
    victim.k.flaw = false;
    events.push(`Ночью на складе что-то мигало. ${itemName(victim.t)} ведёт себя странно.`);
  }
}

function startNewDay(): void {
  state.day++;
  state.slot = 0;
  state.phase = 'shop';
  state.hours = 0;
  state.junk = null;
  state.llDone = false;
  state.llAt = randomLandlordSlot();
}

/** Heat cools by 1 overnight, but yesterday's heat decides the raid chance. */
function coolDownAndMaybeRaid(events: string[]): void {
  const heatBefore = state.heat;
  state.heat = Math.max(0, state.heat - 1);
  if (state.over || Math.random() >= heatBefore * NIGHT.raidChancePerHeat) {
    return;
  }
  const stolen = state.inv.filter(item => item.stolen);
  const fine = NIGHT.raidBaseFine + stolen.length * NIGHT.raidFinePerItem;
  state.inv = state.inv.filter(item => !item.stolen);
  state.credits = Math.max(0, state.credits - fine);
  state.heat = 0;
  events.push(`Утренний рейд патруля. Изъято краденого: ${stolen.length}. Штраф ${fine} кр.`);
}

/** Ends the day; returns the list of night events for the morning report. */
export function sleepUntilMorning(): string[] {
  state.where = 'home';
  const events: string[] = [];
  spreadInfection(events);
  startNewDay();
  if (hasShuttle() && state.day >= state.shuttleDay) {
    // the last shuttle leaves this morning: the game ends, no raid and no landlord
    endGame(state.seat ? 'left' : 'stayed');
    events.push(state.over ?? '');
    return events;
  }
  const daysToShuttle = state.shuttleDay - state.day;
  if (hasShuttle() && (DEBT.shuttleReminders as readonly number[]).includes(daysToShuttle)) {
    events.push(fill(TEXT.shuttleSoon, { days: daysRu(daysToShuttle) }));
  }
  if (state.debt > 0 && state.day >= state.nextDue) {
    events.push(fill(TEXT.landlordToday, { amount: state.owed }) + (state.deferred ? ' Отсрочки больше не будет.' : ''));
  }
  coolDownAndMaybeRaid(events);
  if (!events.length) {
    events.push('Тихая ночь на нижнем ярусе.');
  }
  events.forEach(event => addLog(event));
  return events;
}

/* =====================================================================
   Workbench & crafting
   ===================================================================== */

export const scrapValue = (item: Item): number => Math.max(1, Math.round(ITEM_TYPES[item.t].basePrice / 80 + item.cond / 50));
export const isOnCounter = (item: Item): boolean => !!state.cust && 'item' in state.cust && !!state.cust.item && state.cust.item.uid === item.uid;

const BENCH_ACTIONS: Record<string, (item: Item) => void> = {
  diag(item) {
    item.k = fullKnowledge();
    addLog(`Диагностика: ${itemName(item.t)}.`);
  },
  repair(item) {
    item.cond = Math.min(100, item.cond + REPAIR_AMOUNT);
    item.k.cond = true;
    addLog(`Ремонт: ${itemName(item.t)} → ${item.cond}%.`);
  },
  fix(item) {
    item.defect = false;
    addLog(`Дефект устранён: ${itemName(item.t)}.`);
  },
  purge(item) {
    item.infected = false;
    addLog(`ИИ вычищен из: ${itemName(item.t)}.`);
  },
  wipe(item) {
    item.stolen = false;
    raiseHeat(1);
    addLog(`Серийник перебит: ${itemName(item.t)}.`);
  },
  scrap(item) {
    if (isOnCounter(item)) {
      return;
    }
    const gained = scrapValue(item);
    state.parts += gained;
    state.inv = state.inv.filter(i => i !== item);
    ui.sel = null;
    addLog(`Разобрано: ${itemName(item.t)}, +${gained} запч.`);
  },
};

export function useWorkbench(action: string): void {
  const item = findItem(ui.sel);
  if (!item) {
    return;
  }
  const cost = BENCH_COST[action] || 0;
  if (state.parts < cost) {
    return;
  }
  state.parts -= cost;
  if (Object.hasOwn(BENCH_ACTIONS, action)) {
    BENCH_ACTIONS[action](item);
  }
}

/** Stock of a type that is free to use (not lying on the counter). */
export const availableOfType = (type: ItemType): Item[] => state.inv.filter(item => item.t === type && !isOnCounter(item));

/** Ingredients of a recipe as [type, count] pairs. */
export const recipeNeeds = (recipe: Recipe): [ItemType, number][] =>
  Object.entries(recipe.need) as [ItemType, number][];

export function canCraft(recipe: Recipe): boolean {
  return state.parts >= recipe.parts && recipeNeeds(recipe).every(([type, count]) => availableOfType(type).length >= count);
}

export function craft(index: number): void {
  const recipe = RECIPES[index];
  if (!recipe || !canCraft(recipe)) {
    return;
  }
  const used: Item[] = [];
  recipeNeeds(recipe).forEach(([type, count]) => used.push(...availableOfType(type).slice(0, count)));
  state.inv = state.inv.filter(item => !used.includes(item));
  state.parts -= recipe.parts;
  const averageCondition = used.reduce((sum, item) => sum + item.cond, 0) / used.length;
  const cond = Math.min(100, Math.round(averageCondition + CRAFT_CONDITION_BONUS));
  // a new build gets a fresh serial number, but the AI virus survives
  const item = createItem(recipe.out, { cond, stolen: false, defect: false, infected: used.some(part => part.infected), known: true });
  state.inv.push(item);
  ui.sel = item.uid;
  ui.tab = 'inv';
  floatText('СОБРАНО', MEANING.action);
  addLog(`Собрано: ${itemName(recipe.out)} (${cond}%).${item.infected ? ' Похоже, ИИ перебрался в новую сборку.' : ''}`);
}
