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
import { deskWindowPlacement } from './layout';
import type { Box } from './layout';

export type { Box } from './layout';

export type WindowView = 'float' | 'sheet';

/** Why a window closed. 'replaced': another window opened over it. */
export type CloseReason = 'close' | 'outside' | 'escape' | 'replaced' | 'code';

export interface WindowSpec {
  /** Which window it is ('morning', 'bench'); remembered as the last one. */
  id: string;
  title: string;
  /** HTML of the content. */
  body: string;
  /** HTML of the buttons row (data-a buttons), may be empty. */
  buttons?: string;
  /**
   * Sheet only: may rise over the scene when the room under it is too small (the bench, V2.3:
   * it shows the customer at the counter itself). Without it the sheet stops at the scene.
   */
  cover?: boolean;
  /**
   * false: a window that does not block the game (the Mac layout, V2.4: the stock, the counter, the bench):
   * no backdrop, the scene, the action bar and the HUD keep working under it; ✕ and Esc close it.
   * Default true: a tap past it closes it, Tab stays inside.
   */
  modal?: boolean;
  /**
   * A modal window over which the action bar stays live (the morning, task 29): a tap past the window
   * on the bar's button hides the window and presses the button (one tap, not two).
   */
  liveBar?: boolean;
  onClose?: (reason: CloseReason) => void;
}

/** Media query of a finger: such screens get the sheet. */
export const COARSE_QUERY = '(pointer: coarse)';

export const viewFor = (coarse: boolean): WindowView => (coarse ? 'sheet' : 'float');

/** Draws the windows the manager opens (the DOM in the game, a fake in tests). */
export interface WindowSurface {
  show(spec: WindowSpec, view: WindowView): void;
  /** New content of the open window, in place: no open animation, the focus stays on the same button. */
  update(spec: WindowSpec, view: WindowView): void;
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

  /**
   * Redraws the open window with new content (after a repair, a sale…) without closing it.
   * Only the same window: returns false when `spec.id` is not the one open.
   */
  update(spec: WindowSpec): boolean {
    if (!this.current || this.current.id !== spec.id) {
      return false;
    }
    this.current = spec;
    this.surface.update(spec, this.view);
    return true;
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
/** The spec on screen: place() reads its `cover`. */
let shown: WindowSpec | null = null;
/** A covering sheet stops this far below the top of the scene (the safe area and the iOS ceiling are above it). */
const COVER_TOP = 8;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The Mac layout (V2.4): ui.ts sets html.desk, the scene is the whole browser window. */
const isDesk = (): boolean => document.documentElement.classList.contains('desk');

/** Where the overlay over the bottom of the scene begins: the top of the action bar row and the HUD. */
function deskFloor(): number {
  const tops = ['hud', 'actionbar', 'ticker'].map(id => byId(id).getBoundingClientRect()).filter(rect => rect.height > 0).map(rect => rect.top);
  return tops.length ? Math.min(...tops) : window.innerHeight;
}

function place(view: WindowView): void {
  const win = byId('win');
  if (view === 'float' && isDesk()) {
    // V2.4: inside the scene, below the sign, above the action bar; at its right or left edge
    const spot = deskWindowPlacement(byId('stage').getBoundingClientRect(), deskFloor());
    win.classList.remove('win-sheet');
    win.classList.add('win-float');
    win.dataset.view = view;
    win.dataset.side = spot.side;
    win.style.left = `${spot.left}px`;
    win.style.width = `${spot.width}px`;
    win.style.top = `${spot.top}px`;
    win.style.bottom = '';
    win.style.maxHeight = `${spot.height}px`;
    return;
  }
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
    const ceiling = shown?.cover ? stage.top + COVER_TOP : stage.bottom;
    win.style.maxHeight = `${Math.max(0, Math.round(bar.top - ceiling))}px`;
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

function fill(spec: WindowSpec): void {
  shown = spec;
  const win = byId('win');
  // the bot of the parity stand and the CSS tell the windows apart by it
  win.dataset.id = spec.id;
  win.setAttribute('aria-modal', String(spec.modal !== false));
  byId('winback').hidden = spec.modal === false;
  byId('wintitle').innerHTML = spec.title;
  byId('winbody').innerHTML = spec.body;
  const buttons = byId('winbtns');
  buttons.innerHTML = spec.buttons ?? '';
  buttons.hidden = !spec.buttons;
}

/** A selector that finds "the same" button in the new content: by its data-a and data-v. */
function sameButton(element: Element | null): string | null {
  if (!(element instanceof HTMLElement) || !element.dataset.a) {
    return null;
  }
  const value = element.dataset.v;
  return `[data-a="${CSS.escape(element.dataset.a)}"]${value === undefined ? ':not([data-v])' : `[data-v="${CSS.escape(value)}"]`}`;
}

const domSurface: WindowSurface = {
  show(spec, view) {
    const win = byId('win');
    fill(spec);
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    place(view);
    win.hidden = false;
    // the open animation starts from the state without .win-on (CSS, ≤ 200 ms, off with reduced motion)
    win.classList.remove('win-on');
    void win.offsetWidth;
    win.classList.add('win-on');
    (win.querySelector<HTMLElement>(`#winbtns ${FOCUSABLE}`) ?? win).focus({ preventScroll: true });
  },
  update(spec, view) {
    const win = byId('win');
    const hadFocus = win.contains(document.activeElement);
    const focused = hadFocus ? sameButton(document.activeElement) : null;
    const scroll = win.scrollTop;
    fill(spec);
    place(view);
    win.scrollTop = scroll;
    if (hadFocus) {
      // the button pressed is redrawn: focus its new copy (or the first one when it is gone or off)
      const again = focused ? win.querySelector<HTMLElement>(focused) : null;
      const target = again && !(again instanceof HTMLButtonElement && again.disabled) ? again : win.querySelector<HTMLElement>(FOCUSABLE) ?? win;
      target.focus({ preventScroll: true });
    }
  },
  hide() {
    const win = byId('win');
    win.hidden = true;
    win.classList.remove('win-on');
    shown = null;
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

/** The action bar button under the backdrop at this point, if any (liveBar). */
function barButtonAt(x: number, y: number): HTMLElement | null {
  const back = byId('winback');
  back.hidden = true;
  const under = document.elementFromPoint(x, y);
  back.hidden = false;
  return under instanceof Element ? under.closest<HTMLElement>('#actionbar [data-a]') : null;
}

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
  byId('winback').addEventListener('click', event => {
    const through = manager?.current?.liveBar ? barButtonAt(event.clientX, event.clientY) : null;
    manager?.outside();
    if (through?.isConnected) {
      through.click();
    }
  });
  document.addEventListener('keydown', event => {
    if (!manager?.isOpen()) {
      return;
    }
    if (manager.key(event.key)) {
      event.preventDefault();
    } else if (event.key === 'Tab' && manager.current?.modal !== false) {
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

/** Places the open window again (the scene was resized). */
export const relayoutWindow = (): void => {
  if (manager?.isOpen()) {
    place(manager.view);
  }
};
/** Opens a window (closes the one open before). */
export const openWindow = (spec: WindowSpec): void => windows().open(spec);
/** New content for the open window `spec.id`, in place; returns false (nothing drawn) if it is not open. */
export const updateWindow = (spec: WindowSpec): boolean => manager?.update(spec) ?? false;
/** Closes the open window; returns whether one was open. */
export const closeWindow = (reason: CloseReason = 'code'): boolean => windows().close(reason);
export const isWindowOpen = (id?: string): boolean => manager?.isOpen(id) ?? false;
/** The last window opened in this session (V2.3: reopen the stock or the bench). */
export const lastWindow = (): string | null => manager?.last ?? null;
