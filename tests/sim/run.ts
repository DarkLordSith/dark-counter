// =====================================================================
//  run.ts — `npm run sim -- --seeds 1000 --strategy careful`
//  Plays N story games per strategy, prints a table, writes JSON.
//  Options: --seeds N (default 1000), --strategy careful|owner|greedy|all
//  (default all), --json path (default tests/sim/out/sim.json).
// =====================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FINAL } from '../../src/data';
import { CHECK_DAY, runSim, STRATEGIES } from './sim';

/** Task 38: the bots that also try the early flight. */
const FINALE_STRATEGIES = ['owner', 'greedy'];
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
    'находок продано за неделю, %': show(summary.junkSoldInWeek),
    'обычные продажи, кр./нед.': show(summary.saleIncomeWeek),
    'оптовик, кр./нед.': show(summary.bulkIncomeWeek),
    'доля оптовика в доходе, %': show(summary.bulkShare),
    'оптовиков за игру': show(summary.bulkVisits),
    'вещей оптовику за игру': show(summary.bulkItems),
  });
  console.table(summary.weeklyCredits.map((credits, i) => ({ неделя: i + 1, 'кр.': show(credits), долг: show(summary.weeklyDebt[i]) })));
  // task 38: the finale of the games that left — the shuttle on day 60 and, for owner / greedy, the early flight right after the seat
  const finale: Record<string, SimSummary> = { 'день 60': summary };
  if (FINALE_STRATEGIES.includes(name)) {
    finale['сразу после места'] = runSim(seeds, STRATEGIES[name], 'asap');
    summaries.push({ ...finale['сразу после места'], strategy: `${name}:asap` });
  }
  console.log(`-- ${name}: финал (улетевшие)`);
  console.table(Object.fromEntries(Object.entries(finale).map(([policy, s]) => [policy, {
    'улетел, %': s.endings.left,
    'день вылета': show(s.leftDay),
    'на борту p25': show(s.board.p25),
    'медиана': show(s.board.median),
    'p75': show(s.board.p75),
    [`бедно <${FINAL.tierOk}, %`]: show(s.tiers.poor),
    'с запасом, %': show(s.tiers.ok),
    [`новая жизнь ≥${FINAL.tierRich}, %`]: show(s.tiers.rich),
    'трап, % улетевших': show(s.rampShare),
    'трап, ср. −кр.': show(s.rampToll),
  }])));
}

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify({ seeds, summaries }, null, 1));
console.log(`\nJSON: ${jsonPath}`);
