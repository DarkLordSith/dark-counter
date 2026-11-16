// Smoke test of the balance bot (tests/sim/): it plays whole story games and sums them up.
// The real runs are `npm run sim` (too slow for `npm test`).
import { describe, expect, it } from 'vitest';
import { DEBT } from '../../src/data';
import { playGame, runSim, STRATEGIES } from '../sim/sim';

describe('balance bot', () => {
  it('plays a story game to an ending, the same one for the same seed', () => {
    const game = playGame(1, STRATEGIES.careful);
    expect(['left', 'stayed', 'evicted']).toContain(game.ending);
    expect(game.day).toBeLessThanOrEqual(DEBT.shuttleDay);
    expect(game.weeklyCredits.length).toBeGreaterThan(0);
    expect(playGame(1, STRATEGIES.careful)).toEqual(game);
  });

  it('sums up a few games per strategy: endings add up to 100%', () => {
    for (const strategy of Object.values(STRATEGIES)) {
      const summary = runSim(3, strategy);
      const { left, stayed, evicted } = summary.endings;
      expect(summary.games).toBe(3);
      expect(left + stayed + evicted).toBeCloseTo(100, 5);
      expect(summary.weeklyGain).toBeGreaterThan(0);
    }
  });
});
