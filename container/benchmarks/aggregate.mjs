// Reads every results/<name>.json (written by each competitor's isolated run),
// joins by case key, and renders the comparison tables + coverage. Each case is
// measured on TWO functions — `validate` (cheap boolean) and `validationErrors`
// (the heavier error-returning fn, meant to run only after validate fails) — each
// on the ACCEPT (valid) and REJECT (invalid) paths. So this prints FOUR tables:
// validate·accept, validate·reject, validationErrors·accept, validationErrors·reject.
// A trailing "*" means that competitor used its own samples for the case.
// Exits non-zero if ANY competitor has a fail/errored case. Plain .mjs.

import path from 'node:path';
import {readCompetitorResults} from './_lib/read-results.mjs';

const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? path.resolve(process.cwd(), 'results');
const PREFERRED = ['ts-runtypes', 'zod', 'typebox', 'ajv', 'typia'];

const COL = 16;
const KEYW = 30;
const padR = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const padL = (s, n) => s.padStart(n);
const fmt = (n) => (n <= 0 ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M/s` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k/s` : `${n.toFixed(0)}/s`);

// `metric` ∈ {validate, validationErrors}; `field` ∈ {validOpsSec, invalidOpsSec}.
function cell(c, metric, field) {
  if (!c) return '—';
  const m = c[metric];
  if (!m || m.status === 'not-supported') return '—';
  if (m.status === 'fail') return 'FAIL';
  if (m.status === 'errored') return 'ERROR';
  return (fmt(m[field]) || 'ok') + (c.samplesOverridden ? '*' : '');
}

// results/ collects more than competitor results: env.json, *.alignment.json,
// alignment-misalignments.json, *.typecost.json, *.compiletime.json, … The full
// bench path wipes the directory first so aggregate only ever saw competitor
// files; `bench-one` deliberately clears only <name>.json, which used to leave
// the other artifacts in place and crash aggregate on the first one. The reader
// lives in _lib/ so this and the website's gen-docs.mjs share ONE definition of
// "is this a competitor result" — they had two copies, and the typecost artifact
// slipped past both.
const load = () => readCompetitorResults(RESULTS_DIR, (message) => console.log(`note: aggregate ${message}`));

function renderSection(title, metric, field, competitors, byKey, rows) {
  console.log(`\n══════ ${title} ══════`);
  let lastSuite = '';
  let lastGroup = '';
  for (const row of rows) {
    if (row.suite !== lastSuite) {
      lastSuite = row.suite;
      lastGroup = '';
      console.log(`\n### ${row.suite}`);
      console.log(padR('case', KEYW) + competitors.map((c) => padL(c, COL)).join(''));
      console.log('-'.repeat(KEYW + COL * competitors.length));
    }
    if (row.group !== lastGroup) {
      lastGroup = row.group;
      console.log(`· ${row.group}`);
    }
    let line = padR('  ' + row.name, KEYW);
    for (const name of competitors) line += padL(cell(byKey.get(name).get(row.key), metric, field), COL);
    console.log(line);
  }
}

function main() {
  const results = load();
  if (results.length === 0) {
    console.error(`aggregate: no results/*.json in ${RESULTS_DIR} — run the competitors first.`);
    return 1;
  }
  const order = (a, b) => ((PREFERRED.indexOf(a) + 1 || 99) - (PREFERRED.indexOf(b) + 1 || 99)) || a.localeCompare(b);
  const competitors = results.map((r) => r.competitor).sort(order);
  const byKey = new Map(results.map((r) => [r.competitor, new Map(r.cases.map((c) => [c.key, c]))]));
  const rows = results.reduce((longest, r) => (r.cases.length > longest.length ? r.cases : longest), []);

  const noTiming = results[0].env?.noTiming;
  console.log(`\nFull validation benchmark${noTiming ? ' (correctness only)' : ' — validate vs validationErrors, accept vs reject'}`);
  console.log('cells are validations/sec; "*" = competitor used its own samples (overrode shared data).');
  console.log('validate = cheap boolean; validationErrors = error-returning fn (runs only after validate fails).');

  renderSection('VALIDATE · accept/sec', 'validate', 'validOpsSec', competitors, byKey, rows);
  renderSection('VALIDATE · reject/sec', 'validate', 'invalidOpsSec', competitors, byKey, rows);
  renderSection('VALIDATION-ERRORS · accept/sec', 'validationErrors', 'validOpsSec', competitors, byKey, rows);
  renderSection('VALIDATION-ERRORS · reject/sec', 'validationErrors', 'invalidOpsSec', competitors, byKey, rows);

  console.log('\nCoverage (per metric):');
  let failed = 0;
  for (const name of competitors) {
    const r = results.find((x) => x.competitor === name);
    failed += r.summary.fail + r.summary.errored;
    const over = r.cases.filter((c) => c.samplesOverridden).length;
    const overStr = over ? `  overrides=${over}` : '';
    const line = (label, s) => `${padR(label, 22)} ok=${s.ok}  fail=${s.fail}${s.errored ? `  errored=${s.errored}` : ''}  n/s=${s.notSupported}`;
    console.log(`  ${name}${overStr}  / ${r.summary.total}`);
    console.log(`      ${line('validate', r.summary.validate)}`);
    console.log(`      ${line('validationErrors', r.summary.validationErrors)}`);
  }

  if (failed > 0) {
    console.log(`\n✗ ${failed} fail/errored metric-case(s) across competitors:`);
    for (const r of results) {
      for (const c of r.cases) {
        for (const metric of ['validate', 'validationErrors']) {
          const m = c[metric];
          if (m && (m.status === 'fail' || m.status === 'errored')) console.log(`  ${r.competitor} / ${c.key} [${metric}]: ${m.status}${m.detail ? ` — ${m.detail}` : ''}`);
        }
      }
    }
    return 1;
  }
  console.log('\n✓ every supported function passed correctness on BOTH paths for all cases.');
  return 0;
}

process.exit(main());
