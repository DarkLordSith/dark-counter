// =====================================================================
//  sign.ts — the neon shop sign's pixel font (3×5 glyphs) and where the
//  text sits in the sign frame (task 37: "ЛАВКА 7Б" in Russian, "SHOP 7B"
//  in English, the text comes from the dictionary: app.sign). Pure: the
//  scene draws it, Vitest checks the glyphs and the x.
//  Allowed to hold Cyrillic: the glyphs of the Russian sign.
// =====================================================================
import { SHOP_SIGN } from './data';

/** 3×5 glyphs, rows top to bottom, "1" = a lit pixel. */
export const GLYPHS: Record<string, readonly string[]> = {
  'Л': ['011', '101', '101', '101', '101'],
  'А': ['010', '101', '111', '101', '101'],
  'В': ['110', '101', '110', '101', '110'],
  'К': ['101', '110', '100', '110', '101'],
  'Б': ['111', '100', '110', '101', '110'],
  'S': ['111', '100', '111', '001', '111'],
  'H': ['101', '101', '111', '101', '101'],
  'O': ['111', '101', '101', '101', '111'],
  'P': ['110', '101', '110', '100', '100'],
  'B': ['110', '101', '110', '101', '110'],
  '7': ['111', '001', '010', '010', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};

/** A glyph is 3 px wide plus 1 px of space. */
export const GLYPH_ADVANCE = 4;

/** Top of the sign text, scene px. */
export const SIGN_TEXT_Y = 6;

/** The text centred in the sign frame: RU "ЛАВКА 7Б" → 65 (as before), EN "SHOP 7B" → 67. */
export const signTextX = (text: string): number =>
  SHOP_SIGN.x + Math.round((SHOP_SIGN.w - ([...text].length * GLYPH_ADVANCE - 1)) / 2);
