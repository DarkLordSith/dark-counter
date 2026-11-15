// =====================================================================
//  profile.ts — the player profile: endings seen (per mode), unlocked
//  modes, the mode played last. Stored under PROFILE_KEY, apart from
//  every save: "Новая игра" and save codes never touch it.
//  Pure functions over a KeyValueStore (localStorage in the game).
// =====================================================================
import { ENDING_TEXT, MODES, PLAYABLE_MODES, PROFILE_KEY } from './data';
import type { KeyValueStore, Mode, Profile, ProfileEnding } from './types';

const isMode = (value: unknown): value is Mode => typeof value === 'string' && (MODES as readonly string[]).includes(value);
const isProfileEnding = (value: unknown): value is ProfileEnding =>
  value === 'paid' || (typeof value === 'string' && Object.hasOwn(ENDING_TEXT.ru, value));

export function defaultProfile(): Profile {
  return { endings: {}, unlocked: [...PLAYABLE_MODES], last: 'story' };
}

/** The game's localStorage, or null where there is none (Vitest in node, blocked storage). */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads the profile; anything broken or unknown falls back to the defaults, field by field. */
export function loadProfile(store: KeyValueStore | null = browserStore()): Profile {
  const profile = defaultProfile();
  let data: unknown = null;
  try {
    data = JSON.parse(store?.getItem(PROFILE_KEY) ?? 'null');
  } catch {
    return profile;
  }
  if (typeof data !== 'object' || data === null) {
    return profile;
  }
  const raw = data as Record<string, unknown>;
  if (typeof raw.endings === 'object' && raw.endings !== null) {
    for (const [mode, list] of Object.entries(raw.endings)) {
      if (isMode(mode) && Array.isArray(list)) {
        profile.endings[mode] = [...new Set(list.filter(isProfileEnding))];
      }
    }
  }
  if (Array.isArray(raw.unlocked)) {
    // playable modes stay unlocked whatever the file says
    profile.unlocked = [...new Set([...PLAYABLE_MODES, ...raw.unlocked.filter(isMode)])];
  }
  if (isMode(raw.last) && isPlayable(profile, raw.last)) {
    profile.last = raw.last;
  }
  return profile;
}

export function saveProfile(profile: Profile, store: KeyValueStore | null = browserStore()): void {
  try {
    store?.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // storage unavailable — the profile lives until the page closes
  }
}

/** sandbox stays closed until Patch B1, even if a profile lists it. */
export const isPlayable = (profile: Profile, mode: Mode): boolean =>
  (PLAYABLE_MODES as readonly Mode[]).includes(mode) && profile.unlocked.includes(mode);

/** Remembers an ending of a mode; returns true if it is new (then the profile needs saving). */
export function recordEnding(profile: Profile, mode: Mode, ending: ProfileEnding): boolean {
  const seen = profile.endings[mode] ?? [];
  if (seen.includes(ending)) {
    return false;
  }
  profile.endings[mode] = [...seen, ending];
  return true;
}
