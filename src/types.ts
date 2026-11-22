// =====================================================================
//  types.ts — shapes of the game data.
//
//  GameState IS the save format (localStorage key dark-counter-v3 and
//  DC1: codes). Short field names are kept on purpose: renaming them
//  would break old saves. When a field changes, upgrade it in migrate().
// =====================================================================
import type { BulkCategory, Device, ITEM_TYPES, ItemCategory, MODES } from './data';
import type { Lang } from './i18n';
import type { RU } from './lang/ru';

/* ---------- goods ---------- */

/** Key of the goods catalog: 'comm' | 'battery' | … (derived from ITEM_TYPES). */
export type ItemType = keyof typeof ITEM_TYPES;

export interface ItemTypeInfo {
  /** Price at 100% condition. */
  basePrice: number;
  /** Relative chance to appear. */
  spawnWeight: number;
  /** Category (task 40): a property of the type, not in the save. */
  cat: ItemCategory;
  /** Can arrive already infected with the AI virus. */
  aiCapable?: boolean;
  /** Can catch the AI virus from a neighbour on the shelf. */
  electronic?: boolean;
}

/** What the player has found out about an item. */
export interface ItemKnowledge {
  /** Condition is known. */
  cond: boolean;
  /** Serial number checked (stolen or clean is known). */
  serial: boolean;
  /** Insides diagnosed (defect / AI infection is known). */
  flaw: boolean;
}

export interface Item {
  uid: number;
  /** Type key. */
  t: ItemType;
  /** Condition 0–100. */
  cond: number;
  stolen: boolean;
  defect: boolean;
  infected: boolean;
  /** Knowledge flags. */
  k: ItemKnowledge;
  /** A rare junkyard find (V2.6, the ★ mark). Set only to true; absent (old saves, other items) = ordinary. */
  rare?: true;
}

export interface Recipe {
  out: ItemType;
  need: Partial<Record<ItemType, number>>;
  /** Spare parts it costs. */
  parts: number;
}

/* ---------- customers ---------- */

export type InspectCheck = keyof ItemKnowledge;

interface CustomerBase {
  name: string;
  /** Appearance seed (see appearanceFor). */
  seed: number;
  /** Speech bubble: a stored message (i18n say(): a JSON {k, p}) or, in old saves, a plain text. */
  msg: string;
  /** Patience left. */
  pat: number;
  /** Patience at the start. */
  max: number;
  /** Inspections already made: { cond: 1, … }. */
  done: Partial<Record<InspectCheck, number>>;
  /** Task 42: the player insulted this customer in the haggle ("insulted"): the sale raises the fame less. Absent = no. */
  ins?: 1;
}

/** Brings an item to sell to the player. */
export interface SellerCustomer extends CustomerBase {
  kind: 'sell';
  /** Per-customer error of the player's gut feeling. */
  noise: number;
  item: Item;
  /** Current asking price. */
  ask: number;
  /** Hidden lowest price. */
  min: number;
}

/** Wants to buy a type of goods from the player. */
export interface BuyerCustomer extends CustomerBase {
  kind: 'buy';
  noise: number;
  want: ItemType;
  /** Markup the buyer is ready to pay over the base value. */
  mult: number;
  /** Item put on the counter, null until the player shows one. */
  item: Item | null;
  /** Hidden highest price, set when an item is shown. */
  max2?: number;
  /** Current offer, set when an item is shown. */
  offer?: number;
}

/** A buyer who has been shown an item and named a price. */
export type PresentedBuyer = BuyerCustomer & { item: Item; max2: number; offer: number };

/** Grobov collecting the weekly payment of the father's debt (kind 'rent' is kept: it is in saves). */
export interface RentCustomer extends CustomerBase {
  kind: 'rent';
}

/**
 * The wholesaler (task 36): buys a batch of one category at once, "as is", within a budget; no haggling.
 * The basket and the discount are in the save, so a reload keeps the batch on the counter.
 */
export interface WholesaleCustomer extends CustomerBase {
  kind: 'bulk';
  /** Category asked for ("group", task 40: one of BULK_CATEGORIES; saves before it had 'tech' / 'gear', migrate() maps them). */
  grp: BulkCategory;
  /** Budget for the whole batch, credits ("budget"). */
  bud: number;
  /** Uids of the stocked items put in the basket. */
  cart: number[];
  /** Discount on the whole basket, % ("off"): 0 or one of WHOLESALE.discounts. */
  off: number;
}

export type Customer = SellerCustomer | BuyerCustomer | RentCustomer | WholesaleCustomer;

/* ---------- game state (= save format) ---------- */

/** Old junkyard (before v2, 15.11.2026): six piles, one dig each. Only migrate() reads it. */
export interface JunkPile {
  dug: boolean;
  /** Seed of the pile's shape. */
  seed: number;
}

/**
 * A junkyard visit (v3, task 35): one heap, "Копать" until the evening or the backpack is full.
 * The finds go into the stock at once (their uids are the backpack); what does not fit waits in `w`.
 */
export interface JunkVisit {
  /** Digs left this visit ("digs"): a safety cap, JUNK.maxDigs. */
  d: number;
  /** Noise of junkyard v2 (0…100). Kept in the save, not used since v3 (the drone is in guarddrone.ts). */
  n: number;
  /** Digs done this visit ("depth"): raises the rare chance, thins the heap on the scene. */
  dp: number;
  /** Item uids found this visit ("found") = the backpack, at most JUNK.backpackSize. */
  f: number[];
  /** Seed of the heap's shape. */
  s: number;
  /** v2: the drone came and the visit is over, only "home" is left. Old saves only. */
  run?: boolean;
  /** v3: finds of the last dig that did not fit the full backpack ("waiting"); not in the stock.
   *  Throwing an item out lets the first one in; the next dig or "home" leaves them. Absent = none. */
  w?: Item[];
}

export interface GameState {
  day: number;
  /** Customers served today. */
  slot: number;
  /** Customers expected today ("customers number"): customersToday() in the morning; 6 in saves before task 16. */
  cn: number;
  /** Digs past midnight: counted at the junkyard tonight, next day they open the shop later (2 h each)
   *  and take customers; reset when the shop closes. 0 in saves before task 16. */
  late: number;
  credits: number;
  /** Spare parts. */
  parts: number;
  /** Wanted level 0…MAX_HEAT. */
  heat: number;
  /** Size of the current weekly payment (grows by DEBT.paymentStep; "rent" from the rent days). */
  rent: number;
  /** Last issued item uid. */
  uid: number;
  /** Inventory. */
  inv: Item[];
  /** Event log, newest first: log entries as JSON {d, k, p} (i18n, task 34); old saves keep plain texts "Д5: …". */
  log: string[];
  /** Customer at the counter. */
  cust: Customer | null;
  /** Game-over text (the ending's line as a stored message; plain text in old saves), null while playing. */
  over: string | null;
  phase: 'shop' | 'evening';
  /** Evening hours left. */
  hours: number;
  where: 'home' | 'junk';
  junk: JunkVisit | null;
  /** Junkyard message in the speech bubble (a stored message, like cust.msg). */
  jmsg: string;
  /** Flea market visited this evening. */
  market: boolean;
  /** Day the landlord comes. */
  nextDue: number;
  /** Amount due on nextDue. */
  owed: number;
  /** Rent was deferred once (a second time is not allowed). */
  deferred: boolean;
  /** Landlord comes after this many customers ("landlord at"). */
  llAt: number;
  /** Landlord already visited today ("landlord done"). */
  llDone: boolean;
  /** Task 36: the wholesaler comes today after this many customers ("bulk"), on top of `cn`: rolled in the
   *  morning, removed once he came (or the stock was too small by then). Absent = not today. */
  bk?: number;
  /** Father's debt to Grobov left; weekly and early payments reduce it, deferral fines add to it. */
  debt: number;
  /** A shuttle seat is bought. */
  seat: boolean;
  /** Day the last shuttle leaves; that morning the game ends. */
  shuttleDay: number;
  /** How the game ended, null while playing. */
  ending: Ending | null;
  /** Game mode; also picks the localStorage slot (SAVE_KEYS). Saves before modes are 'story'. */
  mode: Mode;
  /** Task 38: day of departure ("leave"): the early cargo flight or the shuttle day. Absent while playing and for other endings. */
  lv?: number;
  /** Task 38: run stats for the final window ("stats"). Saves before it get them in migrate(), counted from that day. */
  st: RunStats;
  /** Task 42: the shop's fame 0…100 (FAME in data.ts). 20 in new games and in saves before it. */
  fame: number;
  /** Task 42: today's chance in the customer count ("customers random"), −1…+1, rolled in the morning; 0 in older saves. */
  cr: number;
  /** Task 42: today's fame tally for the next morning's window ("fame day"). */
  fd: FameDay;
  /** Task 43: levels of the check devices 0…2 ("devices"); all 0 in saves before it. */
  dev: Record<Device, number>;
}

/** What moved the fame today: shown the next morning, then reset. */
export interface FameDay {
  /** Fame at the start of the day ("start"). */
  s: number;
  /** Good deals: sales to buyers without an insult. */
  g: number;
  /** Customers who walked out, their patience gone ("walked"). */
  w: number;
  /** Fame lost today, capped by FAME.dayLossCap ("lost"). */
  l: number;
}

/**
 * Task 38: what the run counted for the final window. Saves made before it start counting on load
 * (`from` > 1): the sums are not shown then ("—"), and a debt closed before `from` has no day.
 */
export interface RunStats {
  /** Day the counting started: 1 in a new game, the load day for an older save. */
  from: number;
  /** Day the debt first reached 0 ("debt closed"), null until then or if it closed before `from`. */
  dc: number | null;
  /** Credits earned by sales: buyers and the wholesaler ("earned"). */
  earn: number;
  /** Deals: items bought from sellers, sold to buyers, batches sold to the wholesaler. */
  deals: number;
  /** Runs to the junkyard ("Вылазок на свалку"): +1 per visit, not per dig (since the task 38 fix; saves of PR #42 counted digs). */
  raids: number;
  /** The best rare (★) find: its type and condition; null — none yet. */
  star: { t: ItemType; c: number } | null;
  /** Credits the patrol took at the ramp on departure; absent — no check or no toll. */
  toll?: number;
}

/** Game modes: story "Начало конца", calm "Без таймера", sandbox "Своя лавка" (locked stub). */
export type Mode = (typeof MODES)[number];

/** What the profile remembers per mode: story endings, and 'paid' when a calm game closed the debt. */
export type ProfileEnding = Ending | 'paid';

/** Player profile: lives under PROFILE_KEY, outside every save. */
export interface Profile {
  /** Endings seen, per mode. */
  endings: Partial<Record<Mode, ProfileEnding[]>>;
  /** Modes the player may start. */
  unlocked: Mode[];
  /** Mode played last: the game continues it on launch. */
  last: Mode;
  /** A scene hotspot was tapped once (V2.1): the first-day hints never pulse again. */
  tapped: boolean;
  /** Interface language chosen in ☰ (task 34); null — the system language. */
  lang: Lang | null;
}

/** Endings: left, stayed, evicted; betray and takeover are stubs for Patch C. */
export type Ending = keyof typeof RU.ending;

/** Fields added by the landlord update; saves made before it lack them. */
type RentFields = 'nextDue' | 'owed' | 'deferred' | 'llAt' | 'llDone';

/** Fields added by the debt update (concept skeleton) and the modes update; saves made before them lack them. */
type DebtFields = 'debt' | 'seat' | 'shuttleDay' | 'ending' | 'mode';

/**
 * Any save the game has ever written: older ones lack the rent or debt fields,
 * saves before the debt update have `won` (shop bought out), which migrate() turns into the 'left' ending,
 * and saves before junkyard v2 may hold a visit with six piles.
 */
/** Fields added by task 16 (the day: clock, week, late opening). */
type DayFields = 'cn' | 'late';
/** Fields added by task 38 (the finale): the run stats. */
type FinaleFields = 'st';
/** Fields added by task 42 (the shop's fame). */
type FameFields = 'fame' | 'cr' | 'fd';
/** Fields added by task 43 (the check devices). */
type DeviceFields = 'dev';
export type SavedGame = Omit<GameState, RentFields | DebtFields | DayFields | FinaleFields | FameFields | DeviceFields | 'junk'>
  & Partial<Pick<GameState, RentFields | DebtFields | DayFields | FinaleFields | FameFields | DeviceFields>>
  & { won?: boolean; junk: GameState['junk'] | { piles: JunkPile[] } };

/* ---------- screen state (not saved) ---------- */

export type Tab = 'deal' | 'inv' | 'craft';

/** Stock filter chips (V2.3; task 40: by category): everything, one category, known stolen. */
export type StockFilter = 'all' | ItemCategory | 'stolen';

export interface UiState {
  tab: Tab;
  /** Selected inventory item uid: the one on the workbench window. */
  sel: number | null;
  /** Stock filter chip; remembered for the session, not saved. */
  filter: StockFilter;
  /** The morning window was shown and nobody is called yet (task 29): the bar says "Открыть лавку". */
  morning: boolean;
}

/* ---------- hotspots (V2.1) ---------- */

export type HotspotId = 'shelves' | 'terminal' | 'client' | 'bell' | 'wanted';

/**
 * When a hotspot is live: 'shop' — in the shop by day and in the evening; 'customer' — someone stands
 * at the counter; 'bell' — "Позвать следующего" is possible; 'mouse' — only under a mouse (a tooltip).
 */
export type HotspotWhen = 'shop' | 'customer' | 'bell' | 'mouse';

/** A clickable object of the scene, in scene pixels; `action` is the data-a / data-v of the same button. */
export interface Hotspot {
  id: HotspotId;
  x: number;
  y: number;
  w: number;
  h: number;
  action: { a: string; v?: string } | null;
  when: HotspotWhen;
}

/** Pointer that asks: a mouse hovers (tooltips), a finger only taps. */
export type PointerKind = 'mouse' | 'touch';

/** The figure in the scene: 'empty' → 'in' → 'idle' → 'out' → 'empty'. */
export interface Actor {
  phase: 'empty' | 'in' | 'idle' | 'out';
  x: number;
  seed: number;
  /** performance.now() of the last inspection scan. */
  scanStart: number;
  /** 0 closed … 1 open. */
  doorOpen: number;
}

/* ---------- appearance ---------- */

export interface CustomerLook {
  kind: 'human' | 'android' | 'box' | 'dome';
  skin: string;
  hair: string;
  /** Hair style 0–5. */
  style: number;
  jacket: string;
  jdark: string;
  shirt: string;
  trim: string;
  eye: string;
  /** Accessory 0–4. */
  acc: number;
  pads: boolean;
  metal: string;
  metal2: string;
}

export interface LandlordLook {
  kind: 'landlord';
  skin: string;
  jacket: string;
  jdark: string;
  metal: string;
  metal2: string;
  eye: string;
}

export type Appearance = CustomerLook | LandlordLook;

/* ---------- storage ---------- */

/** The part of localStorage the game uses; tests pass a Map-backed one. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
