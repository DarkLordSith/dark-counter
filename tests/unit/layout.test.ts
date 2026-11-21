// Mac layout (V2.4): the scene on the whole browser window at a whole scale, mini windows inside it.
import { describe, expect, it } from 'vitest';
import { CUSTOMER_ZONE, HOTSPOTS, SHOP_SIGN } from '../../src/data';
import { DESK_MARGIN, DESK_QUERY, DESK_WINDOW_WIDE, DESK_WINDOW_WIDTH, deskWindowPlacement, SCENE_H, SCENE_W, stageFit } from '../../src/layout';
import type { Box } from '../../src/layout';
import { DESKTOP_QUERY } from '../../src/fontlab';
import uiTs from '../../src/ui.ts?raw';
import styleCss from '../../src/style.css?raw';

/** Browser windows of a Mac: full screens, a half-screen, a small window, the narrowest desk one. */
const SIZES: [number, number][] = [
  [1440, 900], [1280, 800], [1024, 700], [900, 600], [1512, 982], [1728, 1117], [1920, 1080],
  [1024, 768], [1100, 450], [2560, 1440], [960, 1000], [1440, 600],
];

/** The overlay over the bottom of the scene: the action bar row (56) and the HUD (52). */
const OVERLAY = 56 + 52;

const place = (width: number, height: number) => {
  const stage = stageFit({ width, height });
  return { stage, spot: deskWindowPlacement(stage, stage.top + stage.height - OVERLAY) };
};

const intersects = (a: Box, b: Box): boolean =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/** A rectangle in scene pixels on the screen. */
const onScreen = (stage: Box & { scale: number }, r: { x: number; y: number; w: number; h: number }): Box =>
  ({ left: stage.left + r.x * stage.scale, top: stage.top + r.y * stage.scale, width: r.w * stage.scale, height: r.h * stage.scale });

describe('the scene takes the whole browser window', () => {
  it('at the largest whole scale that fits, centered', () => {
    expect(stageFit({ width: 1440, height: 900 })).toEqual({ scale: 9, width: 1440, height: 900, left: 0, top: 0 });
    expect(stageFit({ width: 1280, height: 800 }).scale).toBe(8);
    expect(stageFit({ width: 1024, height: 700 })).toEqual({ scale: 6, width: 960, height: 600, left: 32, top: 50 });
    expect(stageFit({ width: 900, height: 600 })).toEqual({ scale: 5, width: 800, height: 500, left: 50, top: 50 });
  });

  it.each(SIZES)('%i×%i: a whole scale, 160×100 proportions, inside the window', (width, height) => {
    const stage = stageFit({ width, height });
    expect(Number.isInteger(stage.scale)).toBe(true);
    expect(stage.width).toBe(SCENE_W * stage.scale);
    expect(stage.height).toBe(SCENE_H * stage.scale);
    expect(stage.left).toBeGreaterThanOrEqual(0);
    expect(stage.top).toBeGreaterThanOrEqual(0);
    expect(stage.left + stage.width).toBeLessThanOrEqual(width);
    expect(stage.top + stage.height).toBeLessThanOrEqual(height);
    // one more step would not fit
    expect(SCENE_W * (stage.scale + 1) > width || SCENE_H * (stage.scale + 1) > height).toBe(true);
  });

  it('the Mac layout starts where the desktop type profile does, and only with a mouse', () => {
    expect(DESK_QUERY).toBe(`(pointer: fine) and ${DESKTOP_QUERY}`);
  });
});

describe('the mini window stays inside the scene', () => {
  it.each(SIZES)('%i×%i: inside the scene, above the action bar, clear of the sign', (width, height) => {
    const { stage, spot } = place(width, height);
    expect(spot.left).toBeGreaterThanOrEqual(stage.left);
    expect(spot.top).toBeGreaterThanOrEqual(stage.top);
    expect(spot.left + spot.width).toBeLessThanOrEqual(stage.left + stage.width);
    expect(spot.top + spot.height).toBeLessThanOrEqual(stage.top + stage.height - OVERLAY);
    expect(spot.width).toBeLessThanOrEqual(DESK_WINDOW_WIDTH);
    expect(intersects(spot, onScreen(stage, SHOP_SIGN))).toBe(false);
  });

  it.each(SIZES.filter(([w, h]) => stageFit({ width: w, height: h }).scale >= 5))('%i×%i: at the edge of the scene, clear of the customer', (width, height) => {
    const { stage, spot } = place(width, height);
    const customer = onScreen(stage, { x: CUSTOMER_ZONE.left, y: 0, w: CUSTOMER_ZONE.right - CUSTOMER_ZONE.left, h: SCENE_H });
    expect(spot.side).toBe('right');
    expect(intersects(spot, customer)).toBe(false);
    expect(stage.left + stage.width - (spot.left + spot.width)).toBe(DESK_MARGIN);
  });

  it.each(SIZES.filter(([w, h]) => stageFit({ width: w, height: h }).scale >= 5))('%i×%i: the wide stock window (task 41) is wider, still clear of the customer and the sign', (width, height) => {
    const stage = stageFit({ width, height });
    const wide = deskWindowPlacement(stage, stage.top + stage.height - OVERLAY, DESK_WINDOW_WIDE);
    const customer = onScreen(stage, { x: CUSTOMER_ZONE.left, y: 0, w: CUSTOMER_ZONE.right - CUSTOMER_ZONE.left, h: SCENE_H });
    expect(wide.width).toBeGreaterThanOrEqual(place(width, height).spot.width);
    expect(wide.width).toBeLessThanOrEqual(DESK_WINDOW_WIDE);
    expect(intersects(wide, customer)).toBe(false);
    expect(intersects(wide, onScreen(stage, SHOP_SIGN))).toBe(false);
    expect(wide.left + wide.width).toBeLessThanOrEqual(stage.left + stage.width);
  });

  it('1440×900: the stock window is 520 wide (the 8 chips in 2 rows, screenshot 41-stock-mac)', () => {
    const stage = stageFit({ width: 1440, height: 900 });
    expect(deskWindowPlacement(stage, 800, DESK_WINDOW_WIDE).width).toBe(520);
    expect(uiTs).toMatch(/wide: ui\.tab === 'inv'/);
  });

  it('the bug of 17.11 (Safari ~1440): the morning window went past the right edge of the scene to the sign', () => {
    const { stage, spot } = place(1440, 900);
    expect(spot.left + spot.width).toBe(stage.left + stage.width - DESK_MARGIN);
    expect(spot.top).toBeGreaterThanOrEqual(stage.top + (SHOP_SIGN.y + SHOP_SIGN.h) * stage.scale);
    expect(spot.height).toBeGreaterThan(400);
  });

  it('with no room at either side it goes over the customer, still inside the scene; never a negative size', () => {
    const { stage, spot } = place(1100, 450); // ×4: 640×400
    expect(spot.side).toBe('over');
    expect(spot.left).toBeGreaterThanOrEqual(stage.left);
    const tiny = deskWindowPlacement({ left: 0, top: 0, width: 160, height: 100 }, 20);
    expect(tiny.width).toBeGreaterThanOrEqual(0);
    expect(tiny.height).toBe(0);
  });

  it('a window wider than the room shrinks instead of running out of the scene', () => {
    const { stage, spot } = place(900, 600); // ×5: 64 × 5 − 24 = 296 to the right of the customer
    expect(spot.side).toBe('right');
    expect(spot.width).toBe(296);
    expect(spot.left).toBeGreaterThan(stage.left + CUSTOMER_ZONE.right * stage.scale);
  });
});

describe('on a Mac the hotspots lead to the windows', () => {
  it('shelves, terminal and the customer are the tabs; a tab opens its window on a Mac', () => {
    const tabs = Object.fromEntries(HOTSPOTS.filter(spot => spot.action?.a === 'tab').map(spot => [spot.id, spot.action?.v]));
    expect(tabs).toEqual({ shelves: 'inv', terminal: 'craft', client: 'deal' });
    expect(uiTs).toMatch(/tab: value => \{\s*if \(isTab\(value\)\) \{\s*showTab\(value\);/);
    expect(uiTs).toMatch(/function showTab[\s\S]*?if \(isDesk\(\)\) \{\s*wantPane = true;/);
    expect(uiTs).toMatch(/else if \(wantPane\) \{\s*showWindow\(paneSpec\(html\)\);/);
  });

  it('the pane is gone on a Mac, the bar and the HUD lie over the scene', () => {
    expect(styleCss).toMatch(/\.desk \.ceiling,\s*\.desk \.pane \{\s*display: none;/);
    expect(styleCss).toMatch(/\.desk \.hud \{\s*position: absolute;/);
    expect(styleCss).toMatch(/\.desk \.actionbar \{\s*position: absolute;/);
  });
});
