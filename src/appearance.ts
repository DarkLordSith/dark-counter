// =====================================================================
//  appearance.ts — a customer's look from a seed. Pure: used both by the
//  rules (human or robot name) and by the scene (drawing).
// =====================================================================
import { LANDLORD_SEED } from './data';
import { CHARACTER, COLOR, CUSTOMER_TONES } from './palette';
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
  skin: CHARACTER.landlordSkin,
  jacket: CHARACTER.landlordCoat,
  jdark: CHARACTER.landlordCoatDark,
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
    skin: pickSeeded(random, CUSTOMER_TONES.skins),
    hair: pickSeeded(random, CUSTOMER_TONES.hairs),
    style: Math.floor(random() * 6),
    jacket: CUSTOMER_TONES.jacket(hue),
    jdark: CUSTOMER_TONES.jacketDark(hue),
    shirt: CUSTOMER_TONES.shirt(hue),
    trim: CUSTOMER_TONES.trim(hue),
    eye: pickSeeded(random, CUSTOMER_TONES.eyes),
    acc: Math.floor(random() * 5),
    pads: random() < 0.45,
    metal: pickSeeded(random, CUSTOMER_TONES.metals),
    metal2: pickSeeded(random, CUSTOMER_TONES.darkMetals),
  };
}
