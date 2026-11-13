// Color dictionary (V1.2): where a color carries meaning, it comes from MEANING / --m-*,
// never from a base color like --red or COLOR.amber.
import { describe, expect, it } from 'vitest';
import { COLOR, CSS_TOKENS, MEANING } from '../../src/palette';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import economyTs from '../../src/economy.ts?raw';

/** CSS rules as [selector, body] pairs (style.css has no nested blocks). */
const RULES: [string, string][] = [...styleCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(match => [match[1].trim().replace(/\s+/g, ' '), match[2]]);

const rule = (selector: string): string => {
  const found = RULES.filter(([sel]) => sel === selector);
  expect(found, `rule "${selector}" in style.css`).toHaveLength(1);
  return found[0][1];
};

/** Base colors that would carry meaning if used directly. */
const BASE_ACCENTS = /var\(--(red|amber|green|cyan|dim|violet)\)/;

/** Decoration, not meaning: allowed to use base accents directly. Keep short. */
const DECOR = [
  'button:focus-visible, input:focus-visible', '.ios-pwa .ceiling', '.logo', '.st small', '.chip', '.ticker', '.ticker b', '.tab', '.tab.on',
  '.hint', '.rows span:nth-child(odd)', '.chance', '.ask', '.tile .tv', '.legend', '.tag', '.need', '.opt span',
  '.mbox', '.mbox h2', '.mbox label', '.mbox .version', '.diag', '.diag h2',
  // customer kind label ("продаёт" / "покупает"): a type, not a state, so neutral grey (V1.3)
  '.kind',
];

describe('meaning tokens', () => {
  it('cover the seven meanings and reach CSS as --m-*', () => {
    expect(Object.keys(MEANING).sort()).toEqual(['action', 'hunch', 'inactive', 'ok', 'risk', 'unknown', 'wear']);
    for (const [name, color] of Object.entries(MEANING)) {
      expect(CSS_TOKENS[`--m-${name}`]).toBe(color);
    }
  });

  it('keep the owner rules: inactive is not red and differs from unknown; the hunch is violet, not amber', () => {
    expect(MEANING.inactive).not.toBe(MEANING.risk);
    expect(MEANING.inactive).not.toBe(MEANING.unknown);
    expect(MEANING.hunch).toBe(COLOR.violet);
    expect(MEANING.hunch).not.toBe(MEANING.wear);
  });
});

describe('the interface uses meanings, not base colors', () => {
  it('scales: wanted level = risk, patience = wear, gut feeling = hunch', () => {
    expect(rule('.heat i.on')).toContain('var(--m-risk)');
    expect(rule('.pips i.on')).toContain('var(--m-wear)');
    expect(rule('.cbar i')).toContain('var(--m-hunch)');
    expect(rule('.chance span')).toContain('var(--m-hunch)');
    expect(uiTs).not.toMatch(/cbar'\)\.style\.background/);
  });

  it('craft: parts in stock = ok, missing = inactive (not red)', () => {
    expect(rule('.need .m-ok')).toContain('var(--m-ok)');
    expect(rule('.need .m-inactive')).toContain('var(--m-inactive)');
    expect(uiTs).toContain("'m-ok' : 'm-inactive'");
    expect(MEANING.ok).not.toBe(MEANING.action);
  });

  it('shelf legend shows exactly the marks the tiles use', () => {
    const legend = uiTs.match(/<div class="legend">.*?<\/div>/)?.[0] ?? '';
    expect(legend).toContain('${DOT.unknown}');
    expect(legend).toContain('${DOT.risk}');
    expect(legend).toContain('${DOT.wear}');
    expect(uiTs).toContain("unknown: '<i class=\"d-unknown\">?</i>'");
    expect(rule('.d-risk')).toContain('var(--m-risk)');
    expect(rule('.d-wear')).toContain('var(--m-wear)');
    expect(rule('.dots i.d-unknown, .legend i.d-unknown')).toContain('var(--m-unknown)');
  });

  it('no base accent colors outside the decoration list', () => {
    const offenders = RULES
      .filter(([selector, body]) => BASE_ACCENTS.test(body) && !DECOR.includes(selector))
      .map(([selector]) => selector);
    expect(offenders).toEqual([]);
  });

  it('ui.ts and economy.ts never pick a base accent for meaning', () => {
    expect(uiTs).not.toMatch(BASE_ACCENTS);
    expect(economyTs).not.toMatch(/COLOR\.(red|amber|green|cyan|dim|violet)\b/);
  });

  it('old color-named classes are gone', () => {
    // (?<![\w-]) / (?![\w-]): "ok" must not match inside "m-ok"
    expect(uiTs).not.toMatch(/class="[^"]*(?<![\w-])(bad|ok|warn|q|amb|d-red|d-amb|d-q)(?![\w-])/);
    expect(styleCss).not.toMatch(/\.(bad|ok|warn|amb|d-red|d-amb|d-q|d-ok)(?![\w-])/);
  });
});
