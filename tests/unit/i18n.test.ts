// Localization RU/EN (task 34): one dictionary per language, t() with typed keys,
// the log and the bubble stored as keys and translated when shown.
import { afterEach, describe, expect, it } from 'vitest';
import { HUMAN_NAMES, ITEM_TYPES, LANDLORD_NAME, ROBOT_NAMES } from '../../src/data';
import { HUMAN_NAMES_EN, ROBOT_NAMES_EN } from '../../src/lang/names';
import { mainAction, chipLines } from '../../src/actionbar';
import {
  askBuyer, buyFromSeller, callNextCustomer, closeShop, customerLeaves, deferRent, dig, evict, goHome, goToJunkyard, inspect, offerToSeller,
  payRent, payWithCollateral,
  presentItem, sellToBuyer, sleepUntilMorning, bulkStock, sellBatch, toggleCart,
} from '../../src/economy';
import { customerNameText, DICTS, decode, detectLang, getLang, itemName, nameRef, render, say, setLang, t, text, tx } from '../../src/i18n';
import { EN } from '../../src/lang/en';
import { RU } from '../../src/lang/ru';
import { loadProfile, saveProfile } from '../../src/profile';
import { addLog, createGame } from '../../src/state';
import { isRareLine } from '../../src/star';
import { mulberry32 } from '../../src/rng';
import type { GameState, KeyValueStore } from '../../src/types';
import { makeState } from './helpers';

import { GLYPHS, signTextX } from '../../src/sign';
import enSource from '../../src/lang/en.ts?raw';

const SOURCES = import.meta.glob<string>('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });
const CYRILLIC = /[А-Яа-яЁё]/;

afterEach(() => setLang('ru'));

/* ---------- (а) no Cyrillic in string literals outside the Russian dictionary ---------- */

/**
 * String and template literals of a TypeScript source, comments skipped. TypeScript 7 has no JS API,
 * so this is a small scanner: quotes, templates with ${…} (nested), comments and regex literals.
 */
function stringLiterals(source: string): { text: string; line: number }[] {
  const found: { text: string; line: number }[] = [];
  let i = 0;
  const lineAt = (pos: number): number => source.slice(0, pos).split('\n').length;
  const REGEX_BEFORE = '(,=:[!&|?{};+-*%<>~^';
  let lastCode = '';
  function readQuoted(quote: string): void {
    const start = i;
    i++;
    let value = '';
    while (i < source.length && source[i] !== quote) {
      value += source[i] === '\\' ? source[i++] + source[i] : source[i];
      i++;
    }
    i++;
    found.push({ text: value, line: lineAt(start) });
  }
  function readTemplate(): void {
    const start = i;
    i++;
    let value = '';
    while (i < source.length && source[i] !== '`') {
      if (source[i] === '\\') {
        value += source[i] + source[i + 1];
        i += 2;
      } else if (source[i] === '$' && source[i + 1] === '{') {
        i += 2;
        readCode('}');
        i++;
        value += '${…}';
      } else {
        value += source[i++];
      }
    }
    i++;
    found.push({ text: value, line: lineAt(start) });
  }
  function readCode(until?: string): void {
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (until && c === until && depth === 0) {
        return;
      }
      if (c === '/' && source[i + 1] === '/') {
        i = source.indexOf('\n', i);
        i = i < 0 ? source.length : i;
      } else if (c === '/' && source[i + 1] === '*') {
        i = source.indexOf('*/', i + 2) + 2;
      } else if (c === '\'' || c === '"') {
        readQuoted(c);
        lastCode = 'x';
      } else if (c === '`') {
        readTemplate();
        lastCode = 'x';
      } else if (c === '/' && (lastCode === '' || REGEX_BEFORE.includes(lastCode))) {
        i++;
        let inClass = false;
        while (i < source.length && (source[i] !== '/' || inClass)) {
          if (source[i] === '\\') {
            i++;
          } else if (source[i] === '[') {
            inClass = true;
          } else if (source[i] === ']') {
            inClass = false;
          }
          i++;
        }
        i++;
        lastCode = 'x';
      } else {
        if (c === '{') {
          depth++;
        } else if (c === '}') {
          depth--;
        }
        if (!/\s/.test(c)) {
          lastCode = /[\w$)\]]/.test(c) ? 'x' : c;
        }
        i++;
      }
    }
  }
  readCode();
  return found;
}

/** Files that may hold Cyrillic: the Russian dictionary and the proper names. */
const CYRILLIC_FILES = ['../../src/lang/ru.ts', '../../src/lang/names.ts'];
/** Single literals that may: the shop sign drawn by the scene's own pixel font, the font sample of the mono face. */
const CYRILLIC_LITERALS: Record<string, string[]> = {
  // the glyphs of the Russian sign (the sign text itself is in the dictionaries: app.sign)
  '../../src/sign.ts': ['Л', 'А', 'В', 'К', 'Б'],
  '../../src/main.ts': ['Ёё Жж Яя'],
};

describe('(а) the texts live in the dictionaries', () => {
  it('the scanner sees strings and templates, not comments', () => {
    const literals = stringLiterals("// 'комментарий'\nconst a = 'да'; /* \"нет\" */ const b = `x ${'вложенное'} у`; const r = /'/g; const c = 'ok';");
    expect(literals.map(literal => literal.text)).toEqual(['да', 'вложенное', 'x ${…} у', 'ok']);
  });

  it('no Cyrillic in string literals of src/ outside lang/ru.ts (and the listed exceptions)', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(SOURCES)) {
      if (CYRILLIC_FILES.includes(path)) {
        continue;
      }
      const allowed = CYRILLIC_LITERALS[path] ?? [];
      for (const literal of stringLiterals(source)) {
        if (CYRILLIC.test(literal.text) && !allowed.includes(literal.text)) {
          offenders.push(`${path.replace('../../', '')}:${literal.line} ${literal.text}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ---------- (б, в) RU and EN have the same keys, params and list lengths ---------- */

type Leaf = { path: string; value: string | readonly string[] };

function leaves(node: unknown, path = ''): Leaf[] {
  if (typeof node === 'string' || Array.isArray(node)) {
    return [{ path, value: node as string | readonly string[] }];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
}

const params = (value: string): string[] => [...value.matchAll(/\{(\w+)(?:\|\w+)?\}/g)].map(match => match[1]).sort();

describe('(б, в) the dictionaries match', () => {
  const ru = leaves(RU);
  const en = leaves(EN);

  it('en has every key of ru and nothing else', () => {
    expect(en.map(leaf => leaf.path)).toEqual(ru.map(leaf => leaf.path));
  });

  it('the {params} are the same in both languages, lists have the same length', () => {
    const mismatches: string[] = [];
    ru.forEach((leaf, index) => {
      const other = en[index].value;
      const mine = typeof leaf.value === 'string' ? [leaf.value] : leaf.value;
      const theirs = typeof other === 'string' ? [other] : other;
      if (mine.length !== theirs.length) {
        mismatches.push(`${leaf.path}: ${mine.length} lines vs ${theirs.length}`);
        return;
      }
      mine.forEach((line, i) => {
        if (params(line).join() !== params(theirs[i]).join()) {
          mismatches.push(`${leaf.path}[${i}]: {${params(line)}} vs {${params(theirs[i])}}`);
        }
      });
    });
    expect(mismatches).toEqual([]);
  });

  it('English has no Cyrillic; every item of the catalog has a name in both', () => {
    expect(leaves(EN).filter(leaf => CYRILLIC.test(String(leaf.value))).map(leaf => leaf.path)).toEqual([]);
    expect(Object.keys(RU.items)).toEqual(Object.keys(ITEM_TYPES));
    expect(Object.keys(EN.items)).toEqual(Object.keys(ITEM_TYPES));
    expect(Object.keys(RU.itemDesc)).toEqual(Object.keys(ITEM_TYPES));
    expect(Object.keys(EN.itemDesc)).toEqual(Object.keys(ITEM_TYPES));
  });

  it('plural forms: three in both, picked by the language rule', () => {
    expect(RU.plural.days).toHaveLength(3);
    expect([1, 2, 5, 11, 21, 22].map(n => t('plural.days', { n }))).toEqual(['1 день', '2 дня', '5 дней', '11 дней', '21 день', '22 дня']);
    setLang('en');
    expect([1, 2, 21].map(n => t('plural.days', { n }))).toEqual(['1 day', '2 days', '21 days']);
  });
});

/* ---------- t(), messages, the language ---------- */

describe('t() and stored messages', () => {
  it('fills params, nested messages, lists and {x|lower}', () => {
    expect(t('debt.menuDebt', { debt: 900 })).toBe('Долг: 900 кр.');
    expect(render(tx('lines.buyer.0', { t: tx('items.comm') }))).toBe('Мне нужен коммуникатор. Сегодня.');
    expect(render(tx('expense.paid', { items: [tx('expense.energy', { n: 20 }), tx('expense.tier', { n: 50 })] })))
      .toBe('Расходы: энергия −20 кр., взнос ярусу −50 кр.');
    setLang('en');
    expect(render(tx('lines.buyer.0', { t: tx('items.comm') }))).toBe('Need one: Communicator. Today.'); // EN v1: no |lower (task 37)
    expect(itemName('chip')).toBe('Neurochip');
  });

  it('a key of a newer build shows the key, a missing param stays as {name}', () => {
    expect(render({ k: 'future.key' } as never)).toBe('future.key');
    expect(t('debt.menuDebt')).toBe('Долг: {debt} кр.');
  });

  it('the system language: ru-* is Russian, everything else English', () => {
    expect(['ru', 'ru-RU', 'RU', 'en-US', 'de', undefined].map(detectLang)).toEqual(['ru', 'ru', 'ru', 'en', 'en', 'en']);
  });

  it('the language choice lives in the player profile, not in the save', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = { getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
    expect(loadProfile(store).lang).toBeNull();
    const profile = loadProfile(store);
    profile.lang = 'en';
    saveProfile(profile, store);
    expect(loadProfile(store).lang).toBe('en');
    data.set('dark-counter-profile', JSON.stringify({ lang: 'de' }));
    expect(loadProfile(store).lang).toBeNull();
    expect(createGame('story', mulberry32(1))).not.toHaveProperty('lang');
  });
});

/* ---------- (г) the log: old plain lines and new {k, p} entries ---------- */

describe('(г) the log shows old and new lines', () => {
  it('an old plain line stays as it was, in any language', () => {
    const old = 'Д5: Продано: Нейрочип за 400 кр. (Пак).';
    expect(text(old)).toBe(old);
    setLang('en');
    expect(text(old)).toBe(old);
    expect(text('{not json')).toBe('{not json');
  });

  it('a new entry is a JSON string {d, k, p} and is translated when shown', () => {
    const game = makeState({ day: 12 });
    addLog(game, tx('log.sold', { item: tx('items.chip'), n: 400, name: 'Пак', stolen: tx('log.soldStolen'), ai: '' }));
    expect(typeof game.log[0]).toBe('string');
    expect(decode(game.log[0])).toEqual({ d: 12, k: 'log.sold', p: { item: { k: 'items.chip' }, n: 400, name: 'Пак', stolen: { k: 'log.soldStolen' }, ai: '' } });
    expect(text(game.log[0])).toBe('Д12: Продано: Нейрочип за 400 кр. (Пак). Краденое ушло дальше.');
    setLang('en');
    expect(text(game.log[0])).toBe('D12: Sold: Neurochip for 400 cr. (Пак). The stolen goods moved on.');
  });

  it('the rare-find star works for new entries and old plain lines', () => {
    const game = makeState();
    addLog(game, tx('log.dig', { m: tx('junk.rare', { name: tx('items.arm') }) }));
    expect(isRareLine(game.log[0])).toBe(true);
    expect(isRareLine(say('junk.rare', { name: tx('items.arm') }))).toBe(true);
    expect(isRareLine('Д3: Свалка: Редкая находка: Кибер-рука!')).toBe(true);
    expect(isRareLine(say('junk.empty'))).toBe(false);
  });

  it('Grobov keeps his Russian name in the save (an older build shows it), the screen translates it', () => {
    expect(LANDLORD_NAME).toBe('Ростовщик Гробов');
    setLang('en');
    expect(t('landlord.name')).toBe('Grobov the Moneylender');
  });
});

/* ---------- a day in English: no Russian on the screen except proper names ---------- */

/** Everything a played state puts into words: the log, the bubble, the junkyard line, the bar, the chip. */
function screenTexts(game: GameState): string[] {
  const actor = { phase: game.cust ? 'idle' : 'empty', seed: 0, x: 0, scanStart: 0 } as never;
  return [
    ...game.log.map(line => text(line)),
    game.cust ? text(game.cust.msg) : '',
    text(game.jmsg),
    game.over ? text(game.over) : '',
    ...(['deal', 'inv', 'craft'] as const).map(tab => {
      const main = mainAction(game, actor, tab);
      return main.kind === 'button' ? main.label : main.kind === 'hint' ? main.text : '';
    }),
    ...chipLines(game),
  ];
}

// task 35: in English the customers have English names, so only those are taken out (a Russian name would fail)
const NAMES = [...HUMAN_NAMES_EN, ...ROBOT_NAMES_EN].sort((a, b) => b.length - a.length);
const withoutNames = (line: string): string => NAMES.reduce((rest, name) => rest.split(name).join(''), line);

describe('customer names (task 35)', () => {
  it('one list per language, the same length; the save keeps the Russian name, the screen translates it', () => {
    expect(HUMAN_NAMES_EN).toHaveLength(HUMAN_NAMES.length);
    expect(ROBOT_NAMES_EN).toHaveLength(ROBOT_NAMES.length);
    expect(HUMAN_NAMES_EN[0]).toBe('Red Vic');
    expect(ROBOT_NAMES_EN).toContain('TR-404');
    expect(nameRef('Рыжий Вик')).toEqual({ k: 'names.human.0' });
    expect(nameRef('ТР-404')).toEqual({ k: 'names.robot.2' });
    setLang('en');
    expect(customerNameText('Рыжий Вик')).toBe('Red Vic');
    expect(customerNameText('Старый Гость')).toBe('Старый Гость'); // not in the lists: shown as it is
    setLang('ru');
    expect(customerNameText('Рыжий Вик')).toBe('Рыжий Вик');
  });

  it('the log keeps the name as a key: it follows the language', () => {
    const entry = JSON.stringify({ d: 2, k: 'log.left', p: { name: nameRef('Болт'), reason: '' } });
    setLang('en');
    expect(text(entry)).toContain('Bolt');
    setLang('ru');
    expect(text(entry)).toContain('Болт');
  });
});

describe('a new game in English', () => {
  it('plays days through (customers, inspection, haggling, Grobov, the junkyard, the night) without Russian words', () => {
    setLang('en');
    const rng = mulberry32(34);
    const game = createGame('story', rng);
    const seen: string[] = [];
    for (let step = 0; step < 600 && !game.over; step++) {
      if (game.phase === 'shop') {
        if (!game.cust && !callNextCustomer(game, rng)) {
          closeShop(game);
        } else if (game.cust?.kind === 'sell') {
          inspect(game, (['cond', 'serial', 'flaw'] as const)[step % 3]);
          if (step % 4 === 0) {
            offerToSeller(game, 10, rng); // an insult
          } else if (step % 4 === 1) {
            offerToSeller(game, Math.round(game.cust.ask * 0.8), rng);
          } else {
            buyFromSeller(game);
          }
        } else if (game.cust?.kind === 'buy') {
          const match = game.inv.find(item => item.t === (game.cust as { want: string }).want);
          if (!match) {
            customerLeaves(game);
          } else if (!game.cust.item) {
            presentItem(game, match.uid);
          } else if (step % 2) {
            askBuyer(game, (game.cust.offer ?? 0) * 2, rng);
          } else {
            sellToBuyer(game);
          }
        } else if (game.cust?.kind === 'bulk') {
          seen.push(...screenTexts(game));
          const first = bulkStock(game, game.cust)[0];
          if (first && toggleCart(game, first.uid)) {
            sellBatch(game);
          } else {
            customerLeaves(game);
          }
        } else if (game.cust?.kind === 'rent') {
          seen.push(...screenTexts(game));
          if (game.credits >= game.owed) {
            payRent(game);
          } else if (!game.deferred) {
            deferRent(game);
          } else {
            payWithCollateral(game);
            if (game.cust) {
              evict(game);
            }
          }
        }
      } else if (game.where === 'home' && game.hours >= 2 && game.day % 2) {
        goToJunkyard(game, rng);
      } else if (game.where === 'junk') {
        if (!dig(game, rng) || !game.junk?.d) {
          seen.push(...screenTexts(game));
          goHome(game);
        }
      } else {
        const report = sleepUntilMorning(game, rng);
        seen.push(...report.events.map(event => text(event)));
      }
      seen.push(...screenTexts(game));
    }
    expect(game.day).toBeGreaterThan(5);
    const russian = [...new Set(seen.map(withoutNames).filter(line => CYRILLIC.test(line)))];
    expect(russian).toEqual([]);
    expect(getLang()).toBe('en');
    expect(Object.keys(DICTS)).toEqual(['ru', 'en']);
  });
});

/* ---------- EN v1 (task 37): the scriptwriter's read-through ---------- */

describe('EN v1', () => {
  const values = leaves(EN).flatMap(leaf => (typeof leaf.value === 'string' ? [leaf.value] : [...leaf.value]));

  it('Н1: no {x|lower} in English (the names keep their capitals, no articles before them)', () => {
    expect(values.filter(value => value.includes('|lower'))).toEqual([]);
    expect(EN.lines.buyer).toHaveLength(RU.lines.buyer.length);
    setLang('en');
    expect(render(tx('lines.buyer.0', { t: tx('items.visor') }))).toBe('Need one: AR visor. Today.');
  });

  it('Н2/Н4/Н5: the glossary — deck, heat, S/N, moneylender; no tier / wanted / № / lender left', () => {
    expect(values.filter(value => /\btier\b|wanted|№|\blender\b/i.test(value))).toEqual([]);
    expect(EN.landlord.name).toBe('Grobov the Moneylender');
    expect(EN.hud.heat).toBe('heat');
    expect(EN.deal.serial).toBe('S/N');
    expect(EN.night.quiet).toContain('Lower Deck');
  });

  it('only the lines newer than EN v1 wait for the read-through (junkyard v3 and the stock legend, task 35)', () => {
    const NEWER = [
      // the wholesaler (task 36)
      'groups', 'kind', 'head', 'asIs', 'total', 'heat', 'sell', 'pick', 'refuse', 'noStock', 'wants', 'tooMuch', 'enough', 'sold', 'tech', 'gear',
      'about', 'arrive', 'found', 'rareWith', 'andParts', 'full', 'packFull', 'waits', 'openPack', 'leave', 'throwAway', 'keep', 'slotEmpty', 'legend',
      // the finale (task 38)
      'left', 'askTitle', 'source', 'board', 'rampWarn', 'yes', 'no', 'rampLog', 'poor', 'ok', 'rich',
      'debtDay', 'leftDay', 'earned', 'deals', 'raids', 'star', 'ramp', 'day', 'starItem',
      // goods and categories (task 40): the new item names, all the descriptions, the category names, the filter chips
      ...Object.keys(EN.itemDesc), ...Object.keys(EN.cat), 'all',
      // checks by category (task 41)
      'scan', 'scanTitle', 'diag', 'diagTitle', 'noChecks', 'reject', 'scanClean', 'rejectFound'];
    const drafts = enSource.split('\n').filter(line => /\/\/ draft/.test(line) && !line.trim().startsWith('//'));
    expect(drafts.map(line => line.trim().split(':')[0]).filter(key => !NEWER.includes(key))).toEqual([]);
  });

  it('the sign: "ЛАВКА 7Б" / "SHOP 7B", centred in the frame (RU stays at x 65), every letter has a glyph', () => {
    expect(RU.app.sign).toBe('ЛАВКА 7Б');
    expect(EN.app.sign).toBe('SHOP 7B');
    expect(signTextX(RU.app.sign)).toBe(65);
    expect(signTextX(EN.app.sign)).toBe(67);
    for (const sign of [RU.app.sign, EN.app.sign]) {
      expect([...sign].filter(char => !GLYPHS[char])).toEqual([]);
    }
    expect(GLYPHS.B).toEqual(GLYPHS['В']);
  });
});
