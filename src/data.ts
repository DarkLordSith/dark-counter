// =====================================================================
//  data.ts — static game data and balance numbers. No logic here.
//  New goods are added with one line in ITEM_TYPES (plus a sprite in
//  scene.ts → ITEM_SPRITES if you want an icon).
// =====================================================================
import { RU } from './lang/ru';
import type { Hotspot, InspectCheck, ItemType, ItemTypeInfo, Recipe } from './types';

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
/**
 * Item categories (task 40, «Играбельная v1» п.2): a property of the type, not of an item, so it is not
 * in the save. Names are in the dictionaries (cat.*). The stock filters, the wholesaler and the checks
 * at the counter (task 41, CATEGORY_CHECKS) use them.
 */
export const ITEM_CATEGORIES = ['electronics', 'weapon', 'implant', 'collectible', 'chem', 'household'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

// Names and descriptions are in the dictionaries (lang/ru.ts → items, itemDesc). basePrice — price at
// 100% condition, spawnWeight — relative chance to appear with a seller (and in a buyer's wish),
// cat — the category, electronic — can catch the AI virus from a neighbour on the shelf (not a
// category: the cyberarm has it too), aiCapable — can arrive already infected.
// Task 40: 21 types, at least 3 a category; household is the cheapest and the most frequent.
const CATALOG = {
  comm: { basePrice: 120, spawnWeight: 3, cat: 'electronics', electronic: true },
  battery: { basePrice: 90, spawnWeight: 3, cat: 'household' },
  servo: { basePrice: 160, spawnWeight: 3, cat: 'electronics' },
  cutter: { basePrice: 300, spawnWeight: 2, cat: 'weapon' },
  visor: { basePrice: 280, spawnWeight: 2, cat: 'electronics', aiCapable: true, electronic: true },
  drone: { basePrice: 450, spawnWeight: 1, cat: 'electronics', electronic: true },
  chip: { basePrice: 520, spawnWeight: 1.5, cat: 'implant', aiCapable: true, electronic: true },
  arm: { basePrice: 760, spawnWeight: 0.7, cat: 'implant', aiCapable: true, electronic: true },
  ration: { basePrice: 30, spawnWeight: 1.5, cat: 'household' },
  water: { basePrice: 45, spawnWeight: 1.5, cat: 'household' },
  lamp: { basePrice: 65, spawnWeight: 1.2, cat: 'household' },
  antirad: { basePrice: 110, spawnWeight: 1.2, cat: 'chem' },
  medkit: { basePrice: 170, spawnWeight: 1.2, cat: 'chem' },
  stims: { basePrice: 260, spawnWeight: 0.6, cat: 'chem' },
  shocker: { basePrice: 190, spawnWeight: 1, cat: 'weapon' },
  needler: { basePrice: 420, spawnWeight: 0.6, cat: 'weapon' },
  railgun: { basePrice: 880, spawnWeight: 0.25, cat: 'weapon' },
  eye: { basePrice: 640, spawnWeight: 0.5, cat: 'implant', aiCapable: true, electronic: true },
  badge: { basePrice: 150, spawnWeight: 0.8, cat: 'collectible' },
  model: { basePrice: 280, spawnWeight: 0.6, cat: 'collectible' },
  coin: { basePrice: 520, spawnWeight: 0.3, cat: 'collectible' },
} satisfies Record<string, ItemTypeInfo>;

/** Goods catalog; its keys define the ItemType union. */
export const ITEM_TYPES: Record<keyof typeof CATALOG, ItemTypeInfo> = CATALOG;

/** The category of a type (task 40; was itemGroup tech/gear by the electronic flag). */
export const itemCategory = (type: ItemType): ItemCategory => ITEM_TYPES[type].cat;

/**
 * Checks at the counter by category (task 41, А2 of 19.11: "check where the risk is"), at most 2.
 * The keys are the save's knowledge flags (item.k, customer.done): `serial` — the serial number
 * (stolen or clean); `flaw` — the AI scanner of electronics (AI virus, defect) or the diagnostics of
 * implants (defect, AI and the condition, which only an implant hides). No checks: haggle at once.
 */
export const CATEGORY_CHECKS: Record<ItemCategory, readonly InspectCheck[]> = {
  electronics: ['flaw', 'serial'],
  weapon: ['serial'],
  implant: ['flaw'],
  collectible: ['serial'],
  chem: [],
  household: [],
};

/** The checks of a type at the counter, in the order of the cells. */
export const checksFor = (type: ItemType): readonly InspectCheck[] => CATEGORY_CHECKS[itemCategory(type)];

/**
 * Check devices (task 43, «Играбельная v1» п.5): the scanner of electronics, the serial reader, the implant
 * diagnostics. Level 1 — its check costs the customer no patience; level 2 — after its check the gut
 * feeling of that customer is sharper (the noise × `sharpNoise`, once a customer). Prices of level 1 and 2.
 */
export const DEVICE_NAMES = ['scan', 'serial', 'diag'] as const;
export type Device = (typeof DEVICE_NAMES)[number];
export const DEVICES = {
  prices: [300, 900],
  maxLevel: 2,
  freeLevel: 1,
  sharpLevel: 2,
  sharpNoise: 0.5,
};

/** Only an implant hides its condition until the diagnostics; everything else shows it at once. */
export const hidesCondition = (type: ItemType): boolean => itemCategory(type) === 'implant';

/**
 * A hidden risk exists only where a check of the category can catch it (no risk without a chance
 * to check): stolen — with the serial check, a defect and the AI virus — with the scanner or diagnostics.
 */
export const canBeStolen = (type: ItemType): boolean => checksFor(type).includes('serial');
export const canHaveFlaw = (type: ItemType): boolean => checksFor(type).includes('flaw');

/** The device a check of this type is made with: the serial reader, or the scanner (electronics) / the diagnostics (implant). */
export const deviceFor = (type: ItemType, check: InspectCheck): Device =>
  check === 'serial' ? 'serial' : hidesCondition(type) ? 'diag' : 'scan';

// Rare junkyard finds (order matters: it is the random pick table; new ones go to the end).
// Task 40: the rare ones of each category; household has none — a staple is never a rarity.
export const RARE_FINDS: ItemType[] = ['chip', 'arm', 'drone', 'visor', 'railgun', 'coin', 'stims'];

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
/**
 * The shop's fame (task 42, «Играбельная v1» п.4): 0…100 in the save (`fame`), 1–5 stars by 20 points.
 * Good deals raise it, customers walking out lower it (at most `dayLossCap` a day), above `decayFrom` it
 * slides back by a share of the excess every morning (so it settles where the player's trade keeps it: the bot's
 * owner ~36, ★2–3, never ★5 by week 3). It only ever adds: customers on top of the week (`flowByStars`, not while
 * wanted — honest buyers stay away then),
 * and buyers who want the dear categories more often (×1 at ★1 … ×`premiumMax` at ★5). Numbers — the bot.
 */
export const FAME = {
  start: 20,
  max: 100,
  starPoints: 20,
  /** A sale to a buyer without an insult in the haggle. */
  goodSale: 2,
  /** A sale of a rare (★) item. */
  rareSale: 3,
  /** A sale after an insult: the buyer still got what they asked for. */
  askedSale: 1,
  /** A customer walked out with no deal: their patience ran out. */
  walkout: 1,
  /** Fame lost in a day never exceeds this. */
  dayLossCap: 5,
  /** Every morning the fame above this slides back by `decayShare` of the excess (at least 1): it has to be kept up. */
  decayFrom: 20,
  decayShare: 0.2,
  /** Extra customers a day by stars ★1…★5: never fewer than the week. */
  flowByStars: [0, 0, 1, 2, 3],
  /** Buyers' wish for the dear categories at ★5 (×1 at ★1, linear between). */
  premiumMax: 2,
};
/** The dear categories famous shops are asked for (they pile up on the shelf otherwise). */
export const PREMIUM_CATEGORIES: readonly ItemCategory[] = ['weapon', 'implant', 'collectible'];
/** Fame stars 1…5: 0–19 ★1, 20–39 ★2 … 80–100 ★5. */
export const fameStars = (fame: number): number => Math.min(5, 1 + Math.floor(fame / FAME.starPoints));
/** Extra customers today for the fame (0…3). */
export const fameFlow = (fame: number): number => FAME.flowByStars[fameStars(fame) - 1];
/** How much more often buyers want the dear categories (1 at ★1 … premiumMax at ★5). */
export const premiumWish = (fame: number): number => 1 + (FAME.premiumMax - 1) * (fameStars(fame) - 1) / 4;
/** Customers a day vary by chance: −1…+1, rolled in the morning (`cr`). */
export const CHANCE_FLOW = 1;

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

/**
 * The finale (task 38). Tiers by the credits on board, for the 'left' ending.
 * Temporary balance 20.11 (the `owner` bot, sim): recount after B1.
 * The ramp check: with the wanted level at rampHeat or more the patrol takes rampToll of the credits
 * on board; rampCheck: false turns it off (a candidate, the owner decides on the review).
 */
export const FINAL: { tierOk: number; tierRich: number; rampCheck: boolean; rampHeat: number; rampToll: number } = {
  tierOk: 1000,
  tierRich: 4000,
  rampCheck: true,
  rampHeat: 7,
  rampToll: 0.25,
};

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
  /** The seller's own worth of a defective / AI-infected item (their lowest price, the collateral): they dump it. */
  defectMult: 0.5,
  infectedMult: 0.15,
  /** What a buyer pays for a defect (they see it); the AI virus they do not see — full price. */
  buyerDefectMult: 0.7,
  /**
   * Task 44, «знание = деньги»: the player's estimate is what the item fetches as far as the player knows —
   * a known defect as the buyer pays for it, a known AI with the bench's purge and the heat of selling it priced in.
   */
  knownDefectMult: 0.7,
  knownInfectedMult: 0.8,
  /** A known stolen item: the raid that takes it and the heat of selling it priced in. */
  knownStolenMult: 0.7,
};

/**
 * Task 41: stolen and defect 0.25 → 0.4. They are rolled only where a check of the category catches them
 * (about half the goods at the counter), so the share of risky items stays near the old one
 * (stolen ~21% instead of 25%, defect ~17% instead of 25%). Bot, 1000 seeds: owner 73.8%, greedy 25.8%.
 */
export const ITEM_ODDS = { condMin: 15, condMax: 98, stolen: 0.4, defect: 0.4, infected: 0.35 };

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

/**
 * Categories the wholesaler asks for (task 40, PM): only the mass goods. He asks for one of them;
 * weapons, implants and collectibles are sold one by one.
 */
export const BULK_CATEGORIES = ['household', 'electronics', 'chem'] as const satisfies readonly ItemCategory[];
export type BulkCategory = (typeof BULK_CATEGORIES)[number];
export const isBulkCategory = (cat: ItemCategory): cat is BulkCategory => (BULK_CATEGORIES as readonly ItemCategory[]).includes(cat);

/**
 * The wholesaler (task 36, a piece of patch B2): takes a batch of one category "as is", at a share of the
 * estimate, within a budget. Comes on top of the day's customers (not in `cn`, not instead of a buyer),
 * at most once a day and only to a full stock (PM 19.11, variant C).
 * Временный баланс 19.11, пересчитать после B1.
 */
export const WHOLESALE = {
  /** Never comes to a smaller stock (checked in the morning and again when his turn comes). */
  minStock: 5,
  /** Chance he comes today, by the morning stock: `few` from minStock, `many` from `manyFrom` items
   *  (the bot: 0.9 keeps the morning stock ≤ 10 with his share of the sales income ≤ 25%). */
  fewChance: 0.3,
  manyFrom: 8,
  manyChance: 0.9,
  /** Price of an item: this share of its estimate (estimatedValue), no checks (the task: 75%). */
  priceShare: 0.75,
  /** Budget = budgetItems × the average estimate of his category in stock × priceShare, ± budgetSpread. */
  budgetItems: 3,
  budgetSpread: 0.25,
  /** Items in one batch at most. */
  maxItems: 5,
  /** Discount buttons on the whole basket, %. */
  discounts: [10, 20],
} as const;

/** Chance the wholesaler comes today, by the number of items in stock in the morning. */
export function wholesaleChance(stock: number): number {
  if (stock < WHOLESALE.minStock) {
    return 0;
  }
  return stock >= WHOLESALE.manyFrom ? WHOLESALE.manyChance : WHOLESALE.fewChance;
}

export const CUSTOMER = {
  /** Task 40: 0.7 → 0.85 — with 21 types instead of 8 a random wish is rarely in stock (the bot: owner 37% → 63% left). */
  buyerWantsStockedChance: 0.85,
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
  stolenAskMult: 0.6,
  stolenMinMult: 0.6,
  infectedAskMult: 0.5,
  infectedMinMult: 0.5,
  defectAskMult: 0.5,
  defectMinMult: 0.6,
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



// ---------- junkyard (v3, task 35, 19.11.2026: several finds a dig, the backpack, no drone) ----------
/**
 * A visit costs travelHours of the evening, then each dig its digHours; past midnight each dig
 * costs a customer tomorrow. The visit ends at home: the player goes when the evening (or the
 * backpack) is full; maxDigs is only a safety cap. Numbers are a start, the bot tunes them
 * (Временный баланс 19.11, пересчитать после B1).
 */
export const JUNK = {
  /** Road to the junkyard, evening hours (task 16: digs pay their own time). */
  travelHours: 1,
  /** Evening hours of one dig; once the evening is spent, each dig goes past midnight. */
  digHours: 1,
  /** Customers lost the next day for each dig past midnight (the shop opens later). */
  lateCustomerLoss: 1,
  /** Digs a visit at most (v2 had digsBase 5 and the drone; now midnight and the backpack limit it). */
  maxDigs: 6,
  /** Places in the backpack (a 4×2 grid). */
  backpackSize: 8,
  /** Each dig deeper adds this much to the rare chance of every find (depth = digs before this one). */
  rarePerDepth: 0.02,
};
/**
 * One dig: `empty` — no items (parts may still come); otherwise 1, 2 or 3 items by `items`.
 * Parts are rolled on their own, partsMin…partsMax every dig.
 * Task 36: `empty` 0.1 → 0.2 and `brokenDefect` 0.5 → 0.6 (the bot: the stock and the owner's exits back in range).
 * Временный баланс 19.11, пересчитать после B1.
 */
export const DIG_ODDS = { empty: 0.2, items: [0.5, 0.35, 0.15], rare: 0.04 };
export const DIG_LOOT = {
  partsMin: 0,
  partsMax: 2,
  brokenCondMin: 5,
  brokenCondMax: 30,
  brokenDefect: 0.6,
  brokenStolen: 0.1,
  rareCondMin: 40,
  rareCondMax: 80,
};
/**
 * What the heap gives: weights of the item types for ordinary (broken) finds, cheap goods first.
 * Task 40: the new types share the old total (~15) so a visit is worth about as much as before.
 */
export const JUNK_WEIGHTS: Record<ItemType, number> = {
  battery: 5,
  comm: 4,
  servo: 4,
  cutter: 1,
  visor: 0.6,
  drone: 0.3,
  chip: 0.3,
  arm: 0.1,
  ration: 1.2,
  water: 1,
  lamp: 0.8,
  antirad: 0.6,
  medkit: 0.4,
  stims: 0.1,
  shocker: 0.4,
  needler: 0.15,
  railgun: 0.03,
  eye: 0.08,
  badge: 0.4,
  model: 0.2,
  coin: 0.05,
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
