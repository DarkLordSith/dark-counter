// =====================================================================
//  data.ts — static game data and balance numbers. No logic here.
//  New goods are added with one line in ITEM_TYPES (plus a sprite in
//  scene.ts → ITEM_SPRITES if you want an icon).
// =====================================================================
import type { ItemType, ItemTypeInfo, Recipe } from './types';

// ---------- persistence ----------
/** Save slot of the "Начало конца" mode; old saves live here, so the key never changes. */
export const SAVE_KEY = 'dark-counter-v3';
export const SAVE_CODE_PREFIX = 'DC1:';
/** Patch A: the save code is deflate-raw compressed (DC1: codes still load; DC1 is the fallback without CompressionStream). */
export const SAVE_CODE_PREFIX_V2 = 'DC2:';

// ---------- game modes ----------
/** Modes in the order of the mode screen. sandbox is a stub: shown locked until Patch B1. */
export const MODES = ['story', 'calm', 'sandbox'] as const;
/** Modes that can be played now (the profile may unlock more later). */
export const PLAYABLE_MODES = ['story', 'calm'] as const;
/** One localStorage slot per mode: story keeps the old key, the others sit next to it. */
export const SAVE_KEYS = {
  story: SAVE_KEY,
  calm: 'dark-counter-calm-v3',
  sandbox: 'dark-counter-sandbox-v3',
} as const;
/** Player profile (seen endings, unlocked modes, last mode): not a save, "Новая игра" does not touch it. */
export const PROFILE_KEY = 'dark-counter-profile';

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
/** Customers on an ordinary day; the station week and the reasons move it (customersToday). */
export const CUSTOMERS_PER_DAY = 6;

// Task 16: the station week = the cycle of Grobov's payment, its 7th day is the payment day.
// Sum 42 = 6 × 7, as before the week.
export const CUSTOMERS_BY_WEEKDAY = [5, 5, 6, 6, 10, 6, 4] as const;
/** Why a weekday differs from CUSTOMERS_PER_DAY: keys of DAY_TEXT.reasons, '' on an ordinary day. */
export const WEEKDAY_REASONS = ['quiet', 'quiet', '', '', 'payday', '', 'saving'] as const;
export const CUSTOMER_FLOW = {
  /** Never fewer customers a day. */
  minPerDay: 2,
  /** Wanted level from which honest buyers avoid the shop… */
  heatShy: 7,
  /** …and this many customers fewer. */
  heatLoss: 1,
};
/** Game clock, hours of the day: the shift, the evening, the late opening. */
export const CLOCK = {
  shiftStart: 8,
  /** Task 17: the shift ends at 19:00, so the evening has 5 h — the road and 4 digs before midnight. */
  shiftEnd: 19,
  midnight: 24,
  /** The shop opens this much later for each dig past midnight (≈ the time of the customers lost). */
  lateHoursPerDig: 2,
  /** Never opens later than this: the minimum 2 customers still get an hour each. */
  latestOpen: 17,
};
/** Evening hours after the shop closes: 19:00 → 24:00. */
export const EVENING_HOURS = CLOCK.midnight - CLOCK.shiftEnd;
export const MAX_HEAT = 10;
export const LOG_LIMIT = 50;
/** Log lines kept in a save (the log was ~76% of a day-25 save); the open game keeps LOG_LIMIT. */
export const SAVE_LOG_LINES = 10;
export const START = { credits: 400, parts: 4 };

// Concept skeleton (14.11.2026, after the playtest where 5000 cr. took 16 days):
// the father's debt to Grobov instead of rent and buyout, 60 days to the last shuttle.
// Numbers are a proposal, tune after playtests.
/**
 * The father's debt. Временный баланс 17.11, пересчитать после B1: picked by `npm run sim:grid`
 * on the owner bot (calibrated to the owner's playtest), see tests/sim/README.md. With these numbers
 * the owner bot leaves on the shuttle in ~70% of games and closes the debt around day 49, the
 * careful one is evicted in ~8%. Was: debt 25 000, step 250, seat 2000 + 100 × day.
 */
export const DEBT = {
  /** Debt at the start of a new game (a save keeps its own debt). */
  start: 20000,
  /** Saves made before the debt update get this debt on migration (the old start: migrate() stays as it was). */
  legacyStart: 25000,
  /** Weekly payment: the first one, then + step every week (400, 550, 700…). */
  firstPayment: 400,
  paymentStep: 150,
  periodDays: 7,
  /** The last shuttle leaves on this day; the game ends that morning. */
  shuttleDay: 60,
  /** Old saves get at least this many days before the shuttle. */
  legacyDaysLeft: 21,
  /** Seat price = seatBase + seatPerDay × day (grows towards the evacuation). */
  seatBase: 2000,
  seatPerDay: 50,
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
/**
 * Buyers follow the stock (balance 17.11, owner playtest: 4 buys to 1 sale): an empty shop draws
 * sellers, a full one buyers. The share of buyers among the visitors grows linearly from `fewShare`
 * (`few` items or less) to `manyShare` (`many` items or more). With no stock at all every visitor sells.
 */
export const BUYER_FLOW = { few: 2, fewShare: 0.3, many: 8, manyShare: 0.65 };

/** Chance that the next visitor is a buyer, by the number of items in stock. */
export function buyerShare(stock: number): number {
  const { few, fewShare, many, manyShare } = BUYER_FLOW;
  const t = Math.min(1, Math.max(0, (stock - few) / (many - few)));
  return fewShare + (manyShare - fewShare) * t;
}

export const CUSTOMER = {
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

/** HUD (V1.4): stat labels (day shows "день/60": the shuttle day in the label), icon-button labels for screen readers, the menu. */
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
    sounds: 'Звуки',
    on: 'вкл',
    off: 'выкл',
    menu: 'Меню',
    save: 'Сохранение',
    close: 'Закрыть',
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
    sounds: 'Sounds',
    on: 'on',
    off: 'off',
    menu: 'Menu',
    save: 'Save',
    close: 'Close',
  },
} as const;

/**
 * Action bar (V1.5): the one main button of the current screen, or a dim hint when
 * there is none. RU/EN; {name} placeholders are filled by fill().
 */
export const ACTION_TEXT = {
  ru: {
    call: 'Позвать следующего',
    closeShop: 'Закрыть лавку',
    offer: 'Предложить',
    ask: 'Назвать цену',
    noItem: 'Нет такого, до свидания',
    pay: 'Заплатить {amount} кр.',
    defer: 'Попросить отсрочку',
    collateral: 'Отдать деньги и товар',
    evict: 'Нечем платить',
    sleep: 'Спать',
    home: 'Вернуться домой',
    approaching: 'Подходит к прилавку…',
    leaving: 'Уходит…',
    showItem: 'Выложите товар на прилавок',
    toCounter: 'Клиент ждёт — вкладка «Прилавок»',
    toEvening: 'Вечер — вкладка «Вечер»',
    toJunkyard: 'Свалка — вкладка «Свалка»',
    shiftOver: 'Смена окончена — вкладка «Прилавок»',
    wait: 'Ждём…',
  },
  en: {
    call: 'Call the next one',
    closeShop: 'Close the shop',
    offer: 'Make an offer',
    ask: 'Name a price',
    noItem: 'Don\'t have it, goodbye',
    pay: 'Pay {amount} cr.',
    defer: 'Ask for a delay',
    collateral: 'Give money and goods',
    evict: 'Nothing to pay with',
    sleep: 'Sleep',
    home: 'Go home',
    approaching: 'Coming to the counter…',
    leaving: 'Leaving…',
    showItem: 'Put an item on the counter',
    toCounter: 'A customer is waiting — "Counter" tab',
    toEvening: 'Evening — "Evening" tab',
    toJunkyard: 'Junkyard — "Junkyard" tab',
    shiftOver: 'The shift is over — "Counter" tab',
    wait: 'Waiting…',
  },
} as const;

/** Game modes: names, one-line descriptions, the mode screen, the "debt closed" window of calm. RU/EN. */
export const MODE_TEXT = {
  ru: {
    names: { story: 'Начало конца', calm: 'Без таймера', sandbox: 'Своя лавка' },
    about: {
      story: 'Долг отца, платежи Гробову и последний шаттл на день 60.',
      calm: 'Долг и платежи есть, шаттла нет. Цель — закрыть долг.',
      sandbox: 'Без долга и таймера, для отдыха.',
    },
    screenTitle: 'Режим игры',
    menuModes: 'Режимы',
    current: 'сейчас',
    progress: 'День {day} · долг {debt}',
    finished: 'Финал: {ending} · день {day}',
    paidOff: 'Долг закрыт · день {day}',
    continue: 'Продолжить',
    start: 'Начать',
    restart: 'Начать заново',
    locked: 'откроется позже',
    resetTitle: 'Начать заново?',
    resetText: 'Текущая игра в режиме «{mode}» пропадёт, сохраните код.',
    resetYes: 'Начать',
    resetNo: 'Отмена',
    close: 'Закрыть',
    startCalm: 'День 1. Лавка 7-Б, нижний ярус. Долг отца Гробову: {debt} кр. Платёж раз в {period}.',
    paidTitle: 'Долг закрыт',
    paidLine: 'Долг отца выплачен. Гробов больше не придёт.',
    paidContinue: 'Продолжить',
    paidNewGame: 'Новая игра',
    saveCode: 'Код игры · {mode}, день {day}, {credits} кр.',
  },
  en: {
    names: { story: 'Beginning of the End', calm: 'No Timer', sandbox: 'Your Own Shop' },
    about: {
      story: 'Father\'s debt, payments to Grobov and the last shuttle on day 60.',
      calm: 'The debt and payments stay, no shuttle. The goal is to pay off the debt.',
      sandbox: 'No debt and no timer, to relax.',
    },
    screenTitle: 'Game mode',
    menuModes: 'Modes',
    current: 'now',
    progress: 'Day {day} · debt {debt}',
    finished: 'Ending: {ending} · day {day}',
    paidOff: 'Debt paid · day {day}',
    continue: 'Continue',
    start: 'Start',
    restart: 'Start over',
    locked: 'opens later',
    resetTitle: 'Start over?',
    resetText: 'The current "{mode}" game will be lost, save the code.',
    resetYes: 'Start',
    resetNo: 'Cancel',
    close: 'Close',
    startCalm: 'Day 1. Shop 7-B, lower tier. Father\'s debt to Grobov: {debt} cr. A payment every {period}.',
    paidTitle: 'Debt paid',
    paidLine: 'Father\'s debt is paid off. Grobov will not come again.',
    paidContinue: 'Continue',
    paidNewGame: 'New game',
    saveCode: 'Game code · {mode}, day {day}, {credits} cr.',
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

// ---------- daily expenses (Patch A, task 22) ----------
/**
 * Paid every morning: the shop's energy, and once a week (the first day of the station
 * week, the morning after Grobov's day) the fee to the deck. About 10% of a careful
 * player's weekly gain (balance bot: 1757 cr./week → 140 + 50 = 190). Not enough credits:
 * the rest goes onto the debt. `expensesToday()` in economy.ts is the hook for Patch C events.
 */
export const EXPENSES = { energyPerDay: 20, tierFee: 50, tierFeeWeekday: 1 };

/** The "Сохранение" window: the file buttons (Patch A, task 22). */
export const SAVE_TEXT = {
  ru: {
    download: 'Скачать файлом',
    upload: 'Загрузить из файла',
    fileUnread: 'Файл не прочитан. Выберите файл сейва (.txt).',
    preparing: 'Готовлю код…',
  },
  en: {
    download: 'Download as file',
    upload: 'Load from file',
    fileUnread: 'Could not read the file. Choose a save file (.txt).',
    preparing: 'Preparing the code…',
  },
} as const;

export const EXPENSE_TEXT = {
  ru: {
    paid: 'Расходы: {items}',
    energy: 'энергия −{n} кр.',
    tier: 'взнос ярусу −{n} кр.',
    shortfall: 'Не хватило {n} кр.: ушло в долг, долг {debt} кр.',
    unpaid: 'Не хватило {n} кр. В долг не пишут: место на шаттле оплачено.',
  },
  en: {
    paid: 'Expenses: {items}',
    energy: 'energy −{n} cr.',
    tier: 'deck fee −{n} cr.',
    shortfall: '{n} cr. short: added to the debt, debt {debt} cr.',
    unpaid: '{n} cr. short. Not added to the debt: the shuttle seat is paid for.',
  },
} as const;

// ---------- junkyard (v2, 15.11.2026: one heap, "Копать", noise → drone) ----------
/**
 * A visit costs a fixed travelHours + visitHours of the evening (1 h is left for
 * the flea market, as before). Inside it the player digs up to digsBase + digBonus()
 * times; each dig adds noise, and the noise raises the drone chance.
 */
export const JUNK = {
  /** Road to the junkyard, evening hours (task 16: digs pay their own time). */
  travelHours: 1,
  /** Evening hours of one dig; once the evening is spent, each dig goes past midnight. */
  digHours: 1,
  /** Customers lost the next day for each dig past midnight (the shop opens later). */
  lateCustomerLoss: 1,
  digsBase: 5,
  /** Noise added by one dig: noisePerDig ± noiseSpread (0…100 scale). */
  noisePerDig: 13,
  noiseSpread: 3,
  /** Noise word thresholds: below [0] "тихо", below [1] "слышно", below [2] "громко", else "дрон рядом". */
  noiseLevels: [20, 40, 60],
  /** Drone chance of a dig = (noise before it / droneNoiseScale)²; never on the first dig. */
  droneNoiseScale: 100,
  /** Each dig of this visit adds this much to the rare-find chance (taken from "empty"). */
  rarePerDepth: 0.02,
  /** Wanted level added by the drone when it has no find of this visit to take. */
  droneHeat: 1,
};
/** Chances of one dig (they sum to 1; the depth bonus moves chance from empty to rare). */
export const DIG_ODDS = { parts: 0.4, broken: 0.34, rare: 0.05, empty: 0.21 };
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
/** Junkyard words: the noise scale, the panel, the messages. RU/EN; {n} etc. are filled by fill(). */
export const JUNK_TEXT = {
  ru: {
    title: 'Свалка «Кольцо Б»',
    about: 'Дорога — {hours} ч, раскопка — {dig} ч. {digs} раскопок, глубже — больше редкого. Шумно — прилетает сторожевой дрон. После полуночи лавка завтра откроется позже.',
    arrive: 'Свалка «Кольцо Б». Одна большая куча. Копайте, пока тихо.',
    dig: 'Копать',
    digsLeft: 'Осталось',
    depth: 'глубина',
    noise: 'шум',
    levels: ['тихо', 'слышно', 'громко', 'дрон рядом'],
    empty: 'Пусто. Только ржавые болты.',
    parts: 'Нашлись запчасти: +{n}.',
    broken: 'Откопал: {name}, сломанный. Отнесу на верстак.',
    rare: 'Редкая находка: {name}!',
    droneTook: 'Сторожевой дрон! Пришлось бежать — {name} остался на свалке.',
    droneHeat: 'Сторожевой дрон! Пришлось бежать, он успел снять лицо (розыск +{n}).',
    noDigs: 'Куча перекопана. Пора домой.',
    home: 'Свалка: домой. Находок за визит: {n}.',
    homeHint: 'Уйти можно в любой момент.',
    lastFree: 'Ещё 1 раскопка — и уже за полночь.',
    pastMidnight: 'За полночь: завтра −1 клиент за каждую раскопку.',
    lateSoFar: 'Завтра клиентов меньше: −{n}.',
  },
  en: {
    title: 'Ring B junkyard',
    about: 'Road — {hours} h, a dig — {dig} h. {digs} digs, deeper means rarer finds. Too loud and a guard drone comes. After midnight the shop opens later tomorrow.',
    arrive: 'Ring B junkyard. One big heap. Dig while it is quiet.',
    dig: 'Dig',
    digsLeft: 'Left',
    depth: 'depth',
    noise: 'noise',
    levels: ['quiet', 'audible', 'loud', 'drone near'],
    empty: 'Nothing. Just rusty bolts.',
    parts: 'Spare parts: +{n}.',
    broken: 'Dug out: {name}, broken. Off to the workbench.',
    rare: 'Rare find: {name}!',
    droneTook: 'Guard drone! Had to run — the {name} stayed behind.',
    droneHeat: 'Guard drone! Had to run, it got my face (wanted +{n}).',
    noDigs: 'The heap is dug through. Time to go home.',
    home: 'Junkyard: home. Finds this visit: {n}.',
    homeHint: 'You can leave at any moment.',
    lastFree: 'One more dig and it is past midnight.',
    pastMidnight: 'Past midnight: −1 customer tomorrow for every dig.',
    lateSoFar: 'Fewer customers tomorrow: −{n}.',
  },
} as const;
/** The day (task 16): the morning window, the clock chip, the reasons for fewer or more customers. RU/EN. */
export const DAY_TEXT = {
  ru: {
    expected: 'Ожидается клиентов: {n}',
    reasons: {
      quiet: 'Начало недели, на ярусе тихо',
      payday: 'День зарплаты на ярусе',
      saving: 'Все копят на долги',
      heat: 'Розыск высокий, честные покупатели обходят лавку',
      late: 'Вы открылись в {time} после свалки',
    },
    overslept: 'Проспал после свалки: лавка открылась позже, клиентов на {n} меньше.',
    opened: 'Лавка открылась в {time}.',
    queue: 'ОЧЕРЕДЬ: {n}',
    shiftOver: 'СМЕНА ОКОНЧЕНА',
    payment: '+ПЛАТЁЖ',
    evening: 'ВЕЧЕР',
    junk: 'СВАЛКА',
    night: 'НОЧЬ',
    closed: 'ЗАКРЫТО',
  },
  en: {
    expected: 'Customers expected: {n}',
    reasons: {
      quiet: 'Start of the week, the deck is quiet',
      payday: 'Payday on the deck',
      saving: 'Everyone saves for their debts',
      heat: 'Wanted level is high, honest buyers stay away',
      late: 'You opened at {time} after the junkyard',
    },
    overslept: 'Overslept after the junkyard: the shop opened late, {n} customers fewer.',
    opened: 'The shop opened at {time}.',
    queue: 'QUEUE: {n}',
    shiftOver: 'SHIFT OVER',
    payment: '+PAYMENT',
    evening: 'EVENING',
    junk: 'JUNKYARD',
    night: 'NIGHT',
    closed: 'CLOSED',
  },
} as const;
/** Neon "ЛАВКА 7Б" sign with its dark frame, in scene pixels (160×100). The speech bubble and the queue chip keep clear of it (V1.6). */
export const SHOP_SIGN = { x: 59, y: 3, w: 42, h: 11 };


