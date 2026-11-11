// =====================================================================
//  types.ts — shapes of the game data.
//
//  GameState IS the save format (localStorage key dark-counter-v3 and
//  DC1: codes). Short field names are kept on purpose: renaming them
//  would break old saves. When a field changes, upgrade it in migrate().
// =====================================================================
import type { ITEM_TYPES } from './data';

/* ---------- goods ---------- */

/** Key of the goods catalog: 'comm' | 'battery' | … (derived from ITEM_TYPES). */
export type ItemType = keyof typeof ITEM_TYPES;

export interface ItemTypeInfo {
  name: string;
  /** Price at 100% condition. */
  basePrice: number;
  /** Relative chance to appear. */
  spawnWeight: number;
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
  /** Speech bubble text. */
  msg: string;
  /** Patience left. */
  pat: number;
  /** Patience at the start. */
  max: number;
  /** Inspections already made: { cond: 1, … }. */
  done: Partial<Record<InspectCheck, number>>;
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

/** The landlord collecting rent. */
export interface RentCustomer extends CustomerBase {
  kind: 'rent';
}

export type Customer = SellerCustomer | BuyerCustomer | RentCustomer;

/* ---------- game state (= save format) ---------- */

export interface JunkPile {
  dug: boolean;
  /** Seed of the pile's shape. */
  seed: number;
}

export interface GameState {
  day: number;
  /** Customers served today. */
  slot: number;
  credits: number;
  /** Spare parts. */
  parts: number;
  /** Wanted level 0…MAX_HEAT. */
  heat: number;
  /** Base rent of the next period. */
  rent: number;
  /** Last issued item uid. */
  uid: number;
  /** Inventory. */
  inv: Item[];
  /** Event log, newest first. */
  log: string[];
  /** Customer at the counter. */
  cust: Customer | null;
  /** Game-over text, null while playing. */
  over: string | null;
  /** Shop bought out. */
  won: boolean;
  phase: 'shop' | 'evening';
  /** Evening hours left. */
  hours: number;
  where: 'home' | 'junk';
  junk: { piles: JunkPile[] } | null;
  /** Junkyard message in the speech bubble. */
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
}

/** Fields added by the landlord update; saves made before it lack them. */
type RentFields = 'nextDue' | 'owed' | 'deferred' | 'llAt' | 'llDone';

/** Any save the game has ever written (older ones lack the rent fields). */
export type SavedGame = Omit<GameState, RentFields> & Partial<Pick<GameState, RentFields>>;

/* ---------- screen state (not saved) ---------- */

export type Tab = 'deal' | 'inv' | 'craft';

export interface UiState {
  tab: Tab;
  /** Selected inventory item uid. */
  sel: number | null;
}

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
