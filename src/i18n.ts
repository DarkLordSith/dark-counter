// =====================================================================
//  i18n.ts — localization RU/EN (task 34): one Lang, the dictionaries
//  (lang/ru.ts is the source of keys, lang/en.ts the same shape),
//  t(key, params) for the screen and messages stored as keys.
//
//  Two kinds of text:
//  - the screen (ui, scene, action bar) asks t() at render time, in the
//    current language;
//  - the game (economy, state) never translates: it stores a message
//    {k, p} — tx() — and the screen translates it when it is shown, so
//    the log and the bubble switch language with everything else.
//    In the save such a message is a JSON string inside the same string
//    fields (log, cust.msg, jmsg, over): an older build shows it as text
//    and does not crash; old plain texts are shown as they are.
// =====================================================================
import { EN } from './lang/en';
import { RU } from './lang/ru';
import type { ItemType } from './types';
import { pluralRu } from './util';

export const LANGS = ['ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];

type Widen<T> = T extends string ? string : T extends readonly string[] ? readonly string[] : { readonly [K in keyof T]: Widen<T[K]> };
/** The shape of a dictionary: ru.ts with its strings widened (en.ts is checked against it). */
export type Dict = Widen<typeof RU>;

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends readonly string[]
      ? `${P}${K}` | `${P}${K}.${number}`
      : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Any text of the dictionary: 'hud.credits', 'lines.seller.2', 'plural.days'… A typo is a typecheck error. */
export type TextKey = Paths<typeof RU>;

type ListPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? never : T[K] extends readonly string[] ? `${P}${K}` : ListPaths<T[K], `${P}${K}.`>;
}[keyof T & string];
/** A list of lines ('lines.seller') or plural forms ('plural.days'). */
export type ListKey = ListPaths<typeof RU>;

export const DICTS: Record<Lang, Dict> = { ru: RU, en: EN };

// the catalog and the dictionary name the same goods
RU.items satisfies Record<ItemType, string>;

/** A message: a dictionary key and its params (numbers, names, other messages, lists of messages). */
export interface Tx {
  k: TextKey;
  p?: TxParams;
}
export type TxParam = string | number | Tx | readonly Tx[];
export type TxParams = Readonly<Record<string, TxParam>>;

/* ---------- the current language (a screen setting, like the music; the rules never read it) ---------- */

let current: Lang = 'ru';

export const isLang = (value: unknown): value is Lang => (LANGS as readonly unknown[]).includes(value);

/** The system language: Russian for ru-*, English for everything else. */
export function detectLang(language: string | undefined): Lang {
  return language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export const getLang = (): Lang => current;

export function setLang(lang: Lang): void {
  current = lang;
}

/* ---------- lookup and rendering ---------- */

function lookup(dict: Dict, key: string): unknown {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Plural form index: ru one / few / many, en one / other (kept as three forms, the last two equal). */
function pluralIndex(lang: Lang, n: number): number {
  if (lang === 'ru') {
    return ['one', 'few', 'many'].indexOf(pluralRu(n, 'one', 'few', 'many'));
  }
  return Math.abs(n) === 1 ? 0 : 1;
}

function paramText(value: TxParam, lang: Lang): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(part => render(part, lang)).join(', ');
  }
  return render(value as Tx, lang);
}

/** A message in a language; an unknown key (a newer build's save) shows the key itself. */
export function render(message: Tx, lang: Lang = current): string {
  let value = lookup(DICTS[lang], message.k) ?? lookup(RU, message.k);
  if (Array.isArray(value)) {
    value = value[pluralIndex(lang, Number(message.p?.n ?? 0))];
  }
  if (typeof value !== 'string') {
    return message.k;
  }
  const params = message.p ?? {};
  return value.replace(/\{(\w+)(\|lower)?\}/g, (match, name: string, lower?: string) => {
    if (!Object.hasOwn(params, name)) {
      return match;
    }
    const text = paramText(params[name], lang);
    return lower ? text.toLowerCase() : text;
  });
}

/** A text of the screen in the current language: t('debt.menuDebt', { debt: 900 }). */
export const t = (key: TextKey, params?: TxParams): string => render(tx(key, params));

/** A list of the dictionary in the current language (noise words…). */
export function list(key: ListKey): readonly string[] {
  const value = lookup(DICTS[current], key);
  return Array.isArray(value) ? value : [];
}

/** How many lines a list has (the same in every language: a test checks it); the rules pick one by index. */
export const listLength = (key: ListKey): number => (lookup(RU, key) as readonly string[]).length;

/** A message for the game to keep (the log, the bubble): translated only when shown. */
export const tx = (key: TextKey, params?: TxParams): Tx => (params ? { k: key, p: params } : { k: key });

/** A message stored in a string field of the save (cust.msg, jmsg, over): a JSON string. */
export const say = (key: TextKey, params?: TxParams): string => JSON.stringify(tx(key, params));

/** A log entry: the day and the message; shown as "Д5: …" / "D5: …". */
export interface LogEntry extends Tx {
  d: number;
}

/** The stored message inside a string, or null for a plain text (old saves, older builds). */
export function decode(stored: string): (Tx & { d?: number }) | null {
  if (!stored.startsWith('{')) {
    return null;
  }
  try {
    const data: unknown = JSON.parse(stored);
    if (typeof data === 'object' && data !== null && typeof (data as Tx).k === 'string') {
      return data as Tx & { d?: number };
    }
  } catch {
    // not JSON: a plain text that starts with "{"
  }
  return null;
}

/** What a stored string says, in a language: a message is translated (a log entry gets its day), a plain text stays. */
export function text(stored: string | Tx, lang: Lang = current): string {
  const message = typeof stored === 'string' ? decode(stored) : stored;
  if (!message) {
    return stored as string;
  }
  const day = 'd' in message && typeof message.d === 'number' ? render(tx('log.day', { d: message.d }), lang) : '';
  return day + render(message, lang);
}

/** Whether a message (or one inside its params) uses the key. */
export function mentions(message: Tx, key: TextKey): boolean {
  if (message.k === key) {
    return true;
  }
  return Object.values(message.p ?? {}).some(value =>
    typeof value === 'object' && (Array.isArray(value) ? value.some(part => mentions(part, key)) : mentions(value as Tx, key)));
}

/* ---------- customer names (task 35) ---------- */

/**
 * A customer name as a message: a name of the lists (the save keeps the Russian one) becomes its key
 * 'names.human.3', so it is translated when shown; any other name (old saves, Grobov's) stays as it is.
 */
export function nameRef(name: string): TxParam {
  for (const group of ['human', 'robot'] as const) {
    const index = RU.names[group].indexOf(name);
    if (index >= 0) {
      return tx(`names.${group}.${index}`);
    }
  }
  return name;
}

/** The customer name on the screen, in the current language. */
export const customerNameText = (name: string): string => paramText(nameRef(name), current);

/* ---------- goods ---------- */

/** The item's name as a message (the rules keep it in the log). */
export const itemRef = (type: ItemType): Tx => tx(`items.${type}`);

/** The item's name on the screen. */
export const itemName = (type: ItemType): string => t(`items.${type}`);

/* ---------- the parity stand (tests/parity) ---------- */

/**
 * A save JSON with its stored messages rendered as Russian text (log, cust.msg, jmsg, over): what a build
 * before task 34 kept there. The parity stand compares saves through it (window.__dcPlainSave in main.ts).
 */
export function plainSave(raw: string | null): string | null {
  if (!raw) {
    return raw;
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown> & { cust?: { msg?: unknown } | null };
    const plain = (value: unknown): unknown => (typeof value === 'string' ? text(value, 'ru') : value);
    if (Array.isArray(data.log)) {
      data.log = data.log.map(plain);
    }
    data.jmsg = plain(data.jmsg);
    data.over = plain(data.over);
    if (data.cust && typeof data.cust === 'object') {
      data.cust.msg = plain(data.cust.msg);
    }
    return JSON.stringify(data);
  } catch {
    return raw;
  }
}
