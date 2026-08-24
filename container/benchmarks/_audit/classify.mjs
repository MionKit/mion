// Classifier — step 1 + the static half of the documented-divergence catalog.
//
// Reads results/alignment-misalignments.json (the LIVE per-sample divergences the
// runnable competitors produced) and buckets each one by root cause, then reads
// every competitor's cases.ts to harvest the DECLARED divergences they already
// carry: each NOT_SUPPORTED opt-out (with its inline reason) and each
// SampleOverride (with its inline note). The union is the full alignment picture —
// the live records prove the divergence empirically and the declared notes explain
// the intent (including the NOT_SUPPORTED opt-outs, which never produce a record).
//
// Output:
//   _audit/findings/<caseKey>__<competitor>__<path>__<idx>.md   one per live finding
//   _audit/classification-summary.json                          machine-readable roll-up
//
// Buckets:
//   LIBRARY_SEMANTIC_DIFFERENCE  library deliberately defines "valid" differently
//   LIBRARY_LIMITATION           library cannot express the shared constraint
//   AUTHORING_DRIFT              competitor schema doesn't match the shared type
//   SAMPLE_LABEL_WRONG           the shared label itself is wrong
//   TS_RUNTYPES_DIVERGENT        ts-runtypes is the surprising one
//   UNKNOWN                      undecided
//
// Usage (from container/benchmarks/): node _audit/classify.mjs

import {readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const AUDIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = path.resolve(AUDIT_DIR, '..');
const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? path.join(BENCH_DIR, 'results');
const FINDINGS_DIR = path.join(AUDIT_DIR, 'findings');
const COMPETITORS = ['ts-runtypes', 'zod', 'typebox', 'ajv', 'typia'];

// ── live-record classification ────────────────────────────────────────────────
// Every divergence the audit surfaced is a competitor ACCEPTING a value the shared
// (ts-runtypes) truth rejects — a reject-path false positive. The root cause is
// read off the sample value (the suite's invalid samples are deliberately the
// "edge" values each library treats differently) plus the case's suite/group.
function classifyRecord(record) {
  const repr = record.sampleValueRepr;
  const nonFinite = /\bNaN\b|\bInfinity\b|-Infinity/.test(repr);
  const invalidDate = /Date\(Invalid\)/.test(repr);
  // A Map/Set sample only means "collection element validation" when the CASE is a
  // builtin-collection type (NATIVE group); a Map/Set landing on an object case is
  // the plain-object guard.
  const collection = record.group === 'NATIVE' && /^(Map\(|Set\()/.test(repr);
  const classInstance = /^(Date\(|Map\(|Set\(|\[)/.test(repr) || /^\/.*\/[a-z]*$/.test(repr);

  // Format-validation suite: the divergence is the library's format regex (email,
  // uuid, ip, date-string, …) differing from ts-runtypes' built-in pattern.
  if (record.suite === 'format-validation') {
    return {
      bucket: 'LIBRARY_SEMANTIC_DIFFERENCE',
      cause: 'format-regex-difference',
      reasoning:
        "The library accepts a string ts-runtypes rejects (or vice versa) for a string/number format. Each library ships its own format regexes; the shared samples were authored against ts-runtypes' built-in patterns (packages/ts-runtypes/src/formats/), so a stricter-or-looser competitor regex shows up here. This is the predicted largest format cluster.",
      action: 'Keep as a documented SampleOverride naming the format-regex difference.',
    };
  }
  if (nonFinite) {
    return {
      bucket: 'LIBRARY_SEMANTIC_DIFFERENCE',
      cause: 'non-finite-number',
      reasoning:
        'The library accepts NaN / Infinity / -Infinity as a valid number. ts-runtypes gates numbers on Number.isFinite, so non-finite values are rejected (they are not JSON-representable). zod (.finite()) and typebox both reject them too, so ts-runtypes is on the majority side.',
      action: 'Keep as a documented SampleOverride naming the non-finite-number semantic.',
    };
  }
  if (invalidDate) {
    return {
      bucket: 'LIBRARY_SEMANTIC_DIFFERENCE',
      cause: 'invalid-date',
      reasoning:
        'The library validates Date by instanceof only, so an Invalid Date (getTime() === NaN, e.g. new Date("invalid")) passes. ts-runtypes additionally gates on getTime() not being NaN. zod and typebox also reject Invalid Date, so ts-runtypes is on the majority side.',
      action: 'Keep as a documented SampleOverride naming the Invalid-Date semantic.',
    };
  }
  if (collection) {
    return {
      bucket: 'LIBRARY_SEMANTIC_DIFFERENCE',
      cause: 'collection-element-validation',
      reasoning:
        'For a Map/Set type the library accepts an instance whose entries do not match the declared key/value types, validating the container kind but not its elements. ts-runtypes validates the entries too.',
      action: 'Keep as a documented SampleOverride naming the collection-element semantic.',
    };
  }
  if (classInstance) {
    return {
      bucket: 'LIBRARY_SEMANTIC_DIFFERENCE',
      cause: 'structural-object-accepts-class-instance',
      reasoning:
        'For an all-optional object type the library accepts a builtin class instance (Date / RegExp) or an array, because structurally it has no conflicting members. ts-runtypes applies a plain-object guard. zod replicates the guard with a custom check (so it agrees with ts-runtypes); typebox cannot express it via Type.Object, hence its override.',
      action: 'Keep as a documented SampleOverride / LIBRARY_LIMITATION naming the plain-object guard.',
    };
  }
  return {
    bucket: 'UNKNOWN',
    cause: 'unclassified',
    reasoning: 'No automatic rule matched this sample; needs human review.',
    action: 'Review manually.',
  };
}

// ── declared-divergence harvest (static read of each cases.ts) ──────────────────
// NOT_SUPPORTED opt-outs and SampleOverride notes both carry a trailing `// …`
// reason at the call site. We pull them out keyed by case so the catalog explains
// intent, including the NOT_SUPPORTED opt-outs that never produce a live record.
function harvestDeclared(competitor) {
  const file = path.join(BENCH_DIR, 'competitors', competitor, 'cases.ts');
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    return {notSupported: [], overrides: []};
  }
  const lines = src.split('\n');
  const notSupported = [];
  const overrides = [];
  let currentKey = null;
  const keyRe = /^\s*'([A-Z_]+\.[A-Za-z0-9_]+)'\s*:/;
  const nsRe = /^\s*'([A-Z_]+\.[A-Za-z0-9_]+)'\s*:\s*NOT_SUPPORTED\s*,?\s*(?:\/\/\s*(.*))?$/;
  for (const line of lines) {
    const ns = line.match(nsRe);
    if (ns) {
      notSupported.push({caseKey: ns[1], note: (ns[2] ?? '').trim()});
      continue;
    }
    const key = line.match(keyRe);
    if (key) currentKey = key[1];
    // Override note rides the closing line of an entry block: `}, // override: …`
    const ov = line.match(/\}\s*,\s*\/\/\s*(override[:.].*)$/i);
    if (ov && currentKey) overrides.push({caseKey: currentKey, note: ov[1].trim()});
  }
  return {notSupported, overrides};
}

function main() {
  let joined;
  try {
    joined = JSON.parse(readFileSync(path.join(RESULTS_DIR, 'alignment-misalignments.json'), 'utf8'));
  } catch {
    console.error('classify: results/alignment-misalignments.json not found — run _audit/run-audit.mjs first.');
    return 1;
  }

  // Reset findings dir.
  try {
    for (const f of readdirSync(FINDINGS_DIR)) if (f.endsWith('.md')) rmSync(path.join(FINDINGS_DIR, f));
  } catch {
    /* dir may not exist yet */
  }
  mkdirSync(FINDINGS_DIR, {recursive: true});

  // Dedup live records by (case, competitor, path, sampleIndex) — validate and
  // validationErrors produce identical rows, so collapse them and note both metrics.
  const byFinding = new Map();
  for (const r of joined.records) {
    const id = `${r.caseKey}__${r.competitor}__${r.path}__${r.sampleIndex}`;
    if (!byFinding.has(id)) byFinding.set(id, {...r, metrics: new Set()});
    byFinding.get(id).metrics.add(r.metric);
  }

  const bucketCounts = {};
  const findings = [];
  for (const [id, f] of byFinding) {
    const cls = classifyRecord(f);
    bucketCounts[cls.bucket] = (bucketCounts[cls.bucket] ?? 0) + 1;
    const metrics = [...f.metrics].sort().join(', ');
    findings.push({
      id,
      caseKey: f.caseKey,
      competitor: f.competitor,
      path: f.path,
      sampleIndex: f.sampleIndex,
      sampleValueRepr: f.sampleValueRepr,
      metrics,
      samplesOverridden: f.samplesOverridden,
      ...cls,
    });
    const md = [
      `# ${f.caseKey} — ${f.competitor}`,
      ``,
      `- **Bucket:** ${cls.bucket}`,
      `- **Root cause:** ${cls.cause}`,
      `- **Metric(s):** ${metrics}`,
      `- **Path / sample:** ${f.path} #${f.sampleIndex}`,
      `- **Sample value:** \`${f.sampleValueRepr}\``,
      `- **Expected (shared truth):** ${f.expected} · **Competitor returned:** ${f.got}`,
      `- **Competitor already overrides this case:** ${f.samplesOverridden ? 'yes (declared)' : 'no (undeclared)'}`,
      ``,
      `## Reasoning`,
      ``,
      cls.reasoning,
      ``,
      `## Proposed action`,
      ``,
      cls.action,
      ``,
    ].join('\n');
    writeFileSync(path.join(FINDINGS_DIR, `${id}.md`), md);
  }

  const declared = {};
  for (const competitor of COMPETITORS) declared[competitor] = harvestDeclared(competitor);

  const summary = {
    generatedAt: new Date().toISOString(),
    liveFindings: findings.length,
    bucketCounts,
    findings,
    declared,
  };
  writeFileSync(path.join(AUDIT_DIR, 'classification-summary.json'), JSON.stringify(summary, null, 2) + '\n');

  console.log(`\nClassified ${findings.length} live finding(s):`);
  for (const [bucket, n] of Object.entries(bucketCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${bucket.padEnd(32)} ${n}`);
  console.log(`\nDeclared divergences harvested from cases.ts:`);
  for (const competitor of COMPETITORS) {
    const d = declared[competitor];
    console.log(`  ${competitor.padEnd(14)} NOT_SUPPORTED=${d.notSupported.length}  overrides=${d.overrides.length}`);
  }
  console.log(`\n==> wrote ${findings.length} finding file(s) to _audit/findings/ and classification-summary.json`);
  return 0;
}

process.exit(main());
