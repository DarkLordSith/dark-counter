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
export const LANDLORD_NAME = 'Арендодатель Гробов';

export const SELLER_LINES = ['Глянь, почти новая штука. Почти.', 'Нашёл на нижнем ярусе. Честно нашёл.', 'Срочно нужны кредиты, не торгуйся долго.', 'Отдаю, потому что съезжаю со станции.', 'Не спрашивай, откуда. Спроси, сколько.'];
export const SELLER_STOLEN_LINE = 'Быстро. Кредиты вперёд, вопросы потом.';
export const SELLER_INSULTED_LINES = ['Это оскорбление.', 'Ты издеваешься?', 'За эти деньги сам собери.'];
export const SELLER_COUNTER_LINES = ['Нет. Давай так:', 'Не пойдёт. Моя цена:', 'Хм… нет. Могу за'];
export const BUYER_LINES = ['Мне нужен {t}. Сегодня.', 'Говорят, у тебя бывает {t}. Покажешь?', 'Ищу {t}, без лишних вопросов.', 'Шеф велел достать {t}. Деньги есть.'];
export const BUYER_INSULTED_LINES = ['За такие деньги я новый куплю.', 'Ты бредишь.'];
export const BUYER_COUNTER_LINES = ['Дорого. Могу', 'Ладно, подниму:', 'Последнее слово —'];

// ---------- day & economy ----------
export const CUSTOMERS_PER_DAY = 6;
export const BUYOUT_GOAL = 5000;
export const EVENING_HOURS = 4;
export const MAX_HEAT = 10;
export const LOG_LIMIT = 50;
export const START = { credits: 400, parts: 4 };

// Hotfix 13.11.2026 after the day-34 playtest: weekly rent instead of every 3 days
// (was start 300, every 3 days, +150). Numbers are a proposal, tune after playtests.
export const RENT = {
  start: 750,
  periodDays: 7,
  increase: 250,
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

// ---------- palette (mirrors the CSS tokens in style.css) ----------
export const COLOR = {
  red: '#ff6372',
  amber: '#f0a33e',
  green: '#7fd98e',
  cyan: '#46d3c9',
  dim: '#8b92b5',
  fg: '#dde1f3',
  line: '#2d3455',
  steel: '#5a6080',
  sceneBg: '#141829',
  ink: '#0a0c18',
  gold: '#f0c040',
};
