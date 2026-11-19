// =====================================================================
//  run.ts — `npm run sim -- --seeds 1000 --strategy careful`
//  Plays N story games per strategy, prints a table, writes JSON.
//  Options: --seeds N (default 1000), --strategy careful|owner|greedy|all
//  (default all), --json path (default tests/sim/out/sim.json).
// =====================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHECK_DAY, runSim, STRATEGIES } from './sim';
import type { SimSummary } from './sim';

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const seeds = Number(option('seeds', '1000'));
const wanted = option('strategy', 'all');
const jsonPath = option('json', 'tests/sim/out/sim.json');
const names = wanted === 'all' ? Object.keys(STRATEGIES) : [wanted];
const unknown = names.filter(name => !Object.hasOwn(STRATEGIES, name));
if (unknown.length || !Number.isInteger(seeds) || seeds < 1) {
  console.error(`usage: npm run sim -- --seeds 1000 --strategy ${Object.keys(STRATEGIES).join('|')}|all`);
  process.exit(1);
}

const show = (value: number | null): string => value === null ? '—' : String(value);
const summaries: SimSummary[] = [];
for (const name of names) {
  const started = performance.now();
  const summary = runSim(seeds, STRATEGIES[name]);
  summaries.push(summary);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`\n== ${name}: ${summary.games} games, ${seconds} s`);
  console.table({
    'улетел, %': summary.endings.left,
    'остался, %': summary.endings.stayed,
    'выселен, %': summary.endings.evicted,
    'долг закрыт, % игр': summary.debtClosedShare,
    'день закрытия долга': show(summary.debtClosedDay),
    'день закрытия, медиана': show(summary.debtClosedMedian),
    'день выселения': show(summary.evictedDay),
    'доход в неделю, кр.': show(summary.weeklyGain),
    [`закрыто долга к дню ${CHECK_DAY}, %`]: show(summary.checkDayClosed),
    [`темп к дню ${CHECK_DAY}, кр./день`]: show(summary.checkDayPace),
    'покупок на 1 продажу': show(summary.buysPerSale),
    'склад на утро, вещей': show(summary.morningStock),
    'находок за визит': show(summary.findsPerVisit),
    'ценность находок за визит, кр.': show(summary.valuePerVisit),
  });
  console.table(summary.weeklyCredits.map((credits, i) => ({ неделя: i + 1, 'кр.': show(credits), долг: show(summary.weeklyDebt[i]) })));
}

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify({ seeds, summaries }, null, 1));
console.log(`\nJSON: ${jsonPath}`);
