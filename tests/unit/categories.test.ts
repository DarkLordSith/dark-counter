// Task 40 («Играбельная v1», п.2): goods and 6 categories. The category is of the type, not in the save.
import { describe, expect, it } from 'vitest';
import {
  BULK_CATEGORIES, ITEM_CATEGORIES, itemCategory, ITEM_TYPES, JUNK_WEIGHTS, RARE_FINDS, RECIPES,
} from '../../src/data';
import { setLang, t } from '../../src/i18n';
import { importSaveCode, migrate } from '../../src/state';
import type { ItemType, SavedGame } from '../../src/types';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';
import sceneTs from '../../src/scene.ts?raw';
import { makeState, shown } from './helpers';
import realDay42 from '../fixtures/finale/day42-real-dc2.txt?raw';

const types = Object.keys(ITEM_TYPES) as ItemType[];
const ofCategory = (cat: string): ItemType[] => types.filter(type => itemCategory(type) === cat);
const cheapest = (list: ItemType[]): number => Math.min(...list.map(type => ITEM_TYPES[type].basePrice));

describe('the catalog', () => {
  it('20–24 types, at least 3 in every category', () => {
    expect(types.length).toBeGreaterThanOrEqual(20);
    expect(types.length).toBeLessThanOrEqual(24);
    for (const cat of ITEM_CATEGORIES) {
      expect(ofCategory(cat).length, cat).toBeGreaterThanOrEqual(3);
    }
  });

  it('household is the cheapest and the most frequent; the old goods keep their categories of the brief', () => {
    const household = ofCategory('household');
    const others = types.filter(type => itemCategory(type) !== 'household');
    // cheaper than the cheapest goods before task 40 (the power cell, 90, is household itself)
    expect(household.filter(type => type !== 'battery').every(type => ITEM_TYPES[type].basePrice < 90)).toBe(true);
    expect(cheapest(household)).toBeLessThan(cheapest(others));
    const weight = (list: ItemType[]): number => list.reduce((sum, type) => sum + ITEM_TYPES[type].spawnWeight, 0) / list.length;
    expect(weight(household)).toBeGreaterThan(weight(others));
    expect(itemCategory('arm')).toBe('implant');
    expect(ITEM_TYPES.arm.electronic).toBe(true); // the flag stays: it is "catches AI", not a group
  });

  it('every type: a junkyard weight, an icon, a name and a description in both languages', () => {
    expect(Object.keys(JUNK_WEIGHTS).sort()).toEqual([...types].sort());
    for (const type of types) {
      expect(sceneTs, type).toMatch(new RegExp(`\\n  ${type}: (\\(\\)|now) =>`));
      expect(RU.items[type]).toBeTruthy();
      expect(EN.items[type]).toBeTruthy();
      expect(RU.itemDesc[type].length).toBeLessThanOrEqual(60);
      expect(EN.itemDesc[type].length).toBeLessThanOrEqual(60);
    }
  });

  it('rare finds: 1–2 a category (household has none), the old order first', () => {
    expect(RARE_FINDS.slice(0, 4)).toEqual(['chip', 'arm', 'drone', 'visor']);
    for (const cat of ITEM_CATEGORIES) {
      const rare = RARE_FINDS.filter(type => itemCategory(type) === cat).length;
      if (cat === 'household') {
        expect(rare, cat).toBe(0);
      } else {
        expect(rare, cat).toBeGreaterThanOrEqual(1);
        expect(rare, cat).toBeLessThanOrEqual(2);
      }
    }
  });

  it('the recipes are as they were', () => {
    expect(RECIPES.map(recipe => recipe.out)).toEqual(['visor', 'cutter', 'drone', 'arm']);
  });

  it('category names in both languages; the wholesaler has words for his three', () => {
    expect(Object.keys(RU.cat)).toEqual([...ITEM_CATEGORIES]);
    expect(Object.keys(EN.cat)).toEqual([...ITEM_CATEGORIES]);
    expect(Object.keys(RU.bulk.groups).sort()).toEqual([...BULK_CATEGORIES].sort());
    expect(Object.keys(RU.bulk.greet).sort()).toEqual([...BULK_CATEGORIES].sort());
    setLang('en');
    expect(t('cat.chem')).toBe('Chem & meds');
    setLang('ru');
    expect(t('cat.chem')).toBe('Химия и медицина');
  });
});

describe('saves', () => {
  it('the category is not in the save', () => {
    expect(JSON.stringify(makeState())).not.toMatch(/"cat"/);
  });

  it('the real day-42 save loads, its items get categories from their types', async () => {
    const game = (await importSaveCode(realDay42.trim()))!;
    expect(game.day).toBe(42);
    expect(game.inv.length).toBeGreaterThan(0);
    for (const item of game.inv) {
      expect(ITEM_CATEGORIES).toContain(itemCategory(item.t));
    }
  });

  it('a wholesaler of an older build at the counter: tech → electronics, gear → household, the greeting follows', () => {
    const old = (grp: string, line: number): SavedGame => {
      const game = makeState({ llDone: true });
      game.cust = { name: 'Тест', seed: 1, pat: 5, max: 5, done: {}, kind: 'bulk', grp: grp as 'household', bud: 500, cart: [], off: 0,
        msg: JSON.stringify({ k: `bulk.greet.${grp}.${line}`, p: { n: 500 } }) };
      return structuredClone(game) as SavedGame;
    };
    const tech = migrate(old('tech', 1))!.cust;
    expect(tech).toMatchObject({ kind: 'bulk', grp: 'electronics' });
    expect(shown(tech!.msg)).toBe('Сгружай всю электронику. Бюджет — 500 кр.');
    const gear = migrate(old('gear', 0))!.cust;
    expect(gear).toMatchObject({ kind: 'bulk', grp: 'household' });
    expect(shown(gear!.msg)).toBe(RU.bulk.greet.household[0]);
    // a save of this build stays as it is
    expect(migrate(old('chem', 2))!.cust).toMatchObject({ grp: 'chem' });
  });
});
