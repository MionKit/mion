// Alignment-audit aggregator. Each competitor's built bundle, run with
// RT_AUDIT_ALIGNMENT=1 (see shared/harness/audit.ts → maybeAudit), drops a
// results/<name>.alignment.json holding every place its validator disagrees with
// the SHARED (ts-runtypes-authored) samples. This script joins them into one flat
// table — results/alignment-misalignments.json — and prints a per-(competitor,
// metric, path) summary plus a per-case-key roll-up.
//
// It is the read-only second half of the audit: the per-competitor collection
// happens in-process (so the ts-runtypes / typia transforms run); this only reads
// the JSON those runs produced. Idempotent; re-running overwrites the joined file.
//
// Usage (from container/benchmarks/, after the per-competitor audit runs):
//   node _audit/run-audit.mjs
// The full container flow is `pnpm rtx bench audit` (see package.json), which
// builds + audit-runs every competitor first, then calls this.

import {readdirSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Self-locate the results dir from this script's own path (mirrors classify.mjs), so
// the aggregator is correct no matter the caller's cwd — bench.mjs invokes it via the
// run() helper, whose cwd is REPO_ROOT, not container/benchmarks/.
const AUDIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = path.resolve(AUDIT_DIR, '..');
const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? path.join(BENCH_DIR, 'results');
const OUT_DIR = process.env.RT_AUDIT_OUT_DIR ?? RESULTS_DIR;
const PREFERRED = ['ts-runtypes', 'zod', 'typebox', 'ajv', 'typia'];

function loadAuditFiles() {
  let files;
  try {
    files = readdirSync(RESULTS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith('.alignment.json'))
    .map((f) => JSON.parse(readFileSync(path.join(RESULTS_DIR, f), 'utf8')));
}

const order = (a, b) => (PREFERRED.indexOf(a) + 1 || 99) - (PREFERRED.indexOf(b) + 1 || 99) || a.localeCompare(b);
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

function main() {
  const audits = loadAuditFiles().sort((a, b) => order(a.competitor, b.competitor));
  if (audits.length === 0) {
    console.error(`run-audit: no *.alignment.json in ${RESULTS_DIR} — run the competitors in RT_AUDIT_ALIGNMENT=1 mode first.`);
    return 1;
  }

  const allRecords = [];
  const allBuilderIssues = [];
  const allNotSupported = [];
  // Per-competitor case coverage (every case it ran + that case's divergence count)
  // — the correctness website table reads this to tell "ran, aligned (0)" apart from
  // "did not run (n-a)", which the divergence records alone can't express.
  const coverage = {};
  for (const audit of audits) {
    for (const r of audit.records) allRecords.push(r);
    for (const b of audit.builderIssues ?? []) allBuilderIssues.push(b);
    for (const n of audit.notSupported ?? []) allNotSupported.push(n);
    coverage[audit.competitor] = audit.coverage ?? [];
  }

  // Per-competitor / metric / path counts.
  const competitors = audits.map((a) => a.competitor);
  const summary = {};
  for (const c of competitors) {
    summary[c] = {
      validate: {accept: 0, reject: 0},
      validationErrors: {accept: 0, reject: 0},
      overriddenDivergences: 0,
      undeclaredDivergences: 0,
      builderIssues: 0,
      notSupported: 0,
    };
  }
  for (const r of allRecords) {
    summary[r.competitor][r.metric][r.path]++;
    if (r.samplesOverridden) summary[r.competitor].overriddenDivergences++;
    else summary[r.competitor].undeclaredDivergences++;
  }
  for (const b of allBuilderIssues) summary[b.competitor].builderIssues++;
  for (const n of allNotSupported) summary[n.competitor].notSupported++;

  // Per-case-key roll-up: how many competitors diverge on each case (a high count
  // is the "are WE the outlier?" signal — many libraries disagree with the label).
  const byCase = new Map();
  for (const r of allRecords) {
    if (!byCase.has(r.caseKey))
      byCase.set(r.caseKey, {
        caseKey: r.caseKey,
        suite: r.suite,
        group: r.group,
        name: r.name,
        competitors: new Set(),
        records: 0,
      });
    const entry = byCase.get(r.caseKey);
    entry.competitors.add(r.competitor);
    entry.records++;
  }
  const caseRollup = [...byCase.values()]
    .map((e) => ({...e, competitors: [...e.competitors].sort(order), competitorCount: e.competitors.size}))
    .sort((a, b) => b.competitorCount - a.competitorCount || b.records - a.records || a.caseKey.localeCompare(b.caseKey));

  const out = {
    generatedAt: new Date().toISOString(),
    competitors: competitors.sort(order),
    totals: {
      records: allRecords.length,
      builderIssues: allBuilderIssues.length,
      notSupported: allNotSupported.length,
      casesWithDivergence: caseRollup.length,
    },
    summary,
    caseRollup,
    coverage,
    records: allRecords,
    builderIssues: allBuilderIssues,
    notSupported: allNotSupported,
  };

  mkdirSync(OUT_DIR, {recursive: true});
  const outPath = path.join(OUT_DIR, 'alignment-misalignments.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  // Console summary.
  console.log(`\nAlignment audit — ${allRecords.length} misalignment record(s) across ${competitors.length} competitor(s)`);
  console.log(`(each record = one sample where a competitor disagrees with the SHARED ts-runtypes truth)\n`);
  console.log(
    pad('competitor', 14) +
      padL('val·acc', 9) +
      padL('val·rej', 9) +
      padL('err·acc', 9) +
      padL('err·rej', 9) +
      padL('declared', 10) +
      padL('undecl.', 9) +
      padL('bld-err', 9)
  );
  console.log('-'.repeat(78));
  for (const c of out.competitors) {
    const s = summary[c];
    console.log(
      pad(c, 14) +
        padL(s.validate.accept, 9) +
        padL(s.validate.reject, 9) +
        padL(s.validationErrors.accept, 9) +
        padL(s.validationErrors.reject, 9) +
        padL(s.overriddenDivergences, 10) +
        padL(s.undeclaredDivergences, 9) +
        padL(s.builderIssues, 9)
    );
  }
  console.log(`\nCases with at least one divergence: ${caseRollup.length}`);
  console.log('Most-contested cases (competitors disagreeing with the shared truth):');
  for (const e of caseRollup.slice(0, 15)) {
    console.log(`  ${pad(e.caseKey, 40)} ${e.competitorCount} lib(s): ${e.competitors.join(', ')}`);
  }
  console.log(`\n==> wrote ${outPath}`);
  return 0;
}

process.exit(main());
