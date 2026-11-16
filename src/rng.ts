// =====================================================================
//  rng.ts — randomness for the game rules (task 21). The rules never call
//  Math.random themselves: they get an `rng` parameter. The game passes
//  gameRng (Math.random, as before — saves and behaviour unchanged), tests
//  pass a seeded mulberry32(seed), so one seed gives one and the same day.
//  No game knowledge, no DOM.
// =====================================================================

/** A source of random numbers in [0, 1), like Math.random. */
export type Rng = () => number;

/**
 * The game's generator: Math.random, read at call time (not captured), so the
 * parity stand and Vitest mocks that replace Math.random still drive the rules.
 */
export const gameRng: Rng = () => Math.random();

/** Small seeded generator (mulberry32): the same seed gives the same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBetween(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randomBetween(rng, min, max + 1));
}

export function pickRandom<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

export function randomSeed(rng: Rng): number {
  return Math.floor(rng() * 1e9) + 1;
}
