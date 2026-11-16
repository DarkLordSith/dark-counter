// =====================================================================
//  state.ts — game state (persisted), UI/actor state (not persisted),
//  save / load / migrate and the DC1 save code.
//
//  The shape of `state` IS the save format (localStorage key
//  dark-counter-v3 and DC1: codes), see GameState in types.ts.
//  Do not rename fields; when a field is added or changed, upgrade old
//  saves in migrate().
// =====================================================================
import {
  CUSTOMERS_PER_DAY, DEBT, DEBT_TEXT, ENDING_TEXT, ITEM_TYPES, ITEM_ODDS, LEGACY_RENT_PERIOD, LOG_LIMIT, MODE_TEXT, PLAYABLE_MODES, RENT, SAVE_CODE_PREFIX, SAVE_KEYS, START,
} from './data';
import { customersToday } from './day';
import { browserStore } from './profile';
import type { Actor, GameState, Item, ItemKnowledge, ItemType, KeyValueStore, Mode, SavedGame, UiState } from './types';
import { gameRng, randomInt } from './rng';
import type { Rng } from './rng';
import { daysRu, fill } from './util';

/* ---------- state ---------- */

/** Persisted game state. Assigned by newGame() or setState() before use. */
export let state!: GameState;

/** Screen state: open tab and selected inventory item uid. */
export const ui: UiState = { tab: 'deal', sel: null };

/** The figure walking in the scene. */
export const actor: Actor = { phase: 'empty', x: 140, seed: 0, scanStart: 0, doorOpen: 0 };

export const DOOR_X = 138;
export const COUNTER_X = 80;

export function setState(next: GameState): void {
  state = next;
}

/**
 * Whether saveGame() writes. Off on the very first launch while the mode screen is open:
 * the game behind it is provisional and must not show up as "День 1 · Продолжить".
 */
export const persistence = { enabled: true };

export function randomLandlordSlot(rng: Rng): number {
  return randomInt(rng, RENT.landlordSlotMin, RENT.landlordSlotMax);
}

/** A new game in a mode (the mode also picks its save slot). Pure: returns the game, touches no globals. */
export function createGame(mode: Mode, rng: Rng): GameState {
  const game: GameState = {
    day: 1,
    slot: 0,
    cn: CUSTOMERS_PER_DAY,
    late: 0,
    credits: START.credits,
    parts: START.parts,
    heat: 0,
    rent: DEBT.firstPayment,
    uid: 0,
    inv: [],
    log: [],
    cust: null,
    over: null,
    phase: 'shop',
    hours: 0,
    where: 'home',
    junk: null,
    jmsg: '',
    market: false,
    nextDue: DEBT.periodDays,
    owed: DEBT.firstPayment,
    deferred: false,
    llAt: randomLandlordSlot(rng),
    llDone: false,
    debt: DEBT.start,
    seat: false,
    shuttleDay: DEBT.shuttleDay,
    ending: null,
    mode,
  };
  // day 1 is the first day of the station week: a quiet start
  game.cn = customersToday(game).count;
  game.inv.push(createItem(game, 'battery', { cond: 70, stolen: false, defect: false, infected: false, known: true }, rng));
  game.inv.push(createItem(game, 'comm', { cond: 55, stolen: false, defect: false, infected: false, known: true }, rng));
  const start = mode === 'story' ? DEBT_TEXT.ru.start : MODE_TEXT.ru.startCalm;
  addLog(game, fill(start, { debt: DEBT.start, period: daysRu(DEBT.periodDays), shuttle: DEBT.shuttleDay }));
  return game;
}

/** Starts a new game as the current one: the scene is empty, the counter tab is open. */
export function newGame(mode: Mode = 'story'): void {
  state = createGame(mode, gameRng);
  actorReset();
  ui.tab = 'deal';
}

/* ---------- items ---------- */

export function fullKnowledge(): ItemKnowledge {
  return { cond: true, serial: true, flaw: true };
}

export interface ItemOverrides {
  cond?: number;
  stolen?: boolean;
  defect?: boolean;
  infected?: boolean;
  /** Everything about the item is known. */
  known?: boolean;
}

/** New item of a game (takes its next uid); unspecified properties are rolled randomly (in this order). */
export function createItem(game: GameState, type: ItemType, overrides: ItemOverrides, rng: Rng): Item {
  const item: Item = {
    uid: ++game.uid,
    t: type,
    cond: overrides.cond ?? randomInt(rng, ITEM_ODDS.condMin, ITEM_ODDS.condMax),
    stolen: overrides.stolen ?? rng() < ITEM_ODDS.stolen,
    defect: overrides.defect ?? rng() < ITEM_ODDS.defect,
    infected: overrides.infected ?? (!!ITEM_TYPES[type].aiCapable && rng() < ITEM_ODDS.infected),
    k: { cond: false, serial: false, flaw: false },
  };
  if (overrides.known) {
    item.k = fullKnowledge();
  }
  return item;
}

export function findItem(game: GameState, uid: number | null): Item | undefined {
  return game.inv.find(item => item.uid === uid);
}

export function addLog(game: GameState, text: string): void {
  game.log.unshift(`Д${game.day}: ${text}`);
  game.log = game.log.slice(0, LOG_LIMIT);
}

/* ---------- actor (scene figure) ---------- */

export function actorEnter(seed: number): void {
  actor.phase = 'in';
  actor.x = DOOR_X;
  actor.seed = seed;
}

export function actorAtCounter(seed: number): void {
  actor.phase = 'idle';
  actor.x = COUNTER_X;
  actor.seed = seed;
}

export function actorReset(): void {
  actor.phase = 'empty';
  actor.x = DOOR_X;
}

/* ---------- validation of untrusted JSON ---------- */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The check localStorage loading has always used. */
function looksLikeSave(value: unknown): value is SavedGame {
  return isObject(value) && !!value.inv && !!value.phase;
}

/** The stricter check for pasted save codes. */
function isValidSaveCode(value: unknown): value is SavedGame {
  return isObject(value) && Array.isArray(value.inv) && !!value.phase && typeof value.credits === 'number';
}

/* ---------- persistence ---------- */

/** Writes the game into the slot of its mode (story = the old key dark-counter-v3). */
export function saveGame(store: KeyValueStore | null = browserStore()): void {
  if (!persistence.enabled) {
    return;
  }
  try {
    store?.setItem(SAVE_KEYS[state.mode], JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, quota) — play without saving
  }
}

/** The raw save in a mode's slot (story by default), or null. */
export function loadGame(mode: Mode = 'story', store: KeyValueStore | null = browserStore()): SavedGame | null {
  try {
    const data: unknown = JSON.parse(store?.getItem(SAVE_KEYS[mode]) ?? 'null');
    if (looksLikeSave(data)) {
      return data;
    }
  } catch {
    // corrupted save — start fresh
  }
  return null;
}

/** The game saved in a mode's slot, migrated; the slot decides the mode. */
export function readSlot(mode: Mode, store: KeyValueStore | null = browserStore(), rng: Rng = gameRng): GameState | null {
  const loaded = migrate(loadGame(mode, store), rng);
  if (loaded) {
    loaded.mode = mode;
  }
  return loaded;
}

/** Upgrades saves from older versions in place; `rng` rolls Grobov's slot for saves older than his visit. */
export function migrate(data: SavedGame | null, rng: Rng = gameRng): GameState | null {
  if (!data) {
    return null;
  }
  // v1/v2: rent was due every 3rd day and there was no landlord visit.
  // Uses the legacy period, not DEBT.periodDays: the weekly payment applies from the next payment.
  if (data.nextDue == null) {
    data.nextDue = data.day + ((LEGACY_RENT_PERIOD - data.day % LEGACY_RENT_PERIOD) % LEGACY_RENT_PERIOD);
    data.owed = data.rent;
    data.deferred = false;
    data.llAt = randomLandlordSlot(rng);
    data.llDone = false;
  }
  // Before the debt update the goal was buying the shop out. The current rent
  // becomes the next payment (rent and owed stay as they are), the father's debt
  // starts in full, and the shuttle is at least three weeks away.
  if (data.debt == null) {
    data.debt = DEBT.start;
    data.seat = false;
    data.shuttleDay = Math.max(DEBT.shuttleDay, data.day + DEBT.legacyDaysLeft);
    data.ending = data.won ? 'left' : data.over ? 'evicted' : null;
    if (data.won && !data.over) {
      data.over = ENDING_TEXT.ru.left.line;
    }
  }
  delete data.won;
  // Before junkyard v2 a visit had six piles and each dig cost an evening hour.
  // A visit in progress becomes a v2 visit with as many digs as the old one still allowed
  // (undug piles, but not more than the hours left), already "deep" by the piles dug;
  // with nothing left to dig the player is at home. Old saves kept the piles after "home": dropped.
  if (data.junk && 'piles' in data.junk) {
    const left = Math.min(data.junk.piles.filter(pile => !pile.dug).length, data.hours);
    if (data.where === 'junk' && left > 0) {
      data.junk = { d: left, n: 0, dp: data.junk.piles.length - left, f: [], s: data.junk.piles[0]?.seed ?? 1 };
    } else {
      data.junk = null;
      data.where = 'home';
      data.jmsg = '';
    }
  }
  // Before the day update (task 16) every day had 6 customers and the shop opened at 08:00:
  // today keeps 6, the station week starts from the next morning.
  data.cn ??= CUSTOMERS_PER_DAY;
  data.late ??= 0;
  // Before modes every save was the story; an unknown or locked mode is read as story too.
  if (!(PLAYABLE_MODES as readonly unknown[]).includes(data.mode)) {
    data.mode = 'story';
  }
  return data as GameState;
}

/* ---------- save code (DC1:base64 JSON) ---------- */

export function exportSave(game: GameState = state): string {
  return SAVE_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(game))));
}

/** Returns migrated state or null if the code is not a valid save. */
export function importSave(code: string | null | undefined, rng: Rng = gameRng): GameState | null {
  try {
    let payload = (code || '').trim().replace(/\s+/g, '');
    if (payload.startsWith(SAVE_CODE_PREFIX)) {
      payload = payload.slice(SAVE_CODE_PREFIX.length);
    }
    const data: unknown = JSON.parse(decodeURIComponent(escape(atob(payload))));
    if (!isValidSaveCode(data)) {
      return null;
    }
    return migrate(data, rng);
  } catch {
    return null;
  }
}
