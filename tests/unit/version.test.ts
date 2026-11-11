// Version label in the save menu.
import { describe, expect, it } from 'vitest';
import { VERSION_LABEL, versionLabel } from '../../src/version';

describe('versionLabel', () => {
  it('drops a zero patch: 0.7.0 → v0.7', () => {
    expect(versionLabel('0.7.0', '2e58f64')).toBe('v0.7 · 2e58f64');
  });

  it('keeps a non-zero patch', () => {
    expect(versionLabel('0.7.1', 'abc1234')).toBe('v0.7.1 · abc1234');
  });

  it('does not touch a 10 in the middle', () => {
    expect(versionLabel('1.10.0', 'abc1234')).toBe('v1.10 · abc1234');
  });

  it('is built from package.json and git via define', () => {
    expect(VERSION_LABEL).toMatch(/^v\d+\.\d+(\.\d+)? · ([0-9a-f]{7}|dev)$/);
  });
});
