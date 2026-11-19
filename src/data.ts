// =====================================================================
//  data.ts — static game data and balance numbers. No logic here.
//  New goods are added with one line in ITEM_TYPES (plus a sprite in
//  scene.ts → ITEM_SPRITES if you want an icon).
// =====================================================================
import { RU } from './lang/ru';
import type { Hotspot, ItemType, ItemTypeInfo, Recipe } from './types';

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
// Names are in the dictionaries (lang/ru.ts → items). basePrice — price at 100% condition,
// spawnWeight — relative chance to appear, electronic — can catch the AI virus
// from a neighbour on the shelf, aiCapable — can arrive already infected.
const CATALOG = {
  comm: { basePrice: 120, spawnWeight: 3, electronic: true },
  battery: { basePrice: 90, spawnWeight: 3 },
  servo: { basePrice: 160, spawnWeight: 3 },
  cutter: { basePrice: 300, spawnWeight: 2 },
  visor: { basePrice: 280, spawnWeight: 2, aiCapable: true, electronic: true },
  drone: { basePrice: 450, spawnWeight: 1, electronic: true },
  chip: { basePrice: 520, spawnWeight: 1.5, aiCapable: true, electronic: true },
  arm: { basePrice: 760, spawnWeight: 0.7, aiCapable: true, electronic: true },
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

// ---------- characters ----------
// Names are proper names, not translated (lang/names.ts); the lines are in the dictionaries (lang/ru.ts → lines).
export { HUMAN_NAMES, ROBOT_NAMES } from './lang/names';
/** Grobov's name in the save (cust.name): the Russian one, so an older build shows it; the screen translates it (landlord.name). */
export const LANDLORD_NAME = RU.landlord.name;

// ---------- day & economy ----------
/** Customers on an ordinary day; the station week and the reasons move it (customersToday). */
export const CUSTOMERS_PER_DAY = 6;

// Task 16: the station week = the cycle of Grobov's payment, its 7th day is the payment day.
// Sum 42 = 6 × 7, as before the week.
export const CUSTOMERS_BY_WEEKDAY = [5, 5, 6, 6, 10, 6, 4] as const;
/** Why a weekday differs from CUSTOMERS_PER_DAY: keys of day.reasons in the dictionaries, '' on an ordinary day. */
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
/** Neon "ЛАВКА 7Б" sign with its dark frame, in scene pixels (160×100). The speech bubble and the queue chip keep clear of it (V1.6). */
export const SHOP_SIGN = { x: 59, y: 3, w: 42, h: 11 };
/** Where the customer stands at the counter (COUNTER_X = 80), scene x: the float window keeps clear of it (V2.2). */
export const CUSTOMER_ZONE = { left: 64, right: 96 };

/**
 * Hotspots (V2.1): objects of the shop scene that act like buttons, in scene pixels (160×100).
 * Each one runs the same data-a / data-v as a button in the panel, so the rules stay the same.
 * `when` — when the zone is live (see hotspots.ts → isLive); the junk heap has its own zone in scene.ts.
 * Decor is not clickable: the window with the stars, the sign, the lamp, the door, the card reader (18, 63).
 * On a phone every zone is at least HOTSPOT_MIN_SIDE scene px (≈ 44 pt); the wanted meter is mouse-only.
 */
export const HOTSPOTS: readonly Hotspot[] = [
  { id: 'shelves', x: 7, y: 40, w: 52, h: 22, action: { a: 'tab', v: 'inv' }, when: 'shop' },
  { id: 'terminal', x: 110, y: 50, w: 28, h: 19, action: { a: 'tab', v: 'craft' }, when: 'shop' },
  { id: 'client', x: 64, y: 18, w: 32, h: 54, action: { a: 'tab', v: 'deal' }, when: 'customer' },
  { id: 'bell', x: 34, y: 62, w: 24, h: 18, action: { a: 'call' }, when: 'bell' },
  { id: 'wanted', x: 0, y: 3, w: 6, h: 58, action: null, when: 'mouse' },
];
/** Smallest side of a phone hotspot, scene px: 18 × 375/160 ≈ 42–44 pt. */
export const HOTSPOT_MIN_SIDE = 18;
/** The bell on the counter (8×5 sprite): top-left corner, its foot on the counter top (y 68). */
export const BELL_AT = { x: 40, y: 63 };
