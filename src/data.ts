// =====================================================================
//  data.ts — static game data and balance numbers. No logic here.
//  New goods are added with one line in ITEM_TYPES (plus a sprite in
//  scene.ts → ITEM_SPRITES if you want an icon).
// =====================================================================
import type { ItemType, ItemTypeInfo, Recipe } from './types';

// ---------- persistence ----------
export const SAVE_KEY = 'dark-counter-v3';
export const SAVE_CODE_PREFIX = 'DC1:';

// ---------- goods catalog ----------
// name — display name, basePrice — price at 100% condition,
// spawnWeight — relative chance to appear, electronic — can catch the AI virus
// from a neighbour on the shelf, aiCapable — can arrive already infected.
const CATALOG = {
  comm: { name: 'Коммуникатор', basePrice: 120, spawnWeight: 3, electronic: true },
  battery: { name: 'Энергоячейка', basePrice: 90, spawnWeight: 3 },
  servo: { name: 'Сервопривод', basePrice: 160, spawnWeight: 3 },
  cutter: { name: 'Плазменный резак', basePrice: 300, spawnWeight: 2 },
  visor: { name: 'AR-визор', basePrice: 280, spawnWeight: 2, aiCapable: true, electronic: true },
  drone: { name: 'Курьерский дрон', basePrice: 450, spawnWeight: 1, electronic: true },
  chip: { name: 'Нейрочип', basePrice: 520, spawnWeight: 1.5, aiCapable: true, electronic: true },
  arm: { name: 'Кибер-рука', basePrice: 760, spawnWeight: 0.7, aiCapable: true, electronic: true },
} satisfies Record<string, ItemTypeInfo>;

/** Goods catalog; its keys define the ItemType union. */
export const ITEM_TYPES: Record<keyof typeof CATALOG, ItemTypeInfo> = CATALOG;

// Rare junkyard finds (order matters: it is the random pick table).
export const RARE_FINDS: ItemType[] = ['chip', 'arm', 'drone', 'visor'];

export const RECIPES: Recipe[] = [
  { out: 'visor', need: { comm: 1, battery: 1 }, parts: 2 },
  { out: 'cutter', need: { battery: 2 }, parts: 3 },
  { out: 'drone', need: { servo: 1, battery: 1 }, parts: 3 },
  { out: 'arm', need: { servo: 2, battery: 1 }, parts: 4 },
];

// ---------- characters & lines ----------
export const HUMAN_NAMES = ['Рыжий Вик', 'Тётя Ома', 'Борн', 'Лиса из шлюза', 'Механик Ду', 'Стас «Провод»', 'Мира Кейн', 'Тихий Йоэль', 'Нана Рокет', 'Гарри Шов', 'Курт Дымов', 'Пак'];
export const ROBOT_NAMES = ['Кси-9', 'Офелия-3', 'ТР-404', 'Болт', 'Юнит-7', 'Мама-Кран', 'Р-Скрип', 'Ось'];
export const LANDLORD_NAME = 'Ростовщик Гробов';

export const SELLER_LINES = ['Глянь, почти новая штука. Почти.', 'Нашёл на нижнем ярусе. Честно нашёл.', 'Срочно нужны кредиты, не торгуйся долго.', 'Отдаю, потому что съезжаю со станции.', 'Не спрашивай, откуда. Спроси, сколько.'];
export const SELLER_STOLEN_LINE = 'Быстро. Кредиты вперёд, вопросы потом.';
export const SELLER_INSULTED_LINES = ['Это оскорбление.', 'Ты издеваешься?', 'За эти деньги сам собери.'];
export const SELLER_COUNTER_LINES = ['Нет. Давай так:', 'Не пойдёт. Моя цена:', 'Хм… нет. Могу за'];
export const BUYER_LINES = ['Мне нужен {t}. Сегодня.', 'Говорят, у тебя бывает {t}. Покажешь?', 'Ищу {t}, без лишних вопросов.', 'Шеф велел достать {t}. Деньги есть.'];
export const BUYER_INSULTED_LINES = ['За такие деньги я новый куплю.', 'Ты бредишь.'];
export const BUYER_COUNTER_LINES = ['Дорого. Могу', 'Ладно, подниму:', 'Последнее слово —'];

// ---------- day & economy ----------
export const CUSTOMERS_PER_DAY = 6;
export const EVENING_HOURS = 4;
export const MAX_HEAT = 10;
export const LOG_LIMIT = 50;
export const START = { credits: 400, parts: 4 };

// Concept skeleton (14.11.2026, after the playtest where 5000 cr. took 16 days):
// the father's debt to Grobov instead of rent and buyout, 60 days to the last shuttle.
// Numbers are a proposal, tune after playtests.
export const DEBT = {
  /** Debt at the start of a new game. */
  start: 25000,
  /** Weekly payment: the first one, then + step every week (400, 650, 900…). */
  firstPayment: 400,
  paymentStep: 250,
  periodDays: 7,
  /** The last shuttle leaves on this day; the game ends that morning. */
  shuttleDay: 60,
  /** Old saves get at least this many days before the shuttle. */
  legacyDaysLeft: 21,
  /** Seat price = seatBase + seatPerDay × day (grows towards the evacuation). */
  seatBase: 2000,
  seatPerDay: 100,
  /** Early payment buttons (plus "everything you have"). */
  earlySteps: [100, 500],
  /** Morning reminders: this many days before the shuttle. */
  shuttleReminders: [14, 7, 1],
} as const;

// The landlord's visit: deferral and when in the day he comes.
export const RENT = {
  deferDays: 2,
  deferPenalty: 1.2,
  landlordSlotMin: 1, // landlord shows up after this many…
  landlordSlotMax: 4, // …to this many customers
};
/** Rent period of v1/v2 saves (no nextDue field); migrate() places their first visit by it. */
export const LEGACY_RENT_PERIOD = 3;
export const LANDLORD_SEED = 777;

// Landlord takes goods at a share of their true value, stolen goods first.
export const COLLATERAL = { stolenRate: 0.5, cleanRate: 0.6, minValue: 5, heatReliefPerStolen: 2 };

export const SUPPLIER = { price: 70, parts: 5 };
export const MARKET = { price: 50, parts: 5, hours: 1 };

// ---------- item value ----------
export const VALUE = {
  conditionFloor: 0.3, // a 0% item is still worth 30% of base
  conditionSpan: 0.7,
  unknownConditionGuess: 60,
  defectMult: 0.5,
  infectedMult: 0.15,
  buyerDefectMult: 0.7,
};

export const ITEM_ODDS = { condMin: 15, condMax: 98, stolen: 0.25, defect: 0.25, infected: 0.35 };

// ---------- customers & haggling ----------
export const CUSTOMER = {
  buyerChance: 0.45,
  buyerWantsStockedChance: 0.7,
  patienceMin: 4,
  patienceMax: 6,
  feelNoise: 0.12,
  buyerMarkupMin: 1.1,
  buyerMarkupMax: 1.5,
  buyerOpeningShare: 0.65,
  sellerAskMin: 1.05,
  sellerAskMax: 1.35,
  sellerMinStolen: 0.45,
  sellerMinClean: 0.75,
  stolenRushLineChance: 0.6,
  worndownCondition: 45, // buyer grumbles below this condition
};

export const HAGGLE = {
  sellerInsultShare: 0.7, // offers below min × this offend the seller
  sellerConcession: 0.3, // seller moves this share of the gap per round
  buyerInsultShare: 1.5, // asks above max × this offend the buyer
  buyerConcession: 0.35,
  buyerCeilingShare: 1.35, // buyer never pays above max × this
  insultPatienceLoss: 2,
  counterPatienceLoss: 1,
  sellerDefaultOfferShare: 0.7, // default price in the input box
  buyerDefaultAskShare: 1.3,
};

// Gut-feeling verdict next to the chance bar: the lowest chance for each word.
// Below `maybe` → "unlikely". Checked against perceivedChance (what the player sees).
export const HUNCH_VERDICT = { maybe: 0.25, likely: 0.55, deal: 0.85 };

/** Verdict words; one object per language for the future RU/EN dictionary. */
export const HUNCH_VERDICT_TEXT = {
  ru: { unlikely: 'вряд ли', maybe: 'может быть', likely: 'скорее да', deal: 'по рукам' },
  en: { unlikely: 'unlikely', maybe: 'maybe', likely: 'likely', deal: 'deal' },
} as const;

/** HUD (V1.4): stat labels (day shows "день/60": the shuttle day in the label), icon-button labels for screen readers, the menu and the new-game confirmation. */
export const HUD_TEXT = {
  ru: {
    credits: 'кр',
    day: 'день',
    payment: 'платёж',
    daysShort: 'д',
    parts: 'зап',
    heat: 'розыск',
    of: 'из',
    music: 'Музыка',
    on: 'вкл',
    off: 'выкл',
    menu: 'Меню',
    gameTitle: 'Тёмный прилавок',
    save: 'Сохранение',
    newGame: 'Новая игра',
    close: 'Закрыть',
    confirmTitle: 'Начать заново?',
    confirmText: 'Текущая игра пропадёт, сохраните код.',
    confirmYes: 'Начать',
    confirmNo: 'Отмена',
  },
  en: {
    credits: 'cr',
    day: 'day',
    payment: 'payment',
    daysShort: 'd',
    parts: 'parts',
    heat: 'wanted',
    of: 'of',
    music: 'Music',
    on: 'on',
    off: 'off',
    menu: 'Menu',
    gameTitle: 'Dark Counter',
    save: 'Save',
    newGame: 'New game',
    close: 'Close',
    confirmTitle: 'Start over?',
    confirmText: 'The current game will be lost, save the code.',
    confirmYes: 'Start',
    confirmNo: 'Cancel',
  },
} as const;

/**
 * The father's debt, the shuttle seat and the endings; one object per language
 * (like HUD_TEXT). {name} placeholders are filled by fill() from util.ts.
 */
export const DEBT_TEXT = {
  ru: {
    start: 'День 1. Лавка 7-Б, нижний ярус. Долг отца Гробову: {debt} кр. Платёж раз в {period}, последний шаттл — день {shuttle}.',
    windowTitle: 'Долг Гробову',
    debtLeft: 'Долг',
    nextPayment: 'Платёж',
    when: 'Когда',
    paymentDay: 'день {day}, через {days}',
    noPayments: 'платежей нет',
    youHave: 'У вас',
    early: 'Внести досрочно',
    earlyHint: 'Сверх платежа, в любой день. Остаток виден сразу.',
    everything: 'Всё',
    paidEarly: 'Внесено досрочно {amount} кр. Долг: {debt} кр.',
    seatTitle: 'Место на шаттле',
    seatPrice: 'Цена {price} кр. сегодня, дорожает на {perDay} кр. в день. Шаттл — день {shuttle}.',
    seatNeedsZero: 'Гробов продаёт место только без долга.',
    seatBuy: 'Купить место',
    seatOwned: 'Место куплено. Шаттл — день {shuttle}.',
    seatConfirmTitle: 'Купить место?',
    seatConfirmText: 'Место на шаттле за {price} кр. Вернуть нельзя.',
    seatConfirmYes: 'Купить',
    seatConfirmNo: 'Отмена',
    seatBought: 'Куплено место на шаттле за {price} кр.',
    debtPaid: 'Долг отца выплачен.',
    paymentPaid: 'Платёж внесён: {amount} кр. Долг: {debt} кр.',
    paymentNext: 'Следующий: {amount} кр. на день {day}.',
    paymentOption: 'Долг станет {debt} кр. Следующий платёж {next} кр. через {period}.',
    deferOption: 'Придёт через {days}, платёж +20%: {amount} кр. Пеня ляжет в долг.',
    deferred: 'Отсрочка до дня {day}. Платёж {amount} кр., долг {debt} кр.',
    landlordToday: 'Сегодня зайдёт Гробов за платежом: {amount} кр.',
    shuttleSoon: 'До последнего шаттла {days}.',
    menuDebt: 'Долг: {debt} кр.',
    totals: 'День {day} · {credits} кр. · долг {debt} кр.',
    newGame: 'Новая игра',
  },
  en: {
    start: 'Day 1. Shop 7-B, lower tier. Father\'s debt to Grobov: {debt} cr. A payment every {period}, the last shuttle on day {shuttle}.',
    windowTitle: 'Debt to Grobov',
    debtLeft: 'Debt',
    nextPayment: 'Payment',
    when: 'When',
    paymentDay: 'day {day}, in {days}',
    noPayments: 'no payments',
    youHave: 'You have',
    early: 'Pay early',
    earlyHint: 'On top of the payment, any day. You see the rest at once.',
    everything: 'All',
    paidEarly: 'Paid early {amount} cr. Debt: {debt} cr.',
    seatTitle: 'Shuttle seat',
    seatPrice: 'Costs {price} cr. today, {perDay} cr. more every day. Shuttle on day {shuttle}.',
    seatNeedsZero: 'Grobov sells a seat only once the debt is paid.',
    seatBuy: 'Buy a seat',
    seatOwned: 'Seat bought. Shuttle on day {shuttle}.',
    seatConfirmTitle: 'Buy a seat?',
    seatConfirmText: 'A shuttle seat for {price} cr. No refunds.',
    seatConfirmYes: 'Buy',
    seatConfirmNo: 'Cancel',
    seatBought: 'Bought a shuttle seat for {price} cr.',
    debtPaid: 'Father\'s debt is paid off.',
    paymentPaid: 'Payment made: {amount} cr. Debt: {debt} cr.',
    paymentNext: 'Next: {amount} cr. on day {day}.',
    paymentOption: 'The debt becomes {debt} cr. Next payment {next} cr. in {period}.',
    deferOption: 'Comes back in {days}, payment +20%: {amount} cr. The fine goes onto the debt.',
    deferred: 'Deferred to day {day}. Payment {amount} cr., debt {debt} cr.',
    landlordToday: 'Grobov comes for the payment today: {amount} cr.',
    shuttleSoon: 'The last shuttle leaves in {days}.',
    menuDebt: 'Debt: {debt} cr.',
    totals: 'Day {day} · {credits} cr. · debt {debt} cr.',
    newGame: 'New game',
  },
} as const;

/**
 * Endings: a title and one line each. betray and takeover cannot be reached yet
 * (stubs for Patch C: "turn Grobov in", "take his place").
 */
export const ENDING_TEXT = {
  ru: {
    left: { title: 'Улетел', line: 'Последний шаттл ушёл, и вы на борту.' },
    stayed: { title: 'Остался на станции', line: 'Последний шаттл ушёл без вас.' },
    evicted: { title: 'Выселение', line: 'Платёж нечем покрыть. Гробов опечатал лавку.' },
    betray: { title: 'Сдал Гробова', line: 'Гробова увели патрульные.' },
    takeover: { title: 'Занял его место', line: 'Теперь долги собираете вы.' },
  },
  en: {
    left: { title: 'Left', line: 'The last shuttle has gone, and you are on board.' },
    stayed: { title: 'Stayed on the station', line: 'The last shuttle has gone without you.' },
    evicted: { title: 'Evicted', line: 'Nothing to cover the payment with. Grobov sealed the shop.' },
    betray: { title: 'Turned Grobov in', line: 'The patrol took Grobov away.' },
    takeover: { title: 'Took his place', line: 'Now you collect the debts.' },
  },
} as const;

// Acceptance curve: 50% at the hidden limit, up to 97% near their own price.
export const ACCEPT = { atLimit: 0.5, slope: 0.47, cap: 0.97, feelStep: 20, feelMin: 0.05, feelMax: 0.95 };

// Inspection results: how the seller's prices move after a reveal.
export const INSPECT = {
  stolenAskMult: 0.7,
  stolenMinMult: 0.85,
  infectedAskMult: 0.5,
  infectedMinMult: 0.6,
  defectAskMult: 0.75,
  lowCondition: 40,
};

// ---------- workbench ----------
export const BENCH_COST: Record<string, number> = { diag: 1, repair: 2, fix: 3, purge: 2, wipe: 3 };
export const REPAIR_AMOUNT = 25;
export const CRAFT_CONDITION_BONUS = 10;

// ---------- night ----------
export const NIGHT = { infectionSpreadChance: 0.35, raidChancePerHeat: 0.1, raidBaseFine: 50, raidFinePerItem: 60 };

// ---------- junkyard ----------
export const JUNK = { minHoursToGo: 2, travelHours: 1 };
// Cumulative thresholds of a single dig roll.
export const DIG_ODDS = { drone: 0.1, parts: 0.48, broken: 0.86, rare: 0.94 };
export const DIG_LOOT = {
  partsMin: 1,
  partsMax: 4,
  brokenCondMin: 5,
  brokenCondMax: 40,
  brokenDefect: 0.5,
  brokenStolen: 0.1,
  rareCondMin: 40,
  rareCondMax: 80,
};
export const JUNK_PILES = [
  { x: 30, y: 76, w: 38, h: 14 },
  { x: 80, y: 74, w: 42, h: 15 },
  { x: 130, y: 76, w: 38, h: 14 },
  { x: 28, y: 97, w: 44, h: 16 },
  { x: 80, y: 97, w: 46, h: 17 },
  { x: 132, y: 97, w: 44, h: 16 },
];

