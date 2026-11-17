// =====================================================================
//  grid.ts — `npm run sim:grid` (balance 17.11): tries every debt × payment
//  step × seat price of the grid on the owner / careful / greedy bots and
//  ranks the variants by the criteria of the temporary balance:
//   - owner leaves on the shuttle in 60–80% of games, median day the debt
//     is closed 48–55;
//   - careful is evicted in ≤ 10%;
//   - greedy does not leave in 100% (the risk stays).
//  Options: --seeds N (default 500), --json path (default tests/sim/out/grid.json).
// =====================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runSim, STRATEGIES, withBalance } from './sim';
import type { Balance, SimSummary } from './sim';

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const seeds = Number(option('seeds', '500'));
const jsonPath = option('json', 'tests/sim/out/grid.json');

const DEBTS = (option('debts', '12000-16000').split('-').map(Number) as [number, number]);
const DEBT_LIST = Array.from({ length: (DEBTS[1] - DEBTS[0]) / 1000 + 1 }, (_, i) => DEBTS[0] + 1000 * i);
const STEPS = [150, 200, 250];
const SEATS: [number, number][] = [[1500, 50], [1500, 100], [2000, 50], [2000, 100]];

interface Row {
  balance: Balance;
  owner: SimSummary;
  careful: SimSummary;
  greedy: SimSummary;
  /** How far from the criteria (0 = all met): percentage points and days off. */
  miss: number;
}

const outside = (value: number | null, low: number, high: number): number =>
  value === null ? 100 : Math.max(0, low - value, value - high);

function miss(row: Omit<Row, 'miss'>): number {
  return outside(row.owner.endings.left, 60, 80)
    + 3 * outside(row.owner.debtClosedMedian, 48, 55)
    + outside(row.careful.endings.evicted, 0, 10)
    + (row.greedy.endings.left >= 100 ? 10 : 0);
}

const rows: Row[] = [];
for (const start of DEBT_LIST) {
  for (const paymentStep of STEPS) {
    for (const [seatBase, seatPerDay] of SEATS) {
      const balance: Balance = { start, paymentStep, seatBase, seatPerDay };
      const row = withBalance(balance, () => ({
        balance,
        owner: runSim(seeds, STRATEGIES.owner),
        careful: runSim(seeds, STRATEGIES.careful),
        greedy: runSim(seeds, STRATEGIES.greedy),
      }));
      rows.push({ ...row, miss: miss(row) });
    }
  }
}

rows.sort((a, b) => a.miss - b.miss);
const show = (value: number | null): string => value === null ? '—' : String(value);
console.table(rows.map(row => ({
  долг: row.balance.start,
  шаг: row.balance.paymentStep,
  место: `${row.balance.seatBase}+${row.balance.seatPerDay}×д`,
  'owner улетел %': row.owner.endings.left,
  'owner день закрытия (медиана)': show(row.owner.debtClosedMedian),
  'owner выселен %': row.owner.endings.evicted,
  'careful выселен %': row.careful.endings.evicted,
  'careful улетел %': row.careful.endings.left,
  'greedy улетел %': row.greedy.endings.left,
  'greedy выселен %': row.greedy.endings.evicted,
  мимо: Math.round(row.miss * 10) / 10,
})));

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify({ seeds, rows }, null, 1));
console.log(`\nJSON: ${jsonPath}`);
