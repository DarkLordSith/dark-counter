// =====================================================================
//  diag.ts — hidden diagnostics overlay for the iOS PWA top inset bug.
//  Long press (600 ms) on the version label in the "сейв" modal toggles
//  an overlay with viewport / safe-area measurements and a copy button.
//  Debug tool only: reads the DOM, never touches the save or gameplay.
// =====================================================================
import { byId, IOS_PWA_CLASS, maybeById } from './dom';
import { VERSION_LABEL } from './version';

/* =====================================================================
   Texts (RU / EN). Kept in one object for the future i18n dictionary.
   ===================================================================== */

export type Lang = 'ru' | 'en';

export const DIAG_TEXT = {
  ru: {
    title: 'Диагностика',
    copy: 'Скопировать',
    close: 'Закрыть',
    copied: 'Скопировано.',
    selectManually: 'Текст выделен, скопируйте вручную.',
    hint: 'Долгий тап по версии — открыть или закрыть.',
  },
  en: {
    title: 'Diagnostics',
    copy: 'Copy',
    close: 'Close',
    copied: 'Copied.',
    selectManually: 'Text selected, copy it manually.',
    hint: 'Long press the version to open or close.',
  },
} as const satisfies Record<Lang, Record<string, string>>;

export function detectLang(language: string | undefined): Lang {
  return language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

/* =====================================================================
   Measurements
   ===================================================================== */

export interface ViewportMetrics {
  version: string;
  /** navigator.standalone (iOS only; undefined elsewhere). */
  standalone: boolean | undefined;
  displayModeStandalone: boolean;
  statusBarStyle: string | null;
  /** Measured env(safe-area-inset-*) in CSS px. */
  insetTop: number;
  insetBottom: number;
  insetLeft: number;
  insetRight: number;
  /** Computed padding-top of <html> (it carries env(safe-area-inset-top)). */
  rootPaddingTop: number;
  /** html.ios-pwa is set, so the "station ceiling" strip is shown. */
  ceilingApplied: boolean;
  /** Value of the --pwa-ceiling token (the strip height). */
  ceilingVar: string;
  /** Final position of the HUD on screen, after the inset and the ceiling. */
  hudTop: number | null;
  /** Bottom edge of the game; equal to innerHeight − inset-bottom when nothing is cut off. */
  appBottom: number | null;
  innerHeight: number;
  innerWidth: number;
  screenHeight: number;
  screenWidth: number;
  visualViewportHeight: number | null;
  visualViewportOffsetTop: number | null;
  devicePixelRatio: number;
  userAgent: string;
}

const PROBE_SIDES = ['top', 'bottom', 'left', 'right'] as const;
type ProbeSide = typeof PROBE_SIDES[number];

/** env() cannot be read from JS directly: size a hidden div with it and measure. */
function measureSafeAreaInsets(): Record<ProbeSide, number> {
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.top = '0';
  probe.style.left = '0';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const side of PROBE_SIDES) {
    probe.style.width = '0';
    probe.style.height = `env(safe-area-inset-${side}, 0px)`;
    insets[side] = probe.getBoundingClientRect().height;
  }
  probe.remove();
  return insets;
}

function measureViewport(): ViewportMetrics {
  const insets = measureSafeAreaInsets();
  const navigatorWithStandalone: Navigator & { standalone?: boolean } = navigator;
  const statusBarMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
  const hud = maybeById('hud');
  const app = maybeById('app');
  const viewport = window.visualViewport;
  return {
    version: VERSION_LABEL,
    standalone: navigatorWithStandalone.standalone,
    displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
    statusBarStyle: statusBarMeta?.content ?? null,
    insetTop: insets.top,
    insetBottom: insets.bottom,
    insetLeft: insets.left,
    insetRight: insets.right,
    rootPaddingTop: parseFloat(getComputedStyle(document.documentElement).paddingTop),
    ceilingApplied: document.documentElement.classList.contains(IOS_PWA_CLASS),
    ceilingVar: getComputedStyle(document.documentElement).getPropertyValue('--pwa-ceiling').trim(),
    hudTop: hud ? hud.getBoundingClientRect().top : null,
    appBottom: app ? app.getBoundingClientRect().bottom : null,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    screenHeight: screen.height,
    screenWidth: screen.width,
    visualViewportHeight: viewport ? viewport.height : null,
    visualViewportOffsetTop: viewport ? viewport.offsetTop : null,
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
  };
}

/* =====================================================================
   Report (pure: metrics → text)
   ===================================================================== */

const px = (value: number | null): string => value === null ? 'n/a' : `${Math.round(value * 100) / 100}px`;
const flag = (value: boolean | undefined): string => value === undefined ? 'n/a' : String(value);

/** Plain-text report; the same text is shown and copied. Keys stay in English for bug reports. */
export function formatReport(metrics: ViewportMetrics): string {
  const lines = [
    `version: ${metrics.version}`,
    `navigator.standalone: ${flag(metrics.standalone)}`,
    `display-mode standalone: ${flag(metrics.displayModeStandalone)}`,
    `status-bar-style meta: ${metrics.statusBarStyle ?? 'n/a'}`,
    `safe-area-inset-top: ${px(metrics.insetTop)}`,
    `safe-area-inset-bottom: ${px(metrics.insetBottom)}`,
    `safe-area-inset-left/right: ${px(metrics.insetLeft)} / ${px(metrics.insetRight)}`,
    `html padding-top: ${px(metrics.rootPaddingTop)}`,
    `ceiling (html.ios-pwa): ${metrics.ceilingApplied ? 'yes' : 'no'}`,
    `--pwa-ceiling: ${metrics.ceilingVar || 'n/a'}`,
    `hud top: ${px(metrics.hudTop)}`,
    `app bottom: ${px(metrics.appBottom)}`,
    `innerWidth × innerHeight: ${metrics.innerWidth} × ${metrics.innerHeight}`,
    `screen.width × height: ${metrics.screenWidth} × ${metrics.screenHeight}`,
    `screen.height − innerHeight: ${metrics.screenHeight - metrics.innerHeight}`,
    `visualViewport.height: ${px(metrics.visualViewportHeight)}`,
    `visualViewport.offsetTop: ${px(metrics.visualViewportOffsetTop)}`,
    `devicePixelRatio: ${metrics.devicePixelRatio}`,
    `UA: ${metrics.userAgent}`,
  ];
  return lines.join('\n');
}

/* =====================================================================
   Overlay
   ===================================================================== */

const LONG_PRESS_MS = 600;
/** A finger that moves farther than this is scrolling, not pressing. */
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const OVERLAY_ID = 'diag';
/** The overlay may cover the label, so a long press on its title closes it too. */
const TRIGGER_SELECTOR = '.version, .diag h2';

const text = DIAG_TEXT[detectLang(typeof navigator === 'undefined' ? undefined : navigator.language)];

function isOverlayOpen(): boolean {
  return maybeById(OVERLAY_ID) !== null;
}

function refreshReport(): void {
  const report = maybeById(`${OVERLAY_ID}-report`);
  if (report) {
    report.textContent = formatReport(measureViewport());
  }
}

function openOverlay(): void {
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'diag';
  overlay.innerHTML = `<h2>${text.title}</h2>
    <pre id="${OVERLAY_ID}-report"></pre>
    <div class="mbtns">
      <button class="btn pri" data-diag="copy">${text.copy}</button>
      <button class="btn" data-diag="close">${text.close}</button>
    </div>
    <div class="hint" id="${OVERLAY_ID}-msg">${text.hint}</div>`;
  document.body.appendChild(overlay);
  refreshReport();
}

function closeOverlay(): void {
  maybeById(OVERLAY_ID)?.remove();
}

function toggleOverlay(): void {
  if (isOverlayOpen()) {
    closeOverlay();
  } else {
    openOverlay();
  }
}

function copyReport(): void {
  const report = byId(`${OVERLAY_ID}-report`);
  const message = byId(`${OVERLAY_ID}-msg`);
  const selectForManualCopy = () => {
    const range = document.createRange();
    range.selectNodeContents(report);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    message.textContent = text.selectManually;
  };
  try {
    navigator.clipboard.writeText(report.textContent ?? '').then(() => {
      message.textContent = text.copied;
    }, selectForManualCopy);
  } catch (err) {
    selectForManualCopy();
  }
}

/** Overlay buttons use data-diag, not data-a: they must not trigger a game re-render. */
function onOverlayClick(event: MouseEvent): void {
  const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-diag]') : null;
  if (button?.dataset.diag === 'copy') {
    copyReport();
  }
  if (button?.dataset.diag === 'close') {
    closeOverlay();
  }
}

/** Long press on the version label (it lives in the modal, which is re-rendered, so delegate). */
function bindLongPress(onLongPress: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  document.addEventListener('pointerdown', event => {
    const onTrigger = event.target instanceof Element && event.target.closest(TRIGGER_SELECTOR);
    if (!onTrigger) {
      return;
    }
    startX = event.clientX;
    startY = event.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      onLongPress();
    }, LONG_PRESS_MS);
  });
  document.addEventListener('pointermove', event => {
    const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (moved > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancel();
    }
  });
  document.addEventListener('pointerup', cancel);
  document.addEventListener('pointercancel', cancel);
  // iOS shows its own callout on long press; suppress it on the label.
  document.addEventListener('contextmenu', event => {
    if (event.target instanceof Element && event.target.closest(TRIGGER_SELECTOR)) {
      event.preventDefault();
    }
  });
}

export function bindDiagnostics(): void {
  bindLongPress(toggleOverlay);
  document.addEventListener('click', onOverlayClick);
  // Numbers change when the keyboard opens or the phone rotates.
  window.addEventListener('resize', refreshReport);
  window.visualViewport?.addEventListener('resize', refreshReport);
  window.visualViewport?.addEventListener('scroll', refreshReport);
}
