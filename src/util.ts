// =====================================================================
//  util.ts — random and math helpers (no game knowledge, no DOM).
// =====================================================================

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

export function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1e9) + 1;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundTo10(value: number): number {
  return Math.round(value / 10) * 10;
}
