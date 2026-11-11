// =====================================================================
//  appearance.ts — a customer's look from a seed. Pure: used both by the
//  rules (human or robot name) and by the scene (drawing).
// =====================================================================
import { COLOR, LANDLORD_SEED } from './data';
import type { Appearance, LandlordLook } from './types';

/** Deterministic PRNG (Park–Miller) so a seed always gives the same result. */
export function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

function pickSeeded<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)];
}

const LANDLORD_LOOK: LandlordLook = {
  kind: 'landlord',
  skin: '#d9a07a',
  jacket: '#1d1a26',
  jdark: '#0e0c14',
  metal: COLOR.dim,
  metal2: COLOR.steel,
  eye: COLOR.red,
};

/** Customer look from a seed: kind 'human' | 'android' | 'box' | 'dome' | 'landlord'. */
export function appearanceFor(seed: number): Appearance {
  if (seed === LANDLORD_SEED) {
    return LANDLORD_LOOK;
  }
  const random = seededRandom(seed);
  const kindRoll = random();
  const hue = Math.floor(random() * 360);
  return {
    kind: kindRoll < 0.6 ? 'human' : kindRoll < 0.74 ? 'android' : kindRoll < 0.88 ? 'box' : 'dome',
    skin: pickSeeded(random, ['#f1c7a3', '#d9a07a', '#a8714f', '#6e4a35', '#e3b48f']),
    hair: pickSeeded(random, ['#2a2233', '#d94f8a', '#46d3c9', '#f0a33e', '#e8e8f0', '#5b3b2a', '#7a5cff']),
    style: Math.floor(random() * 6),
    jacket: `hsl(${hue} 30% 34%)`,
    jdark: `hsl(${hue} 30% 22%)`,
    shirt: `hsl(${(hue + 40) % 360} 15% 70%)`,
    trim: `hsl(${(hue + 150) % 360} 65% 60%)`,
    eye: pickSeeded(random, ['#46d3c9', '#ff6372', '#f0a33e', '#7fd98e', '#ffffff']),
    acc: Math.floor(random() * 5),
    pads: random() < 0.45,
    metal: pickSeeded(random, ['#8b92b5', '#a8925a', '#6f7a8c', '#b5beca', '#8a5f55']),
    metal2: pickSeeded(random, ['#5a6080', '#4a5266', '#6e5a3a']),
  };
}
