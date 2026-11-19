// =====================================================================
//  util.ts — math and text helpers (no game knowledge, no DOM).
//  Random helpers live in rng.ts: the rules get their generator as a parameter.
// =====================================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Russian plural rule: pluralRu(7, one, few, many) → many (the dictionaries' plural.* use it, see i18n.ts). */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const lastTwo = Math.abs(count) % 100;
  const last = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return many;
  }
  if (last === 1) {
    return one;
  }
  if (last >= 2 && last <= 4) {
    return few;
  }
  return many;
}

export function roundTo10(value: number): number {
  return Math.round(value / 10) * 10;
}

/** Fills {name} placeholders: fill('Долг {debt} кр.', { debt: 900 }) → 'Долг 900 кр.'. Unknown names stay as they are. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
