// Diagnostics overlay: language pick and the copied report text.
import { describe, expect, it } from 'vitest';
import { DIAG_TEXT, detectLang, formatReport } from '../../src/diag';
import type { ViewportMetrics } from '../../src/diag';

const METRICS: ViewportMetrics = {
  version: 'v0.7 · abc1234',
  standalone: true,
  displayModeStandalone: true,
  statusBarStyle: 'black',
  insetTop: 0,
  insetBottom: 34,
  insetLeft: 0,
  insetRight: 0,
  rootPaddingTop: 0,
  hudTop: 0,
  innerHeight: 844,
  innerWidth: 390,
  screenHeight: 844,
  screenWidth: 390,
  visualViewportHeight: 844,
  visualViewportOffsetTop: 0,
  devicePixelRatio: 3,
  userAgent: 'Mozilla/5.0 (iPhone)',
};

describe('detectLang', () => {
  it('picks Russian for any ru locale and English otherwise', () => {
    expect(detectLang('ru-RU')).toBe('ru');
    expect(detectLang('RU')).toBe('ru');
    expect(detectLang('en-US')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
  });

  it('has the same keys in both languages', () => {
    expect(Object.keys(DIAG_TEXT.en).sort()).toEqual(Object.keys(DIAG_TEXT.ru).sort());
  });
});

describe('formatReport', () => {
  const report = formatReport(METRICS);

  it('shows the numbers needed to diagnose the top inset', () => {
    expect(report).toContain('navigator.standalone: true');
    expect(report).toContain('safe-area-inset-top: 0px');
    expect(report).toContain('screen.height − innerHeight: 0');
    expect(report).toContain('visualViewport.offsetTop: 0px');
    expect(report).toContain('UA: Mozilla/5.0 (iPhone)');
  });

  it('marks values the browser does not have', () => {
    const report = formatReport({ ...METRICS, standalone: undefined, visualViewportHeight: null, hudTop: null });
    expect(report).toContain('navigator.standalone: n/a');
    expect(report).toContain('visualViewport.height: n/a');
    expect(report).toContain('hud top: n/a');
  });
});
