// Scene hotspots (V2.1): zones, hitTest, the bell sprite, the first-tap flag in the profile.
import { describe, expect, it } from 'vitest';
import { BELL_AT, HOTSPOT_MIN_SIDE, HOTSPOTS, PROFILE_KEY, SHOP_SIGN } from '../../src/data';

import { bellSprite, hitTest, isLive } from '../../src/hotspots';
import { SHOP } from '../../src/palette';
import { defaultProfile, loadProfile, recordHotspotTap, saveProfile } from '../../src/profile';
import type { Actor, Hotspot, HotspotId, KeyValueStore } from '../../src/types';
import { makeSeller, makeState } from './helpers';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';

const spot = (id: HotspotId): Hotspot => {
  const found = HOTSPOTS.find(zone => zone.id === id);
  if (!found) {
    throw new Error(`no hotspot ${id}`);
  }
  return found;
};
const center = (zone: Hotspot): [number, number] => [zone.x + zone.w / 2, zone.y + zone.h / 2];
const empty: Pick<Actor, 'phase'> = { phase: 'empty' };
const idle: Pick<Actor, 'phase'> = { phase: 'idle' };
/** A plain shop day: no payment due, three customers still in the queue. */
const shopDay = () => makeState({ nextDue: 7, slot: 3, cn: 6 });

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('hotspot zones', () => {
  it('have unique ids and a tooltip each (RU/EN)', () => {
    const ids = HOTSPOTS.map(zone => zone.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(RU.hotspot[id]).toBeTruthy();
      expect(EN.hotspot[id]).toBeTruthy();
    }
  });

  it('do not overlap each other', () => {
    HOTSPOTS.forEach((a, i) => HOTSPOTS.slice(i + 1).forEach(b => {
      expect(overlaps(a, b), `${a.id} × ${b.id}`).toBe(false);
    }));
  });

  it('stay inside the scene and off the "ЛАВКА 7Б" sign', () => {
    for (const zone of HOTSPOTS) {
      expect(zone.x).toBeGreaterThanOrEqual(0);
      expect(zone.y).toBeGreaterThanOrEqual(0);
      expect(zone.x + zone.w).toBeLessThanOrEqual(160);
      expect(zone.y + zone.h).toBeLessThanOrEqual(100);
      expect(overlaps(zone, SHOP_SIGN), zone.id).toBe(false);
    }
  });

  it('are at least 18 scene px a side (≈ 44 pt on a phone), except the mouse-only wanted meter', () => {
    for (const zone of HOTSPOTS.filter(z => z.when !== 'mouse')) {
      expect(Math.min(zone.w, zone.h), zone.id).toBeGreaterThanOrEqual(HOTSPOT_MIN_SIDE);
    }
    expect(spot('wanted').when).toBe('mouse');
  });

  it('leave the card reader (decor at 18, 63) unclickable and put the bell inside its zone', () => {
    const state = shopDay();
    expect(hitTest(20, 65, state, empty)).toBeNull();
    const bell = spot('bell');
    expect(BELL_AT.x).toBeGreaterThanOrEqual(bell.x);
    expect(BELL_AT.x + 8).toBeLessThanOrEqual(bell.x + bell.w);
    expect(BELL_AT.y + 5).toBe(68); // stands on the counter top
  });
});

describe('hitTest', () => {
  it('finds a zone by its centre and misses decor (the window, the door)', () => {
    const state = shopDay();
    expect(hitTest(...center(spot('shelves')), state, empty)?.id).toBe('shelves');
    expect(hitTest(...center(spot('terminal')), state, empty)?.id).toBe('terminal');
    expect(hitTest(...center(spot('bell')), state, empty)?.id).toBe('bell');
    expect(hitTest(30, 20, state, empty)).toBeNull(); // window with the stars
    expect(hitTest(145, 30, state, empty)).toBeNull(); // door
  });

  it('includes the top-left edge and excludes the bottom-right one', () => {
    const state = shopDay();
    const shelves = spot('shelves');
    expect(hitTest(shelves.x, shelves.y, state, empty)?.id).toBe('shelves');
    expect(hitTest(shelves.x + shelves.w - 0.01, shelves.y + shelves.h - 0.01, state, empty)?.id).toBe('shelves');
    expect(hitTest(shelves.x + shelves.w, shelves.y + 5, state, empty)).toBeNull();
    expect(hitTest(shelves.x + 5, shelves.y + shelves.h, state, empty)?.id).not.toBe('shelves');
    expect(hitTest(shelves.x - 0.01, shelves.y + 5, state, empty)).toBeNull();
  });

  it('client: live only while someone stands at the counter', () => {
    const at = center(spot('client'));
    expect(hitTest(...at, shopDay(), empty)).toBeNull();
    const withCustomer = makeState({ nextDue: 7, cust: makeSeller() });
    expect(hitTest(...at, withCustomer, { phase: 'in' })).toBeNull(); // still walking in
    expect(hitTest(...at, withCustomer, idle)?.id).toBe('client');
  });

  it('bell: live when the counter is free and the queue is not empty', () => {
    const at = center(spot('bell'));
    expect(hitTest(...at, shopDay(), empty)?.id).toBe('bell');
    expect(hitTest(...at, makeState({ nextDue: 7, slot: 6, cn: 6 }), empty)).toBeNull(); // queue empty
    expect(hitTest(...at, makeState({ nextDue: 7, cust: makeSeller() }), idle)).toBeNull(); // customer at the counter
    expect(hitTest(...at, shopDay(), { phase: 'out' })).toBeNull(); // the last one is still leaving
    // Grobov due with the queue over: there is still someone to call
    expect(hitTest(...at, makeState({ nextDue: 3, day: 3, slot: 6, cn: 6 }), empty)?.id).toBe('bell');
  });

  it('evening: shelves and terminal stay live, the client and the bell do not', () => {
    const evening = makeState({ nextDue: 7, phase: 'evening', slot: 6, cn: 6 });
    expect(hitTest(...center(spot('shelves')), evening, empty)?.id).toBe('shelves');
    expect(hitTest(...center(spot('terminal')), evening, empty)?.id).toBe('terminal');
    expect(hitTest(...center(spot('bell')), evening, empty)).toBeNull();
    expect(hitTest(...center(spot('client')), evening, empty)).toBeNull();
  });

  it('junkyard and the end of the game: no shop hotspots', () => {
    const junk = makeState({ nextDue: 7, phase: 'evening', where: 'junk' });
    const over = makeState({ nextDue: 7, over: 'evicted' });
    for (const zone of HOTSPOTS) {
      expect(isLive(zone, junk, empty, 'mouse'), zone.id).toBe(false);
      expect(isLive(zone, over, empty, 'mouse'), zone.id).toBe(false);
    }
  });

  it('wanted meter: only under a mouse, and it has no action', () => {
    const at = center(spot('wanted'));
    expect(hitTest(...at, shopDay(), empty)).toBeNull();
    expect(hitTest(...at, shopDay(), empty, 'touch')).toBeNull();
    expect(hitTest(...at, shopDay(), empty, 'mouse')?.id).toBe('wanted');
    expect(spot('wanted').action).toBeNull();
  });

  it('the terminal is at least 44 pt tall on a 375 pt phone (task 29: 18 → 19 px)', () => {
    expect(spot('terminal').h).toBe(19);
    expect(spot('terminal').h * 375 / 160).toBeGreaterThanOrEqual(44);
  });

  it('runs the same actions as the buttons', () => {
    expect(spot('shelves').action).toEqual({ a: 'tab', v: 'inv' });
    expect(spot('terminal').action).toEqual({ a: 'tab', v: 'craft' });
    expect(spot('client').action).toEqual({ a: 'tab', v: 'deal' });
    expect(spot('bell').action).toEqual({ a: 'call' });
  });
});

describe('bell sprite 8×5', () => {
  const LETTER: Record<string, string> = {
    [SHOP.bellCap]: 'F', [SHOP.bellShine]: 'L', [SHOP.bellBody]: 'D',
    [SHOP.bellShade]: 'S', [SHOP.bellBase]: 'R', [SHOP.bellBaseShade]: 'K',
  };

  /** Draws the rects into an 8×5 buffer of letters; a pixel painted twice or outside fails. */
  function paint(pressed: boolean): string[] {
    const buffer = Array.from({ length: 5 }, () => Array<string>(8).fill('.'));
    for (const [x, y, w, h, color] of bellSprite(pressed)) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          expect(buffer[y + dy]?.[x + dx], `pixel ${x + dx},${y + dy}`).toBe('.');
          buffer[y + dy][x + dx] = LETTER[color] ?? '?';
        }
      }
    }
    return buffer.map(row => row.join(''));
  }

  it('uses six distinct palette colors', () => {
    expect(new Set(Object.keys(LETTER)).size).toBe(6);
  });

  it('rest frame matches the pixel map', () => {
    expect(paint(false)).toEqual(['...FF...', '..LDDD..', '.LDDDDS.', 'DDDDDDSS', 'RRRRRRKK']);
  });

  it('pressed frame: the cap is 1 px down (owner frame in pixelarts/bell-8x5)', () => {
    expect(paint(true)).toEqual(['........', '..LFFD..', '.LDDDDS.', 'DDDDDDSS', 'RRRRRRKK']);
  });
});

describe('first hotspot tap in the profile', () => {
  function memoryStore(): KeyValueStore {
    const data = new Map<string, string>();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
  }

  it('starts off, turns on once and survives a reload', () => {
    const store = memoryStore();
    const profile = loadProfile(store);
    expect(profile.tapped).toBe(false);
    expect(recordHotspotTap(profile)).toBe(true);
    expect(recordHotspotTap(profile)).toBe(false);
    saveProfile(profile, store);
    expect(loadProfile(store).tapped).toBe(true);
  });

  it('an old profile without the flag, or a broken value, reads as not tapped', () => {
    const store = memoryStore();
    store.setItem(PROFILE_KEY, JSON.stringify({ endings: {}, unlocked: ['story'], last: 'story' }));
    expect(loadProfile(store).tapped).toBe(false);
    store.setItem(PROFILE_KEY, JSON.stringify({ ...defaultProfile(), tapped: 'yes' }));
    expect(loadProfile(store).tapped).toBe(false);
  });
});
