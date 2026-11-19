// =====================================================================
//  guarddrone.ts — the guard drone and the noise of junkyard v2, put
//  aside (task 35): the junkyard is safe junk now, the drone moves to the
//  "factory" of patch C1. Pure rules, nothing in the game calls them yet.
//  How v2 used them: each dig added noisePerDig ± noiseSpread to the
//  visit's noise (JunkVisit.n, still in the save), and before a dig the
//  drone came with droneChance(); it took one find of the visit or, with
//  none, raised the wanted level by `heat`, and the visit ended. The scene
//  sprite and the backpack's drone trace are in git (the commit before
//  task 35, scene.ts → drawGuardDrone, backpack.ts → droneTrace).
// =====================================================================

export const GUARD_DRONE = {
  /** Noise added by one dig: noisePerDig ± noiseSpread (0…100 scale). */
  noisePerDig: 13,
  noiseSpread: 3,
  /** Noise word thresholds: below [0] "тихо", below [1] "слышно", below [2] "громко", else "дрон рядом". */
  noiseLevels: [20, 40, 60],
  /** Drone chance of a dig = (noise before it / noiseScale)²; never on the first dig. */
  noiseScale: 100,
  /** Wanted level added by the drone when it has no find to take. */
  heat: 1,
} as const;

/** Noise word index: 0 тихо, 1 слышно, 2 громко, 3 дрон рядом. */
export type NoiseLevel = 0 | 1 | 2 | 3;

export function noiseLevel(noise: number): NoiseLevel {
  const index = GUARD_DRONE.noiseLevels.findIndex(limit => noise < limit);
  return (index < 0 ? 3 : index) as NoiseLevel;
}

/** Drone chance of the next dig: (noise / scale)², never on the first dig (`depth` = digs done). */
export function droneChance(noise: number, depth: number): number {
  if (depth === 0) {
    return 0;
  }
  return Math.min(1, (noise / GUARD_DRONE.noiseScale) ** 2);
}
