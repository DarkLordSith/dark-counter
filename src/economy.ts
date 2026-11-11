// =====================================================================
//  economy.ts — game rules: item value, customers and haggling, rent,
//  evening (junkyard, flea market), night events, workbench, crafting.
//  No DOM here: rules change `state` and return results; floating
//  numbers are queued in `feedback` and shown by ui.ts.
// =====================================================================
import {
  ACCEPT, BENCH_COST, BUYER_COUNTER_LINES, BUYER_INSULTED_LINES, BUYER_LINES, BUYOUT_GOAL, COLLATERAL, COLOR,
  CRAFT_CONDITION_BONUS, CUSTOMER, CUSTOMERS_PER_DAY, DIG_LOOT, DIG_ODDS, EVENING_HOURS, HAGGLE, HUMAN_NAMES,
  INSPECT, ITEM_TYPES, JUNK, JUNK_PILES, LANDLORD_NAME, LANDLORD_SEED, MARKET, MAX_HEAT, NIGHT, RARE_FINDS,
  RECIPES, RENT, REPAIR_AMOUNT, ROBOT_NAMES, SELLER_COUNTER_LINES, SELLER_INSULTED_LINES, SELLER_LINES,
  SELLER_STOLEN_LINE, SUPPLIER, VALUE,
} from './data';
import { appearanceFor } from './appearance';
import {
  actor, actorEnter, addLog, createItem, findItem, fullKnowledge, randomLandlordSlot, state, ui,
} from './state';
import type {
  BuyerCustomer, InspectCheck, Item, ItemType, PresentedBuyer, Recipe, SellerCustomer,
} from './types';
import { clamp, pickRandom, randomBetween, randomInt, randomSeed, roundTo10 } from './util';

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
  return !state.won && !state.over && state.phase === 'shop' && state.day >= state.nextDue && !state.llDone;
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
    return `Аренда. ${state.owed} кр., как договаривались.`;
  }
  return `Аренда, ${state.owed} кр. Не хватает? Могу подождать пару дней. Под процент.`;
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
   Rent
   ===================================================================== */

export const nextRent = (): number => state.rent + RENT.increase;
export const deferredDebt = (): number => roundTo10(state.owed * RENT.deferPenalty);

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

function settleRent(): void {
  state.deferred = false;
  state.rent += RENT.increase;
  state.nextDue = state.day + RENT.periodDays;
  state.owed = state.rent;
  state.llDone = true;
}

export function payRent(): void {
  if (state.credits < state.owed || !state.cust) {
    return;
  }
  const amount = state.owed;
  state.credits -= amount;
  floatText(`−${amount}`, COLOR.red);
  addLog(`Аренда оплачена: ${amount} кр. Следующая: ${nextRent()} кр. на день ${state.day + RENT.periodDays}.`);
  state.cust.msg = 'Приятно иметь дело.';
  settleRent();
  finishCustomer();
}

export function deferRent(): void {
  if (state.deferred) {
    return;
  }
  state.owed = deferredDebt();
  state.nextDue = state.day + RENT.deferDays;
  state.deferred = true;
  state.llDone = true;
  addLog(`Отсрочка до дня ${state.nextDue}. Долг вырос до ${state.owed} кр.`);
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
    floatText(`−${plan.cash}`, COLOR.red);
  }
  const relief = collateralHeatRelief(plan);
  state.heat -= relief;
  const taken = plan.items.map(item => itemName(item.t)).join(', ');
  const overNote = plan.over ? ` Сдачи не будет (переплата ~${plan.over} кр.).` : '';
  const hotNote = plan.hot ? ` Краденое (${plan.hot}) ушло по его каналам, розыск −${relief}.` : '';
  addLog(`Гробов забрал ${plan.cash} кр. и товар: ${taken}.${overNote}${hotNote}`);
  settleRent();
  finishCustomer();
}

export function evict(): void {
  state.over = `Долг ${state.owed} кр. нечем покрыть. Гробов опечатал лавку.`;
  addLog(state.over);
  finishCustomer();
}

export function buyOutShop(): void {
  state.credits -= BUYOUT_GOAL;
  state.won = true;
  state.rent = 0;
  addLog('Лавка выкуплена. Аренды больше нет.');
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
  floatText(`−${paid}`, COLOR.amber);
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
  floatText(`+${paid}`, COLOR.green);
  finishCustomer();
}

/* =====================================================================
   Evening: junkyard, flea market, supplier
   ===================================================================== */

export function goToJunkyard(): void {
  if (state.hours < JUNK.minHoursToGo) {
    return;
  }
  state.hours -= JUNK.travelHours;
  state.where = 'junk';
  state.junk = { piles: JUNK_PILES.map(() => ({ dug: false, seed: randomSeed() })) };
  state.jmsg = 'Свалка «Кольцо Б». Выберите кучу и копайте. Каждая куча — час.';
}

export function goHome(): void {
  state.where = 'home';
  state.jmsg = '';
}

/** Rolls what a pile gives; applies the loot and returns the message. */
function rollDigOutcome(): string {
  const roll = Math.random();
  if (roll < DIG_ODDS.drone) {
    state.hours = Math.max(0, state.hours - 1);
    return 'Сторожевой дрон! Пришлось прятаться, час потерян.';
  }
  if (roll < DIG_ODDS.parts) {
    const found = randomInt(DIG_LOOT.partsMin, DIG_LOOT.partsMax);
    state.parts += found;
    floatText(`+${found} ⚙`, COLOR.cyan);
    return `Нашлись запчасти: +${found}.`;
  }
  if (roll < DIG_ODDS.broken) {
    const type = pickRandomItemType();
    const item = createItem(type, {
      cond: randomInt(DIG_LOOT.brokenCondMin, DIG_LOOT.brokenCondMax),
      defect: Math.random() < DIG_LOOT.brokenDefect,
      stolen: Math.random() < DIG_LOOT.brokenStolen,
    });
    state.inv.push(item);
    floatText('+1', COLOR.amber);
    return `Откопал: ${itemName(type)}, сломанный. Отнесу на верстак.`;
  }
  if (roll < DIG_ODDS.rare) {
    const type = pickRandom(RARE_FINDS);
    const item = createItem(type, { cond: randomInt(DIG_LOOT.rareCondMin, DIG_LOOT.rareCondMax), stolen: false });
    state.inv.push(item);
    floatText('★', COLOR.amber);
    return `Редкая находка: ${itemName(type)}!`;
  }
  return 'Пусто. Только ржавые болты.';
}

export function digPile(index: number): void {
  if (state.where !== 'junk' || state.hours < 1 || !state.junk) {
    return;
  }
  const pile = state.junk.piles[index];
  if (!pile || pile.dug) {
    return;
  }
  pile.dug = true;
  state.hours--;
  const message = rollDigOutcome();
  state.jmsg = message;
  addLog('Свалка: ' + message);
  if (state.hours <= 0) {
    goHome();
    addLog('Стемнело окончательно, пора домой.');
  }
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
  if (!state.won && state.day >= state.nextDue) {
    events.push(`Сегодня зайдёт арендодатель: ${state.owed} кр.${state.deferred ? ' Отсрочки больше не будет.' : ''}`);
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
  floatText('СОБРАНО', COLOR.cyan);
  addLog(`Собрано: ${itemName(recipe.out)} (${cond}%).${item.infected ? ' Похоже, ИИ перебрался в новую сборку.' : ''}`);
}
