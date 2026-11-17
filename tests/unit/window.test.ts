// Window component (V2.2): one window at a time, closing by ✕ / a tap past it / Esc,
// the last window of the session, the view by the pointer and the place of the mini window.
import { describe, expect, it } from 'vitest';
import { CUSTOMER_ZONE } from '../../src/data';
import { COARSE_QUERY, FLOAT_MARGIN, FLOAT_WIDTH, floatPlacement, viewFor, WindowManager } from '../../src/window';
import type { CloseReason, WindowSpec, WindowSurface, WindowView } from '../../src/window';
import uiTs from '../../src/ui.ts?raw';
import indexHtml from '../../index.html?raw';
import styleCss from '../../src/style.css?raw';

/** A surface that writes down what it was asked to draw. */
function fakeSurface(): WindowSurface & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    show: (spec, view) => calls.push(`show ${spec.id} ${view}`),
    hide: () => calls.push('hide'),
    setView: view => calls.push(`view ${view}`),
  };
}

function spec(id: string, closed: CloseReason[] = []): WindowSpec {
  return { id, title: id, body: '', onClose: reason => closed.push(reason) };
}

describe('the window manager', () => {
  it('keeps one window open: a new one closes the old one', () => {
    const surface = fakeSurface();
    const windows = new WindowManager(surface, 'sheet');
    const closed: CloseReason[] = [];
    windows.open(spec('morning', closed));
    windows.open(spec('stock'));
    expect(windows.isOpen('stock')).toBe(true);
    expect(windows.isOpen('morning')).toBe(false);
    expect(closed).toEqual(['replaced']);
    expect(surface.calls).toEqual(['show morning sheet', 'hide', 'show stock sheet']);
  });

  it('closes by ✕, by a tap past the window and by Esc', () => {
    const windows = new WindowManager(fakeSurface(), 'float');
    const closed: CloseReason[] = [];
    windows.open(spec('a', closed));
    expect(windows.close('close')).toBe(true);
    windows.open(spec('b', closed));
    expect(windows.outside()).toBe(true);
    windows.open(spec('c', closed));
    expect(windows.key('Enter')).toBe(false);
    expect(windows.isOpen()).toBe(true);
    expect(windows.key('Escape')).toBe(true);
    expect(closed).toEqual(['close', 'outside', 'escape']);
    expect(windows.isOpen()).toBe(false);
  });

  it('with nothing open, Esc and a tap do nothing', () => {
    const surface = fakeSurface();
    const windows = new WindowManager(surface, 'float');
    expect(windows.key('Escape')).toBe(false);
    expect(windows.outside()).toBe(false);
    expect(surface.calls).toEqual([]);
  });

  it('remembers the last window opened in the session, after it closes too', () => {
    const windows = new WindowManager(fakeSurface(), 'sheet');
    expect(windows.last).toBeNull();
    windows.open(spec('morning'));
    windows.open(spec('bench'));
    windows.close();
    expect(windows.last).toBe('bench');
  });

  it('the remembered window is not in the save or the profile (only in memory)', () => {
    const source = Object.values(import.meta.glob<string>('../../src/window.ts', { query: '?raw', import: 'default', eager: true }))[0];
    expect(source).not.toMatch(/localStorage|sessionStorage|saveGame|saveProfile/);
  });

  it('switches the view live, redrawing an open window', () => {
    const surface = fakeSurface();
    const windows = new WindowManager(surface, 'float');
    windows.setView('sheet'); // nothing open: just remembered
    windows.open(spec('morning'));
    windows.setView('float');
    windows.setView('float'); // the same view: nothing to do
    expect(surface.calls).toEqual(['show morning sheet', 'view float']);
  });
});

describe('the view follows the pointer', () => {
  it('a finger gets the sheet, a mouse the mini window', () => {
    expect(COARSE_QUERY).toBe('(pointer: coarse)');
    expect(viewFor(true)).toBe<WindowView>('sheet');
    expect(viewFor(false)).toBe<WindowView>('float');
  });
});

describe('the mini window keeps clear of the customer', () => {
  /** Mac 1440×900: the #app column is 760 wide, the scene 576×360 in its middle. */
  const stage = { left: 432, top: 0, width: 576, height: 360 };
  const zone = (s: typeof stage) => [s.left + CUSTOMER_ZONE.left * s.width / 160, s.left + CUSTOMER_ZONE.right * s.width / 160];

  it('goes to the right of the customer zone when there is room', () => {
    const spot = floatPlacement(stage, { width: 1440, height: 900 });
    expect(spot.side).toBe('right');
    expect(spot.left).toBeGreaterThanOrEqual(zone(stage)[1]);
    expect(spot.left + FLOAT_WIDTH).toBeLessThanOrEqual(1440 - FLOAT_MARGIN);
    expect(spot.top).toBe(FLOAT_MARGIN);
    expect(spot.maxHeight).toBe(900 - 2 * FLOAT_MARGIN);
  });

  it('else to the left of it', () => {
    const shifted = { ...stage, left: 700 };
    const spot = floatPlacement(shifted, { width: 1300, height: 900 });
    expect(spot.side).toBe('left');
    expect(spot.left + FLOAT_WIDTH).toBeLessThanOrEqual(zone(shifted)[0]);
  });

  it('on a narrow screen over the scene, inside the screen', () => {
    const narrow = { left: 0, top: 0, width: 500, height: 312 };
    const spot = floatPlacement(narrow, { width: 500, height: 800 });
    expect(spot.side).toBe('over');
    expect(spot.left).toBeGreaterThanOrEqual(FLOAT_MARGIN);
  });
});

describe('the morning window is on the component', () => {
  it('opens with openWindow, the same texts', () => {
    const report = uiTs.match(/function showMorningReport[\s\S]*?\n}/)?.[0] ?? '';
    expect(report).toContain('showWindow({');
    expect(uiTs).toMatch(/function showWindow[\s\S]*?openWindow\(spec\)/);
    expect(report).toContain("id: 'morning'");
    expect(report).toContain('DAY_UI.morningTitle');
    expect(report).toContain('data-a="close">${DAY_UI.openShop}');
    expect(report).not.toContain('openModal(');
  });

  it('the markup is a dialog: role, aria-modal, a title, a close button', () => {
    expect(indexHtml).toMatch(/<section class="win" id="win" role="dialog" aria-modal="true" aria-labelledby="wintitle"/);
    expect(indexHtml).toContain('id="winx"');
  });

  it('the animation is short and off with reduced motion', () => {
    const transitions = [...styleCss.matchAll(/\.win \{[^}]*transition: ([^;]+);/g)].map(m => m[1]).filter(t => t !== 'none');
    expect(transitions.length).toBe(1);
    for (const ms of transitions[0].match(/\d+ms/g) ?? []) {
      expect(parseInt(ms, 10)).toBeLessThanOrEqual(200);
    }
    expect(styleCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.win \{\s*transition: none;/);
  });
});
