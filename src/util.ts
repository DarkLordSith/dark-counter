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

/** Russian plural: pluralRu(7, 'день', 'дня', 'дней') → 'дней'. */
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

/** "7 дней", "2 дня", "1 день". */
export const daysRu = (count: number): string => `${count} ${pluralRu(count, 'день', 'дня', 'дней')}`;

export function roundTo10(value: number): number {
  return Math.round(value / 10) * 10;
}

/** Fills {name} placeholders: fill('Долг {debt} кр.', { debt: 900 }) → 'Долг 900 кр.'. Unknown names stay as they are. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
