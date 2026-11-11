// =====================================================================
//  state.js — game state (persisted), UI/actor state (not persisted),
//  save / load / migrate and the DC1 save code.
//
//  The shape of `state` IS the save format (localStorage key
//  dark-counter-v3 and DC1: codes). Do not rename fields; when a field
//  is added or changed, upgrade old saves in migrate().
// =====================================================================
import { ITEM_TYPES, ITEM_ODDS, LOG_LIMIT, RENT, SAVE_CODE_PREFIX, SAVE_KEY, START } from './data.js';
import { randomInt } from './util.js';

/* ---------- state ---------- */

/** Persisted game state, see newGame() for the field list. */
export let state = null;

/** Screen state: open tab and selected inventory item uid. */
export const ui = { tab: 'deal', sel: null };

/** The figure walking in the scene: 'empty' → 'in' → 'idle' → 'out' → 'empty'. */
export const actor = { phase: 'empty', x: 140, seed: 0, scanStart: 0, doorOpen: 0 };

export const DOOR_X = 138;
export const COUNTER_X = 80;

export function setState(next) {
  state = next;
}

export function randomLandlordSlot() {
  return randomInt(RENT.landlordSlotMin, RENT.landlordSlotMax);
}

export function newGame() {
  state = {
    day: 1,
    slot: 0, // customers served today
    credits: START.credits,
    parts: START.parts,
    heat: 0, // wanted level 0…MAX_HEAT
    rent: RENT.start, // base rent of the next period
    uid: 0, // last issued item uid
    inv: [],
    log: [],
    cust: null, // customer at the counter
    over: null, // game-over text
    won: false,
    phase: 'shop', // 'shop' | 'evening'
    hours: 0, // evening hours left
    where: 'home', // 'home' | 'junk'
    junk: null, // { piles: [{ dug, seed }] }
    jmsg: '', // junkyard message in the speech bubble
    market: false, // flea market visited this evening
    nextDue: RENT.periodDays, // day the landlord comes
    owed: RENT.start, // amount due on nextDue
    deferred: false,
    llAt: randomLandlordSlot(), // landlord comes after this many customers
    llDone: false, // landlord already visited today
  };
  state.inv.push(createItem('battery', { cond: 70, stolen: false, defect: false, infected: false, known: true }));
  state.inv.push(createItem('comm', { cond: 55, stolen: false, defect: false, infected: false, known: true }));
  addLog('День 1. Лавка 7-Б, нижний ярус. Аренда каждые 3 дня, и она растёт.');
  actorReset();
  ui.tab = 'deal';
}

/* ---------- items ---------- */

export function fullKnowledge() {
  return { cond: true, serial: true, flaw: true };
}

/**
 * Item fields: uid, t (type key), cond (0–100), stolen, defect, infected,
 * k — what the player knows: { cond, serial, flaw }.
 */
export function createItem(type, overrides = {}) {
  const item = {
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

export function findItem(uid) {
  return state.inv.find(item => item.uid === uid);
}

export function addLog(text) {
  state.log.unshift(`Д${state.day}: ${text}`);
  state.log = state.log.slice(0, LOG_LIMIT);
}

/* ---------- actor (scene figure) ---------- */

export function actorEnter(seed) {
  actor.phase = 'in';
  actor.x = DOOR_X;
  actor.seed = seed;
}

export function actorAtCounter(seed) {
  actor.phase = 'idle';
  actor.x = COUNTER_X;
  actor.seed = seed;
}

export function actorReset() {
  actor.phase = 'empty';
  actor.x = DOOR_X;
}

/* ---------- persistence ---------- */

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // storage unavailable (private mode, quota) — play without saving
  }
}

export function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (data && data.inv && data.phase) {
      return data;
    }
  } catch (e) {
    // corrupted save — start fresh
  }
  return null;
}

/** Upgrades saves from older versions in place. */
export function migrate(data) {
  // v1/v2: rent was due every 3rd day and there was no landlord visit
  if (data && data.nextDue == null) {
    data.nextDue = data.day + ((RENT.periodDays - data.day % RENT.periodDays) % RENT.periodDays);
    data.owed = data.rent;
    data.deferred = false;
    data.llAt = randomLandlordSlot();
    data.llDone = false;
  }
  return data;
}

/* ---------- save code (DC1:base64 JSON) ---------- */

export function exportSave() {
  return SAVE_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

function isValidSave(data) {
  return data && Array.isArray(data.inv) && data.phase && typeof data.credits === 'number';
}

/** Returns migrated state or null if the code is not a valid save. */
export function importSave(code) {
  try {
    let payload = (code || '').trim().replace(/\s+/g, '');
    if (payload.startsWith(SAVE_CODE_PREFIX)) {
      payload = payload.slice(SAVE_CODE_PREFIX.length);
    }
    const data = JSON.parse(decodeURIComponent(escape(atob(payload))));
    if (!isValidSave(data)) {
      return null;
    }
    return migrate(data);
  } catch (e) {
    return null;
  }
}
