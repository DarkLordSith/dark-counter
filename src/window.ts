// =====================================================================
//  window.ts — the window component (V2.2): one API, two views.
//  - "float" (mouse, Mac): a mini window over the scene, at its side,
//    clear of the customer at the counter;
//  - "sheet" (finger, phone): a sheet from the bottom, right above the
//    action bar; the action bar and the HUD stay where they are.
//  The view follows matchMedia('(pointer: coarse)') and changes live.
//  One window at a time; ✕, a tap past it or Esc closes it.
//
//  The manager (WindowManager), the choice of view and the placement are
//  pure and tested in node; the DOM part (initWindows) only draws them.
//  The content is HTML with data-a buttons: ui.ts handles their clicks
//  like everywhere else (its ACTIONS table).
// =====================================================================
import { CUSTOMER_ZONE, WINDOW_TEXT } from './data';
import { byId } from './dom';
import { iconSvg } from './icons';

export type WindowView = 'float' | 'sheet';

/** Why a window closed. 'replaced': another window opened over it. */
export type CloseReason = 'close' | 'outside' | 'escape' | 'replaced' | 'code';

export interface WindowSpec {
  /** Which window it is ('morning'; V2.3: 'stock', 'bench'); remembered as the last one. */
  id: string;
  title: string;
  /** HTML of the content. */
  body: string;
  /** HTML of the buttons row (data-a buttons), may be empty. */
  buttons?: string;
  onClose?: (reason: CloseReason) => void;
}

/** Media query of a finger: such screens get the sheet. */
export const COARSE_QUERY = '(pointer: coarse)';

export const viewFor = (coarse: boolean): WindowView => (coarse ? 'sheet' : 'float');

/** Draws the windows the manager opens (the DOM in the game, a fake in tests). */
export interface WindowSurface {
  show(spec: WindowSpec, view: WindowView): void;
  hide(): void;
  setView(view: WindowView): void;
}

/** One window at a time, the last opened one remembered for this session (not in the save, not in the profile). */
export class WindowManager {
  current: WindowSpec | null = null;
  last: string | null = null;

  constructor(private readonly surface: WindowSurface, public view: WindowView) {}

  open(spec: WindowSpec): void {
    this.close('replaced');
    this.current = spec;
    this.last = spec.id;
    this.surface.show(spec, this.view);
  }

  /** Closes the open window, if any; returns whether one was open. */
  close(reason: CloseReason = 'code'): boolean {
    const spec = this.current;
    if (!spec) {
      return false;
    }
    this.current = null;
    this.surface.hide();
    spec.onClose?.(reason);
    return true;
  }

  isOpen(id?: string): boolean {
    return this.current !== null && (id === undefined || this.current.id === id);
  }

  /** A key press; Esc closes the window. Returns whether the key was used. */
  key(key: string): boolean {
    return key === 'Escape' && this.close('escape');
  }

  /** A tap or a click past the window. */
  outside(): boolean {
    return this.close('outside');
  }

  setView(view: WindowView): void {
    if (view === this.view) {
      return;
    }
    this.view = view;
    if (this.current) {
      this.surface.setView(view);
    }
  }
}

/* ---------- placement of the float window ---------- */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FloatPlace {
  left: number;
  top: number;
  maxHeight: number;
  /** 'right' / 'left' of the customer, or 'over' when the screen is too narrow for either. */
  side: 'right' | 'left' | 'over';
}

/** Scene width in logical pixels (the customer zone is given in them). */
const SCENE_WIDTH = 160;
export const FLOAT_WIDTH = 340;
export const FLOAT_MARGIN = 12;

/**
 * Where the float window goes: to the right of the customer zone (the speech bubble is on the left),
 * else to the left of it, else over the scene at the right edge of the screen.
 */
export function floatPlacement(stage: Box, viewport: { width: number; height: number }, width = FLOAT_WIDTH, margin = FLOAT_MARGIN): FloatPlace {
  const scale = stage.width / SCENE_WIDTH;
  const zoneLeft = stage.left + CUSTOMER_ZONE.left * scale;
  const zoneRight = stage.left + CUSTOMER_ZONE.right * scale;
  const top = Math.max(margin, Math.round(stage.top + margin));
  const maxHeight = Math.max(0, viewport.height - top - margin);
  const right = Math.round(zoneRight + margin);
  if (right + width <= viewport.width - margin) {
    return { left: right, top, maxHeight, side: 'right' };
  }
  const left = Math.round(zoneLeft - margin - width);
  if (left >= margin) {
    return { left, top, maxHeight, side: 'left' };
  }
  return { left: Math.max(margin, viewport.width - margin - width), top, maxHeight, side: 'over' };
}

/* ---------- the DOM ---------- */

const TEXT = WINDOW_TEXT.ru;
let manager: WindowManager | null = null;
let returnFocus: HTMLElement | null = null;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function place(view: WindowView): void {
  const win = byId('win');
  win.classList.toggle('win-sheet', view === 'sheet');
  win.classList.toggle('win-float', view === 'float');
  win.dataset.view = view;
  if (view === 'sheet') {
    // right above the action bar, below the scene: the customer and the bar stay visible
    const bar = byId('actionbar').getBoundingClientRect();
    const stage = byId('stage').getBoundingClientRect();
    const app = byId('app').getBoundingClientRect();
    win.style.left = `${Math.round(app.left)}px`;
    win.style.width = `${Math.round(app.width)}px`;
    win.style.top = '';
    win.style.bottom = `${Math.round(window.innerHeight - bar.top)}px`;
    win.style.maxHeight = `${Math.max(0, Math.round(bar.top - stage.bottom))}px`;
    return;
  }
  const spot = floatPlacement(byId('stage').getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
  win.dataset.side = spot.side;
  win.style.left = `${spot.left}px`;
  win.style.width = `${Math.min(FLOAT_WIDTH, window.innerWidth - 2 * FLOAT_MARGIN)}px`;
  win.style.top = `${spot.top}px`;
  win.style.bottom = '';
  win.style.maxHeight = `${spot.maxHeight}px`;
}

const domSurface: WindowSurface = {
  show(spec, view) {
    const win = byId('win');
    byId('wintitle').innerHTML = spec.title;
    byId('winbody').innerHTML = spec.body;
    const buttons = byId('winbtns');
    buttons.innerHTML = spec.buttons ?? '';
    buttons.hidden = !spec.buttons;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    place(view);
    byId('winback').hidden = false;
    win.hidden = false;
    // the open animation starts from the state without .win-on (CSS, ≤ 200 ms, off with reduced motion)
    win.classList.remove('win-on');
    void win.offsetWidth;
    win.classList.add('win-on');
    (win.querySelector<HTMLElement>(`#winbtns ${FOCUSABLE}`) ?? win).focus({ preventScroll: true });
  },
  hide() {
    const win = byId('win');
    win.hidden = true;
    win.classList.remove('win-on');
    byId('winback').hidden = true;
    // the element that opened the window may be gone after a render (the action bar changes): then its successor
    const back = returnFocus?.isConnected ? returnFocus : byId('actionbar').querySelector<HTMLElement>(FOCUSABLE);
    back?.focus({ preventScroll: true });
    returnFocus = null;
  },
  setView(view) {
    place(view);
  },
};

/** Keeps Tab inside the open window (aria-modal). */
function trapTab(event: KeyboardEvent): void {
  const win = byId('win');
  const items = [...win.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => !item.hidden && item.offsetParent !== null);
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === win)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Builds the frame (title, ✕) and binds Esc, a tap past the window and the view change. Called once at startup. */
export function initWindows(): void {
  const coarse = window.matchMedia(COARSE_QUERY);
  manager = new WindowManager(domSurface, viewFor(coarse.matches));
  const close = byId<HTMLButtonElement>('winx');
  close.innerHTML = iconSvg('close');
  close.setAttribute('aria-label', TEXT.close);
  close.addEventListener('click', () => manager?.close('close'));
  byId('winback').addEventListener('click', () => manager?.outside());
  document.addEventListener('keydown', event => {
    if (!manager?.isOpen()) {
      return;
    }
    if (manager.key(event.key)) {
      event.preventDefault();
    } else if (event.key === 'Tab') {
      trapTab(event);
    }
  });
  coarse.addEventListener('change', event => manager?.setView(viewFor(event.matches)));
  window.addEventListener('resize', () => {
    if (manager?.isOpen()) {
      place(manager.view);
    }
  });
}

function windows(): WindowManager {
  if (!manager) {
    throw new Error('initWindows() was not called');
  }
  return manager;
}

/** Opens a window (closes the one open before). */
export const openWindow = (spec: WindowSpec): void => windows().open(spec);
/** Closes the open window; returns whether one was open. */
export const closeWindow = (reason: CloseReason = 'code'): boolean => windows().close(reason);
export const isWindowOpen = (id?: string): boolean => manager?.isOpen(id) ?? false;
/** The last window opened in this session (V2.3: reopen the stock or the bench). */
export const lastWindow = (): string | null => manager?.last ?? null;
