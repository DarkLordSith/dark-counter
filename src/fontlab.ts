// =====================================================================
//  fontlab.ts — "font lab": a debug sheet to tune font sizes and faces
//  live on the phone. Opened from the diagnostics overlay (long press on
//  the version → «Шрифты»). Changes CSS variables and data attributes on
//  <html> only; never touches the save or gameplay. Settings live in
//  localStorage under their own key, one per type profile (phone /
//  desktop, see style.css).
// =====================================================================
import { maybeById } from './dom';

/* =====================================================================
   Settings (pure)
   ===================================================================== */

export type SizeToken = '--fs-xs' | '--fs-s' | '--fs-m' | '--fs-l' | '--fs-px-s' | '--fs-px-m' | '--fs-px-l';
export type GroupId = 'names' | 'prices' | 'verdict' | 'hud' | 'headings';
export type GroupFont = 'pixel' | 'mono';
export type MonoWeight = 400 | 500 | 600;

export interface GroupSettings {
  font: GroupFont;
  /** Weight when the group is set in mono (the pixel font has one weight). */
  weight: MonoWeight;
  upper: boolean;
}

export interface FontLabSettings {
  sizes: Record<SizeToken, number>;
  groups: Record<GroupId, GroupSettings>;
}

/** Type profiles of style.css: phone = :root, desktop = @media DESKTOP_QUERY. */
export type Profile = 'phone' | 'desktop';
export const PROFILES: readonly Profile[] = ['phone', 'desktop'];
export const DESKTOP_QUERY = '(min-width: 900px)';

/** Same values as style.css for each profile (checked by tests/unit/fontlab.test.ts). */
export const PROFILE_SIZES: Readonly<Record<Profile, Readonly<Record<SizeToken, number>>>> = {
  phone: {
    '--fs-xs': 11,
    '--fs-s': 12,
    '--fs-m': 14,
    '--fs-l': 18,
    '--fs-px-s': 8,
    '--fs-px-m': 16,
    '--fs-px-l': 24,
  },
  desktop: {
    '--fs-xs': 11,
    '--fs-s': 12,
    '--fs-m': 14,
    '--fs-l': 18,
    '--fs-px-s': 8,
    '--fs-px-m': 16,
    '--fs-px-l': 24,
  },
};

/** The phone profile: the base the game is designed for. */
export const DEFAULT_SIZES = PROFILE_SIZES.phone;

export const SIZE_TOKENS = Object.keys(DEFAULT_SIZES) as SizeToken[];

/**
 * Mono: any size 10–20 in 1px steps. Pixel: the 8×8 grid of Public Pixel is
 * sharp when size × DPR / 8 is a whole number: multiples of 8 everywhere, and
 * 12 on DPR 2 screens (Mac Retina) — so the lab offers 12 to try on desktop.
 */
export const MONO_RANGE = { min: 10, max: 20, step: 1 };
export const PIXEL_SIZES = [8, 12, 16, 24, 32] as const;

/** Whether the pixel font is drawn sharp: one font pixel = a whole number of device pixels. */
export function isCrisp(size: number, dpr: number): boolean {
  const devicePixels = size * dpr / 8;
  return Math.abs(devicePixels - Math.round(devicePixels)) < 0.01;
}

export const isPixelToken = (token: SizeToken): boolean => token.startsWith('--fs-px-');

/** Groups that are in the pixel font by default; the selectors are in style.css (html[data-fl-…]). */
export const GROUPS: readonly GroupId[] = ['names', 'prices', 'verdict', 'hud', 'headings'];

export const WEIGHTS: readonly MonoWeight[] = [400, 500, 600];

export function defaultSettings(profile: Profile = 'phone'): FontLabSettings {
  const groups = Object.fromEntries(GROUPS.map(id => [id, { font: 'pixel', weight: 400, upper: false }])) as Record<GroupId, GroupSettings>;
  return { sizes: { ...PROFILE_SIZES[profile] }, groups };
}

/** One step up (+1) or down (−1) from the current size, within the allowed values. */
export function stepSize(token: SizeToken, current: number, direction: 1 | -1): number {
  if (isPixelToken(token)) {
    const index = PIXEL_SIZES.indexOf(current as typeof PIXEL_SIZES[number]);
    const next = Math.min(PIXEL_SIZES.length - 1, Math.max(0, (index < 0 ? 1 : index) + direction));
    return PIXEL_SIZES[next];
  }
  return Math.min(MONO_RANGE.max, Math.max(MONO_RANGE.min, current + direction * MONO_RANGE.step));
}

function validSize(token: SizeToken, value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (isPixelToken(token)) {
    return (PIXEL_SIZES as readonly number[]).includes(value) ? value : fallback;
  }
  return Number.isInteger(value) && value >= MONO_RANGE.min && value <= MONO_RANGE.max ? value : fallback;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Settings from storage, with anything unknown or out of range replaced by the default. */
export function sanitize(raw: unknown, profile: Profile = 'phone'): FontLabSettings {
  const result = defaultSettings(profile);
  if (!isRecord(raw)) {
    return result;
  }
  const sizes = isRecord(raw.sizes) ? raw.sizes : {};
  for (const token of SIZE_TOKENS) {
    result.sizes[token] = validSize(token, sizes[token], result.sizes[token]);
  }
  const groups = isRecord(raw.groups) ? raw.groups : {};
  for (const id of GROUPS) {
    const group = groups[id];
    if (!isRecord(group)) {
      continue;
    }
    result.groups[id] = {
      font: group.font === 'mono' ? 'mono' : 'pixel',
      weight: (WEIGHTS as readonly unknown[]).includes(group.weight) ? group.weight as MonoWeight : 400,
      upper: group.upper === true,
    };
  }
  return result;
}

export const isDefault = (settings: FontLabSettings, profile: Profile = 'phone'): boolean =>
  JSON.stringify(settings) === JSON.stringify(defaultSettings(profile));

/* =====================================================================
   Texts (RU / EN), one object for the future dictionary
   ===================================================================== */

export type Lang = 'ru' | 'en';

export const FONTLAB_TEXT = {
  ru: {
    title: 'Шрифты',
    sizes: 'Размеры',
    groups: 'Группы',
    pixel: 'пикс',
    mono: 'моно',
    upper: 'ЗАГЛАВНЫЕ',
    upperShort: 'АА',
    reset: 'Сбросить',
    copy: 'Скопировать',
    close: 'Закрыть',
    copied: 'Скопировано.',
    selectManually: 'Текст выделен, скопируйте вручную.',
    measured: 'Факт',
    ticker: 'лента',
    pane: 'панель',
    profile: 'Профиль',
    profileNames: { phone: 'телефон', desktop: 'десктоп' },
    profileHint: 'у каждого профиля свои настройки; десктоп — окно от 900px',
    crisp: 'чётко',
    soft: 'мягко',
    sizeNames: { '--fs-xs': 'моно XS (метки HUD)', '--fs-s': 'моно S (лог, подписи)', '--fs-m': 'моно M (текст панелей)', '--fs-l': 'моно L (группы в моно)',
      '--fs-px-s': 'пикс S', '--fs-px-m': 'пикс M', '--fs-px-l': 'пикс L' },
    groupNames: { names: 'названия', prices: 'цены', verdict: 'вердикт', hud: 'числа HUD', headings: 'заголовки' },
  },
  en: {
    title: 'Fonts',
    sizes: 'Sizes',
    groups: 'Groups',
    pixel: 'pixel',
    mono: 'mono',
    upper: 'UPPER',
    upperShort: 'AA',
    reset: 'Reset',
    copy: 'Copy',
    close: 'Close',
    copied: 'Copied.',
    selectManually: 'Text selected, copy it manually.',
    measured: 'Measured',
    ticker: 'log',
    pane: 'pane',
    profile: 'Profile',
    profileNames: { phone: 'phone', desktop: 'desktop' },
    profileHint: 'each profile keeps its own settings; desktop is a window from 900px',
    crisp: 'sharp',
    soft: 'soft',
    sizeNames: { '--fs-xs': 'mono XS (HUD labels)', '--fs-s': 'mono S (log, captions)', '--fs-m': 'mono M (pane text)', '--fs-l': 'mono L (groups in mono)',
      '--fs-px-s': 'pixel S', '--fs-px-m': 'pixel M', '--fs-px-l': 'pixel L' },
    groupNames: { names: 'item names', prices: 'prices', verdict: 'verdict', hud: 'HUD numbers', headings: 'headings' },
  },
} as const satisfies Record<Lang, unknown>;

/** The result to paste into a task: "[телефон, DPR 3] --fs-m: 15px; …; названия: mono 600; вердикт: pixel ЗАГЛАВНЫЕ". */
export function formatSettings(settings: FontLabSettings, lang: Lang, profile: Profile, dpr: number): string {
  const text = FONTLAB_TEXT[lang];
  const sizes = SIZE_TOKENS.map(token => `${token}: ${settings.sizes[token]}px`);
  const groups = GROUPS.map(id => {
    const group = settings.groups[id];
    const face = group.font === 'mono' ? `mono ${group.weight}` : 'pixel';
    return `${text.groupNames[id]}: ${face}${group.upper ? ' ' + text.upper : ''}`;
  });
  return `[${text.profileNames[profile]}, DPR ${formatDpr(dpr)}] ${[...sizes, ...groups].join('; ')}`;
}

/** "3", "2", "1.5": devicePixelRatio for people, not floats. */
export const formatDpr = (dpr: number): string => String(Math.round(dpr * 100) / 100);

/** localStorage keys, one per profile; separate from the save (dark-counter-v3). The phone keeps the PR #11 key. */
export const FONTLAB_KEY = 'dark-counter-fontlab';
export const FONTLAB_KEYS: Readonly<Record<Profile, string>> = {
  phone: FONTLAB_KEY,
  desktop: `${FONTLAB_KEY}-desktop`,
};

/* =====================================================================
   Applying to the page
   ===================================================================== */

/** Writes the settings onto <html>: sizes as CSS variables, groups as data-fl-* attributes. */
export function applySettings(settings: FontLabSettings, profile: Profile, root: HTMLElement = document.documentElement): void {
  for (const token of SIZE_TOKENS) {
    // equal to the profile in style.css → no inline value, the stylesheet decides
    if (settings.sizes[token] === PROFILE_SIZES[profile][token]) {
      root.style.removeProperty(token);
    } else {
      root.style.setProperty(token, `${settings.sizes[token]}px`);
    }
  }
  for (const id of GROUPS) {
    const group = settings.groups[id];
    setAttr(root, `data-fl-${id}`, group.font === 'mono' ? 'mono' : null);
    setAttr(root, `data-fl-${id}-case`, group.upper ? 'upper' : null);
    if (group.font === 'mono' && group.weight !== 400) {
      root.style.setProperty(`--fl-${id}-weight`, String(group.weight));
    } else {
      root.style.removeProperty(`--fl-${id}-weight`);
    }
  }
}

function setAttr(root: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    root.removeAttribute(name);
  } else {
    root.setAttribute(name, value);
  }
}

/** The profile style.css is using right now (the same media query). */
const desktopMedia = (): MediaQueryList | null => typeof matchMedia === 'function' ? matchMedia(DESKTOP_QUERY) : null;
const currentProfile = (): Profile => desktopMedia()?.matches ? 'desktop' : 'phone';
const currentDpr = (): number => window.devicePixelRatio || 1;

function loadSettings(profile: Profile): FontLabSettings {
  try {
    const raw = localStorage.getItem(FONTLAB_KEYS[profile]);
    return sanitize(raw ? JSON.parse(raw) : null, profile);
  } catch {
    return defaultSettings(profile);
  }
}

function storeSettings(settings: FontLabSettings, profile: Profile): void {
  try {
    if (isDefault(settings, profile)) {
      localStorage.removeItem(FONTLAB_KEYS[profile]);
    } else {
      localStorage.setItem(FONTLAB_KEYS[profile], JSON.stringify(settings));
    }
  } catch {
    // private mode / storage full: settings simply do not persist
  }
}

/**
 * Called once at startup, before the first render, so stored sizes apply without a jump.
 * When the window crosses DESKTOP_QUERY (resize, rotation), the other profile's settings apply.
 */
export function applyStoredFontLab(): void {
  const applyCurrent = (): void => {
    profile = currentProfile();
    settings = loadSettings(profile);
    applySettings(settings, profile);
    if (maybeById(SHEET_ID)) {
      render();
    }
  };
  applyCurrent();
  desktopMedia()?.addEventListener('change', applyCurrent);
}

/* =====================================================================
   Measuring what the phone actually draws
   ===================================================================== */

/** Advance width of one glyph in em: IBM Plex Mono 0.6, Public Pixel 1. */
const advanceEm = (element: Element): number => getComputedStyle(element).fontFamily.includes('Public Pixel') ? 1 : 0.6;

/**
 * "12px / 12.0" — the CSS size and the size the glyphs are really drawn at,
 * from the width of the first characters. They differ when iOS text autosizing
 * (text-size-adjust) inflates the text.
 */
function measure(element: Element | null): string {
  const textNode = element ? [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length >= 8) : null;
  if (!element || !textNode) {
    return 'n/a';
  }
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 8);
  const width = range.getBoundingClientRect().width;
  const parent = textNode.parentElement ?? element;
  return `${getComputedStyle(parent).fontSize} / ${(width / 8 / advanceEm(parent)).toFixed(1)}`;
}

/* =====================================================================
   The sheet
   ===================================================================== */

const SHEET_ID = 'fontlab';
const detectLang = (): Lang => typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';

let profile: Profile = 'phone';
let settings: FontLabSettings = defaultSettings();

function sizeRow(token: SizeToken, text: typeof FONTLAB_TEXT[Lang]): string {
  const size = settings.sizes[token];
  // pixel font: sharp or soft on this screen (whole device pixels per font pixel)
  // (an empty cell on mono rows keeps the −/+ columns aligned)
  const sharpness = `<small>${isPixelToken(token) ? (isCrisp(size, currentDpr()) ? text.crisp : text.soft) : ''}</small>`;
  return `<div class="fl-row"><span>${text.sizeNames[token]}</span>
    <button class="btn" data-fl="size" data-token="${token}" data-dir="-1">−</button>
    <b>${size}</b>
    <button class="btn" data-fl="size" data-token="${token}" data-dir="1">+</button>${sharpness}</div>`;
}

function choice(label: string, on: boolean, attrs: string): string {
  return `<button class="btn ${on ? 'fl-on' : ''}" ${attrs}>${label}</button>`;
}

function groupRow(id: GroupId, text: typeof FONTLAB_TEXT[Lang]): string {
  const group = settings.groups[id];
  const weights = WEIGHTS.map(weight => choice(String(weight), group.font === 'mono' && group.weight === weight,
    `data-fl="weight" data-group="${id}" data-v="${weight}" ${group.font === 'mono' ? '' : 'disabled'}`)).join('');
  return `<div class="fl-row fl-group"><span>${text.groupNames[id]}</span>
    ${choice(text.pixel, group.font === 'pixel', `data-fl="font" data-group="${id}" data-v="pixel"`)}
    ${choice(text.mono, group.font === 'mono', `data-fl="font" data-group="${id}" data-v="mono"`)}
    ${weights}
    ${choice(text.upperShort, group.upper, `data-fl="upper" data-group="${id}"`)}</div>`;
}

function render(): void {
  const sheet = maybeById(SHEET_ID);
  if (!sheet) {
    return;
  }
  const text = FONTLAB_TEXT[detectLang()];
  sheet.innerHTML = `<div class="fl-head"><h2>${text.title}</h2>
      <button class="btn" data-fl="reset">${text.reset}</button>
      <button class="btn pri" data-fl="copy">${text.copy}</button>
      <button class="btn" data-fl="close">${text.close}</button></div>
    <div class="fl-measure">${text.measured}: ${text.ticker} ${measure(maybeById('ticker'))} · ${text.pane} ${measure(document.querySelector('#pane .hint, #pane .rows span'))}</div>
    <div class="fl-measure">${text.profile}: <b>${text.profileNames[profile]}</b> · DPR ${formatDpr(currentDpr())} — ${text.profileHint}</div>
    <div class="fl-msg" id="${SHEET_ID}-msg"></div>
    <h3>${text.sizes}</h3>${SIZE_TOKENS.map(token => sizeRow(token, text)).join('')}
    <h3>${text.groups}</h3>${GROUPS.map(id => groupRow(id, text)).join('')}`;
}

function update(change: () => void): void {
  change();
  applySettings(settings, profile);
  storeSettings(settings, profile);
  // measure after the browser has laid out the new sizes
  requestAnimationFrame(render);
}

function copySettings(): void {
  const text = FONTLAB_TEXT[detectLang()];
  const result = formatSettings(settings, detectLang(), profile, currentDpr());
  const message = maybeById(`${SHEET_ID}-msg`);
  const showManual = () => {
    if (message) {
      message.textContent = result;
      const range = document.createRange();
      range.selectNodeContents(message);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  };
  try {
    navigator.clipboard.writeText(result).then(() => {
      if (message) {
        message.textContent = `${text.copied} ${result}`;
      }
    }, showManual);
  } catch {
    showManual();
  }
}

const isSizeToken = (value: string | undefined): value is SizeToken => (SIZE_TOKENS as string[]).includes(value ?? '');
const isGroup = (value: string | undefined): value is GroupId => (GROUPS as string[]).includes(value ?? '');

function onSheetClick(event: MouseEvent): void {
  const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-fl]') : null;
  if (!button || (button instanceof HTMLButtonElement && button.disabled)) {
    return;
  }
  const { fl, token, dir, group, v } = button.dataset;
  if (fl === 'size' && isSizeToken(token)) {
    update(() => { settings.sizes[token] = stepSize(token, settings.sizes[token], dir === '1' ? 1 : -1); });
  } else if (fl === 'font' && isGroup(group)) {
    update(() => { settings.groups[group].font = v === 'mono' ? 'mono' : 'pixel'; });
  } else if (fl === 'weight' && isGroup(group)) {
    update(() => { settings.groups[group].weight = Number(v) as MonoWeight; });
  } else if (fl === 'upper' && isGroup(group)) {
    update(() => { settings.groups[group].upper = !settings.groups[group].upper; });
  } else if (fl === 'reset') {
    update(() => { settings = defaultSettings(profile); });
  } else if (fl === 'copy') {
    copySettings();
  } else if (fl === 'close') {
    maybeById(SHEET_ID)?.remove();
  }
}

/** Opens the sheet (called from the diagnostics overlay). */
export function openFontLab(): void {
  profile = currentProfile();
  settings = loadSettings(profile);
  if (!maybeById(SHEET_ID)) {
    const sheet = document.createElement('div');
    sheet.id = SHEET_ID;
    sheet.className = 'fontlab';
    sheet.addEventListener('click', onSheetClick);
    document.body.appendChild(sheet);
  }
  render();
}
