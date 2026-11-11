// =====================================================================
//  state.ts — game state (persisted), UI/actor state (not persisted),
//  save / load / migrate and the DC1 save code.
//
//  The shape of `state` IS the save format (localStorage key
//  dark-counter-v3 and DC1: codes), see GameState in types.ts.
//  Do not rename fields; when a field is added or changed, upgrade old
//  saves in migrate().
// =====================================================================
import { ITEM_TYPES, ITEM_ODDS, LOG_LIMIT, RENT, SAVE_CODE_PREFIX, SAVE_KEY, START } from './data';
import type { Actor, GameState, Item, ItemKnowledge, ItemType, SavedGame, UiState } from './types';
import { randomInt } from './util';

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

export function randomLandlordSlot(): number {
  return randomInt(RENT.landlordSlotMin, RENT.landlordSlotMax);
}

export function newGame(): void {
  state = {
    day: 1,
    slot: 0,
    credits: START.credits,
    parts: START.parts,
    heat: 0,
    rent: RENT.start,
    uid: 0,
    inv: [],
    log: [],
    cust: null,
    over: null,
    won: false,
    phase: 'shop',
    hours: 0,
    where: 'home',
    junk: null,
    jmsg: '',
    market: false,
    nextDue: RENT.periodDays,
    owed: RENT.start,
    deferred: false,
    llAt: randomLandlordSlot(),
    llDone: false,
  };
  state.inv.push(createItem('battery', { cond: 70, stolen: false, defect: false, infected: false, known: true }));
  state.inv.push(createItem('comm', { cond: 55, stolen: false, defect: false, infected: false, known: true }));
  addLog('День 1. Лавка 7-Б, нижний ярус. Аренда каждые 3 дня, и она растёт.');
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

/** New item; unspecified properties are rolled randomly (in this order). */
export function createItem(type: ItemType, overrides: ItemOverrides = {}): Item {
  const item: Item = {
    uid: ++state.uid,
    t: type,
    cond: overrides.cond ?? randomInt(ITEM_ODDS.condMin, ITEM_ODDS.condMax),
    stolen: overrides.stolen ?? Math.random() < ITEM_ODDS.stolen,
    defect: overrides.defect ?? Math.random() < ITEM_ODDS.defect,
    infected: overrides.infected ?? (!!ITEM_TYPES[type].aiCapable && Math.random() < ITEM_ODDS.infected),
    k: { cond: false, serial: false, flaw: false },
  };
  if (overrides.known) {
    item.k = fullKnowledge();
  }
  return item;
}

export function findItem(uid: number | null): Item | undefined {
  return state.inv.find(item => item.uid === uid);
}

export function addLog(text: string): void {
  state.log.unshift(`Д${state.day}: ${text}`);
  state.log = state.log.slice(0, LOG_LIMIT);
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

export function saveGame(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, quota, tests) — play without saving
  }
}

export function loadGame(): SavedGame | null {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (looksLikeSave(data)) {
      return data;
    }
  } catch {
    // corrupted save — start fresh
  }
  return null;
}

/** Upgrades saves from older versions in place. */
export function migrate(data: SavedGame | null): GameState | null {
  if (!data) {
    return null;
  }
  // v1/v2: rent was due every 3rd day and there was no landlord visit
  if (data.nextDue == null) {
    data.nextDue = data.day + ((RENT.periodDays - data.day % RENT.periodDays) % RENT.periodDays);
    data.owed = data.rent;
    data.deferred = false;
    data.llAt = randomLandlordSlot();
    data.llDone = false;
  }
  return data as GameState;
}

/* ---------- save code (DC1:base64 JSON) ---------- */

export function exportSave(): string {
  return SAVE_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

/** Returns migrated state or null if the code is not a valid save. */
export function importSave(code: string | null | undefined): GameState | null {
  try {
    let payload = (code || '').trim().replace(/\s+/g, '');
    if (payload.startsWith(SAVE_CODE_PREFIX)) {
      payload = payload.slice(SAVE_CODE_PREFIX.length);
    }
    const data: unknown = JSON.parse(decodeURIComponent(escape(atob(payload))));
    if (!isValidSaveCode(data)) {
      return null;
    }
    return migrate(data);
  } catch {
    return null;
  }
}
