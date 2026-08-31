#!/usr/bin/env node
// Transforms the benchmark harness output into website-consumable JSON under
// container/website/public/bench-data/<bench>/:
//
//   index.json              — { bench, label, unit, metricLabel, competitors[],
//                              sections: [{ key, label, cases: [{ key, title,
//                              results: { [competitor]: { validateOpsSec?, status? } } }] }] }
//   <case>.json             — { competitors: [{ name, source }] }   (lazy hover)
//
// Two benches:
//   validation — runtime throughput from container/benchmarks/results/<competitor>.json
//                (the validationErrors·accept path: the metric EVERY competitor
//                implements, so it's the apples-to-apples column; zod has no cheap
//                boolean validate). unit = ops/sec, higher is better.
//   typecost   — TypeScript type-instantiation count per form from
//                container/benchmarks/results/<form>.typecost.json. unit = count, LOWER is
//                better.
//
// Per-case competitor source is lifted straight from each competitors/<lib>/cases.ts
// object literal (balanced-delimiter scan, no TS dep) so the hover shows the real
// schema/validator each library authors for that case.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import ts from 'typescript';
import {loadEnv} from '../../lib/env.mjs';
import {readCompetitorResults as readResultsDir} from '../../../container/benchmarks/_lib/read-results.mjs';

loadEnv(); // load .env (dev) so RT_BENCH_* knobs apply when run directly

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const BENCH_DIR = path.join(REPO_ROOT, 'container/benchmarks');
const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? path.join(BENCH_DIR, 'results');
const COMPETITORS_DIR = path.join(BENCH_DIR, 'competitors');
const OUT_ROOT = path.join(REPO_ROOT, 'container/website/public/bench-data');

// Stable competitor column order (mirrors aggregate.mjs PREFERRED).
const PREFERRED = ['mion', 'zod', 'typebox', 'ajv', 'typia'];
const order = (a, b) => (PREFERRED.indexOf(a) + 1 || 99) - (PREFERRED.indexOf(b) + 1 || 99) || a.localeCompare(b);

// Run environment (os / cpu / library versions) captured by container/benchmarks/capture-env.mjs.
// Optional — absent until a benchmark run (or `bench:capture-env`) writes results/env.json.
const ENV = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, 'env.json'), 'utf8'));
  } catch {
    return null;
  }
})();

// The shared meta block emitted onto each index (typecost also surfaces the TS version).
function metaBlock(withTypescript = false) {
  if (!ENV) return undefined;
  const meta = {generatedAt: ENV.generatedAt, os: ENV.os, cpu: ENV.cpu, cores: ENV.cores, node: ENV.node};
  if (withTypescript && ENV.typescript) meta.typescript = ENV.typescript;
  return meta;
}

// Groups whose title-cased name would not say what the section measures.
const SECTION_LABELS = {STRICT: 'Strict (no unknown keys)'};

function sectionLabel(group) {
  if (SECTION_LABELS[group]) return SECTION_LABELS[group];
  return group
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function safeKey(key) {
  return String(key).replace(/[^A-Za-z0-9_.-]/g, '_');
}

// Project one harness MetricResult onto the docs shape: valid (accept), invalid
// (reject), and mixed (interleaved) ops/sec. `mixed` uses the harness's measured
// `mixedOpsSec` when present; older result files predate it, so we derive it as
// the harmonic mean of valid + invalid — the exact throughput of a 1:1
// interleaved stream (modulo branch-prediction effects a real run also captures).
function toMetric(m) {
  let mixed = typeof m.mixedOpsSec === 'number' && m.mixedOpsSec > 0 ? m.mixedOpsSec : 0;
  if (mixed === 0 && m.validOpsSec > 0 && m.invalidOpsSec > 0) {
    mixed = 2 / (1 / m.validOpsSec + 1 / m.invalidOpsSec);
  }
  return {valid: m.validOpsSec, invalid: m.invalidOpsSec, mixed, status: m.status};
}

// ── competitor source extraction ────────────────────────────────────────────
// Parse `export const cases … = { 'KEY': <entry>, … }` with the TypeScript
// compiler API and return Map(caseKey → {validate?, validationErrors?}) — the
// per-metric builder bodies, so the docs hover can show ONLY the function the
// page measures (the cheap `build` is-valid check, or the `buildErrors` report).
// Each competitor's cases are authored as self-contained per-metric builders, so
// the body shown is copy-paste runnable. The AST parse is robust against regex
// literals, template `${}`, comments and nesting that trip a char scanner.

// Dedent a block's inner text to its minimum indentation.
function dedent(text) {
  const lines = text
    .replace(/^\r?\n/, '')
    .replace(/\s+$/, '')
    .split('\n');
  let min = Infinity;
  for (const line of lines) if (line.trim()) min = Math.min(min, line.match(/^\s*/)[0].length);
  if (!Number.isFinite(min)) min = 0;
  return lines.map((line) => line.slice(min)).join('\n');
}

// The readable "code inside the function" of a builder thunk: a block's inner
// statements (dedented) or an expression body verbatim.
function builderBody(node, sf) {
  if (node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node))) {
    const body = node.body;
    if (ts.isBlock(body)) {
      const full = body.getText(sf);
      return dedent(full.slice(full.indexOf('{') + 1, full.lastIndexOf('}')));
    }
    return body.getText(sf);
  }
  return node ? node.getText(sf).trim() : '';
}

export function extractCaseSources(file, varName = 'cases') {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let obj = null;
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.name.text === varName &&
        decl.initializer &&
        ts.isObjectLiteralExpression(decl.initializer)
      ) {
        obj = decl.initializer;
      }
    }
  }
  if (!obj) return out;
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name;
    const key = ts.isStringLiteralLike(name) ? name.text : ts.isIdentifier(name) ? name.text : null;
    if (key == null) continue;
    const init = prop.initializer;
    const sources = {};
    if (ts.isObjectLiteralExpression(init)) {
      for (const member of init.properties) {
        if (!ts.isPropertyAssignment(member)) continue;
        const mname =
          ts.isStringLiteralLike(member.name) || ts.isIdentifier(member.name) ? member.name.text : member.name.getText(sf);
        if (mname === 'build') sources.validate = builderBody(member.initializer, sf);
        else if (mname === 'buildErrors') sources.validationErrors = builderBody(member.initializer, sf);
      }
    } else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      sources.validate = builderBody(init, sf); // bare builder (schemaCases / shorthand) = validate only
    }
    // NOT_SUPPORTED (identifier) and shapes with neither metric → skip.
    if (sources.validate || sources.validationErrors) out.set(key, sources);
  }
  return out;
}

// ── shared sample extraction ──────────────────────────────────────────────────
// The valid/invalid sample arrays are SHARED across every competitor (one
// getSamples thunk per case, authored in shared/cases/**). Parse each group file's
// exported object literal and map caseKey (GROUP.name) → {valid, invalid} array
// text, so the correctness + validation hovers can show the exact data each
// validator ran against — the data-side companion to the per-competitor source.
const SHARED_CASES_DIR = path.join(BENCH_DIR, 'shared/cases');

// Tidy a sample array literal for display: keep the authored line breaks (so inline
// `//` comments stay on their own line and `//` inside a URL string is never mangled)
// but strip the source's deep indentation, re-indenting continuation lines by two.
// A one-line array in the source stays one line.
function tidyArrayText(text) {
  const lines = text.split('\n');
  if (lines.length <= 1) return text.trim();
  const rest = lines.slice(1);
  let min = Infinity;
  for (const line of rest) if (line.trim()) min = Math.min(min, line.match(/^\s*/)[0].length);
  if (!Number.isFinite(min)) min = 0;
  return [lines[0].trimEnd(), ...rest.map((line) => (line.trim() ? '  ' + line.slice(min).trimEnd() : ''))].join('\n');
}

// The object literal a getSamples thunk returns: `() => ({…})`, the same with
// parens, or a block body whose `return {…}` we follow. null when the body isn't a
// plain object literal (defensive — every shared case returns one).
function returnedObjectLiteral(fn) {
  if (!fn) return null;
  const isFnLike = ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isMethodDeclaration(fn);
  if (!isFnLike || !fn.body) return null;
  let expr = null;
  if (ts.isBlock(fn.body)) {
    for (const stmt of fn.body.statements) if (ts.isReturnStatement(stmt) && stmt.expression) expr = stmt.expression;
  } else {
    expr = fn.body;
  }
  while (expr && ts.isParenthesizedExpression(expr)) expr = expr.expression;
  return expr && ts.isObjectLiteralExpression(expr) ? expr : null;
}

// The `valid` / `invalid` array text off a returned samples object literal.
function sampleArrayText(obj, name, sf) {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isStringLiteralLike(prop.name) || ts.isIdentifier(prop.name) ? prop.name.text : null;
    if (key === name) return tidyArrayText(prop.initializer.getText(sf));
  }
  return null;
}

// Walk shared/cases/** and map every case (GROUP.name) → {valid, invalid} text.
// The group const name (ATOMIC, OBJECT, STRING_FORMAT, REALWORLD, …) matches the
// caseKey prefix the audit + results use, so the keys line up 1:1.
function buildSampleMap() {
  const map = new Map();
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name === 'types.ts') continue;
      const src = fs.readFileSync(full, 'utf8');
      const sf = ts.createSourceFile(full, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      for (const stmt of sf.statements) {
        if (!ts.isVariableStatement(stmt)) continue;
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          // `export const GROUP = {…} as const satisfies …` — unwrap as/satisfies. The
          // re-export index files (`{ATOMIC, ARRAY, …}`) carry only identifiers → skip.
          let init = decl.initializer;
          while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init))) init = init.expression;
          if (!init || !ts.isObjectLiteralExpression(init)) continue;
          const group = decl.name.text;
          for (const prop of init.properties) {
            if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) continue;
            const name = ts.isStringLiteralLike(prop.name) || ts.isIdentifier(prop.name) ? prop.name.text : null;
            if (!name) continue;
            let getSamples = null;
            for (const member of prop.initializer.properties) {
              const mname =
                (ts.isPropertyAssignment(member) || ts.isMethodDeclaration(member)) &&
                (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name))
                  ? member.name.text
                  : null;
              if (mname !== 'getSamples') continue;
              getSamples = ts.isPropertyAssignment(member) ? member.initializer : member;
            }
            const obj = returnedObjectLiteral(getSamples);
            if (!obj) continue;
            const valid = sampleArrayText(obj, 'valid', sf);
            const invalid = sampleArrayText(obj, 'invalid', sf);
            if (valid != null && invalid != null) map.set(`${group}.${name}`, {valid, invalid});
          }
        }
      }
    }
  };
  if (fs.existsSync(SHARED_CASES_DIR)) visit(SHARED_CASES_DIR);
  return map;
}

// Memoized — parsed once, read by the validation + alignment builders.
let _sampleMap = null;
function sampleMap() {
  return (_sampleMap ??= buildSampleMap());
}

// The tested-data block as one highlightable TS snippet: comment-labelled valid /
// invalid sample arrays. Routed through the same Shiki pipeline as the source columns
// (runtime /api/highlight in dev, baked by embed-panel-highlights for the static deploy).
function samplesCodeFor(key) {
  const samp = sampleMap().get(key);
  if (!samp) return undefined;
  // Trailing `;` on each array so the prettier pre-format reads them as two separate
  // statements — without it `[a]\n[b]` parses as array indexing (`[a][b]`).
  return `// valid\n${samp.valid};\n\n// invalid\n${samp.invalid};`;
}

// ── reading a results directory ──────────────────────────────────────────────
// The reader lives in container/benchmarks/_lib/read-results.mjs so this and the
// container-side aggregate.mjs share ONE definition of "is this a competitor result".
// They used to carry a copy each, and the same bug landed in both: the typecost lane
// writes `{competitor, cases, total}`, so a shape test on those two fields absorbed
// `<form>.typecost.json` as a sixth competitor. See that module for the full story.
//
// Wrapped (not just re-exported) so the "what was skipped" note keeps going to stderr
// the way every other gen-docs diagnostic does. The bench-lane contract tests import the
// reader through this entry point.
export function readCompetitorResults(dir) {
  return readResultsDir(dir, (message) => process.stderr.write(`note: gen-docs ${message}\n`));
}

// competitor name → (case key → case), the lookup every bench table reads from.
const byCompetitor = (results) => new Map(results.map((r) => [r.competitor, new Map(r.cases.map((c) => [c.key, c]))]));

// ── runtime (validation) bench ───────────────────────────────────────────────
// Split into TWO benches that mirror the suite pages: `validation` (the data types
// + realworld DTOs) and `validation-formats` (the format-validation suite). DATETIME
// lives in BOTH suites, so the split is by the CASE's suite, not by section.
function buildValidationBench() {
  const results = readCompetitorResults(RESULTS_DIR);
  if (results.length === 0) {
    process.stderr.write(`skip validation bench: no competitor results in ${RESULTS_DIR} (run \`pnpm run bench\` first)\n`);
    return 0;
  }
  const competitors = results.map((r) => r.competitor).sort(order);
  const byComp = byCompetitor(results);
  // case list = the longest competitor's cases (preserves suite/group/name order).
  const rows = results.reduce((longest, r) => (r.cases.length > longest.length ? r.cases : longest), []);

  // group sources per competitor once
  const sources = new Map();
  for (const comp of competitors) sources.set(comp, extractCaseSources(path.join(COMPETITORS_DIR, comp, 'cases.ts')));

  // Two benches, split by suite. The JSON Schema cases are NOT a third one: they
  // are the `JSON_SCHEMA` group inside each of these two suites (structural
  // keywords in validation, value constraints in format-validation), so they
  // render as one more section per page. They used to be their own bench, which
  // framed the lane as "who can consume a document" and left every column but
  // ajv reading not-supported; each competitor now states the same constraint in
  // its own dialect, which is the question the rest of the table already asks.
  //
  // The `strict` suite rides along in the first of them, as its own `STRICT` section.
  // It used to be a THIRD bench with its own page and a per-runtime column dimension
  // (each library once per JavaScript engine), which made a table nobody could read.
  // The per-engine counter it exercised is still pinned, by checkEngineBranch in
  // scripts/website/bench-data/bench.mjs — a hard failure, not a published column.
  const isFormat = (row) => row.suite === 'format-validation';
  const core = emitValidationBench('validation', 'Validation', rows.filter((row) => !isFormat(row)), competitors, byComp, sources);
  const formats = emitValidationBench('validation-formats', 'Validation Formats', rows.filter(isFormat), competitors, byComp, sources);
  return core + formats;
}

// Emit one validation bench (index.json + per-case source JSON) for a filtered set of
// rows. Both the is-valid and validation-errors metrics ship; the page picks one.
function emitValidationBench(outName, label, rows, competitors, byComp, sources) {
  const sectionMap = new Map(); // group → {key,label,cases[]}
  const outDir = path.join(OUT_ROOT, outName);
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});

  for (const row of rows) {
    // Split the mixed DATETIME group into a Date section (JS Date / date-string
    // formats) and a Temporal section (Temporal.* types — instant, plainDate, etc.).
    let group = row.group;
    if (group === 'DATETIME') {
      const casePart = row.key.slice(row.group.length + 1);
      group = /^date($|_)/.test(casePart) ? 'DATE' : 'TEMPORAL';
    }
    if (!sectionMap.has(group)) sectionMap.set(group, {key: group, label: sectionLabel(group), cases: []});
    const resultsForCase = {};
    const detailComps = [];
    for (const comp of competitors) {
      const c = byComp.get(comp)?.get(row.key);
      const metricResult = {};
      if (c?.validate) metricResult.validate = toMetric(c.validate);
      if (c?.validationErrors) metricResult.validationErrors = toMetric(c.validationErrors);
      if (Object.keys(metricResult).length > 0) resultsForCase[comp] = metricResult;
      // Per-metric source so the hover shows ONLY the function this page measures.
      const caseSources = sources.get(comp)?.get(row.key);
      if (caseSources) detailComps.push({name: comp, sources: caseSources});
    }
    sectionMap.get(group).cases.push({key: safeKey(row.key), title: row.name, results: resultsForCase});
    // samples are shared across competitors → one block per case (absent key omitted).
    fs.writeFileSync(path.join(outDir, `${safeKey(row.key)}.json`), JSON.stringify({competitors: detailComps, samplesCode: samplesCodeFor(row.key)}));
  }

  const index = {
    bench: outName,
    label,
    unit: 'ops',
    showInvalid: true,
    hasSamples: true,
    metrics: [
      {key: 'validate', label: 'Is-valid', metricLabel: 'createValidateFn — boolean is-valid check (ops/sec, higher is better)'},
      {
        key: 'validationErrors',
        label: 'Validation errors',
        metricLabel: 'getValidationErrors — full error report (ops/sec, higher is better)',
      },
    ],
    competitors,
    versions: ENV?.versions,
    meta: metaBlock(),
    sections: [...sectionMap.values()],
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  return rows.length;
}

// ── typecost bench ───────────────────────────────────────────────────────────
// Forms (not runtime competitors): each measures TypeScript type-instantiation
// count per case (lower is better). Source for the hover comes from each form's
// authoring file, resolved against COMPETITORS_DIR — so `srcFile` is a path
// relative to container/benchmarks/competitors/, NOT an npm specifier (the two
// mion rows used to name `@mionjs/run-types/…`, which resolves to a
// directory that does not exist; extractCaseSources returns empty for a missing
// file, so both columns shipped with no hover source at all).
//
// AJV has no row here, and that asymmetry is the page's point: it validates a
// JSON Schema document but recovers NO static type from it, so there is no
// type cost to measure.
const TYPECOST_FORMS = [
  {id: 'mion-type', label: 'mion (type)', srcFile: 'mion/cases.ts', srcVar: 'cases'},
  {id: 'mion-schema', label: 'mion (builder)', srcFile: 'mion/schemaCases.ts', srcVar: 'schemaCases'},
  {id: 'typia', label: 'typia', srcFile: 'typia/cases.ts', srcVar: 'cases'},
  {id: 'typebox', label: 'typebox', srcFile: 'typebox/cases.ts', srcVar: 'cases'},
  {id: 'zod', label: 'zod', srcFile: 'zod/cases.ts', srcVar: 'cases'},
];

function buildTypecostBench() {
  const byForm = new Map(); // id → Map(key → instantiations)
  const meta = new Map(); // key → {group, name}
  const orderedKeys = [];
  for (const form of TYPECOST_FORMS) {
    const file = path.join(RESULTS_DIR, `${form.id}.typecost.json`);
    if (!fs.existsSync(file)) {
      byForm.set(form.id, new Map());
      continue;
    }
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const m = new Map();
    for (const c of d.cases) {
      m.set(c.key, c.instantiations);
      if (!meta.has(c.key)) {
        meta.set(c.key, {group: c.group, name: c.name});
        orderedKeys.push(c.key);
      }
    }
    byForm.set(form.id, m);
  }
  if (orderedKeys.length === 0) {
    process.stderr.write(`skip typecost bench: no results/*.typecost.json in ${RESULTS_DIR} (run \`pnpm rtx bench typecost\`)\n`);
    return 0;
  }

  // Every declared form is a column, always. A form whose results are missing or
  // empty (failed non-fatal typia install, dep not in the image yet, partial
  // re-run over a stale .docdata) renders as n/a cells instead of vanishing — a
  // silently disappearing column reads as "removed on purpose" when it is really
  // "no data this run".
  const forms = TYPECOST_FORMS;
  const sources = new Map(forms.map((f) => [f.id, extractCaseSources(path.join(COMPETITORS_DIR, f.srcFile), f.srcVar)]));

  const outDir = path.join(OUT_ROOT, 'typecost');
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});

  const sectionMap = new Map();
  for (const key of orderedKeys) {
    const {group, name} = meta.get(key);
    if (!sectionMap.has(group)) sectionMap.set(group, {key: group, label: sectionLabel(group), cases: []});
    const results = {};
    const detailComps = [];
    for (const form of forms) {
      const inst = byForm.get(form.id).get(key);
      // Single metric, single path — typecost has no valid/invalid split.
      if (inst !== undefined) results[form.label] = {typecost: {valid: inst, status: 'ok'}};
      // typecost is single-metric: show the type/schema form (validate body), or the
      // error form for libraries with no cheap validator (zod). Only for a form
      // that actually produced a number: the source files are read per FORM, not
      // per measured cell, so a form whose authoring file happens to mention the
      // case would otherwise show a hover body under a cell reading n-a.
      if (inst === undefined) continue;
      const caseSources = sources.get(form.id)?.get(key);
      const source = caseSources?.validate ?? caseSources?.validationErrors;
      if (source) detailComps.push({name: form.label, source});
    }
    sectionMap.get(group).cases.push({key: safeKey(key), title: name, results});
    fs.writeFileSync(path.join(outDir, `${safeKey(key)}.json`), JSON.stringify({competitors: detailComps}));
  }

  // Each typecost form maps to the library whose installed version it measures.
  const FORM_LIB = {
    'mion-type': 'mion',
    'mion-schema': 'mion',
    typia: 'typia',
    typebox: 'typebox',
    zod: 'zod',
  };
  const versions = {};
  for (const form of forms) {
    const version = ENV?.versions?.[FORM_LIB[form.id]];
    if (version) versions[form.label] = version;
  }

  const index = {
    bench: 'typecost',
    label: 'Type Cost',
    unit: 'count',
    showInvalid: false,
    metrics: [{key: 'typecost', label: 'Type cost', metricLabel: 'TypeScript type instantiations — lower is better'}],
    competitors: forms.map((f) => f.label),
    versions,
    meta: metaBlock(true),
    sections: [...sectionMap.values()],
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  return orderedKeys.length;
}

// ── alignment (correctness) bench ────────────────────────────────────────────
// Cross-library correctness: for every case, how many shared samples each competitor
// disagrees with mion on (0 = fully aligned). Reads the alignment audit's
// joined output (container/benchmarks/results/alignment-misalignments.json, produced by
// `pnpm rtx bench audit`). Reuses the SAME competitor table as the speed pages:
// unit = count so 0 is the best (green) value and divergences ramp toward red; n-a =
// the competitor doesn't support the case. The per-case hover shows each library's
// authored schema, exactly like the validation pages.
function buildAlignmentBench() {
  const file = path.join(RESULTS_DIR, 'alignment-misalignments.json');
  if (!fs.existsSync(file)) {
    process.stderr.write(`skip alignment bench: no ${file} (run \`pnpm rtx bench audit\`)\n`);
    return 0;
  }
  const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
  const competitors = [...(audit.competitors ?? [])].sort(order);
  const coverage = audit.coverage ?? {};

  // Per-case disagreement DATA (not just counts): the exact sample value each
  // competitor diverged on, from the audit records. Deduped per value repr — the
  // audit logs each value once per run pass, so reprs repeat — which lines the count
  // up with the table cell. Every divergence today is "competitor accepts a value
  // mion rejects", but we bucket by the competitor's verdict so the display
  // stays correct if a future audit ever records the reverse.
  const divByCase = new Map(); // caseKey → Map(comp → {accepts:Set, rejects:Set})
  for (const rec of audit.records ?? []) {
    if (!divByCase.has(rec.caseKey)) divByCase.set(rec.caseKey, new Map());
    const perComp = divByCase.get(rec.caseKey);
    if (!perComp.has(rec.competitor)) perComp.set(rec.competitor, {accepts: new Set(), rejects: new Set()});
    (rec.got ? perComp.get(rec.competitor).accepts : perComp.get(rec.competitor).rejects).add(rec.sampleValueRepr);
  }

  // Case universe + metadata from the union of every competitor's coverage; the
  // per-(case,competitor) divergence count comes from the same coverage entries.
  const caseMeta = new Map(); // caseKey → {suite, group, name}
  const byCaseComp = new Map(); // caseKey → Map(comp → divergences)
  for (const comp of competitors) {
    for (const entry of coverage[comp] ?? []) {
      if (!caseMeta.has(entry.caseKey)) caseMeta.set(entry.caseKey, {suite: entry.suite, group: entry.group, name: entry.name});
      if (!byCaseComp.has(entry.caseKey)) byCaseComp.set(entry.caseKey, new Map());
      byCaseComp.get(entry.caseKey).set(comp, entry.divergences);
    }
  }
  if (caseMeta.size === 0) {
    process.stderr.write(`skip alignment bench: no coverage in ${file}\n`);
    return 0;
  }

  const sources = new Map();
  for (const comp of competitors) sources.set(comp, extractCaseSources(path.join(COMPETITORS_DIR, comp, 'cases.ts')));

  const outDir = path.join(OUT_ROOT, 'alignment');
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});

  const sectionMap = new Map();
  for (const [caseKey, meta] of caseMeta) {
    // Mirror the validation pages' DATETIME split so the sections line up.
    let group = meta.group;
    if (group === 'DATETIME') {
      const casePart = caseKey.slice(meta.group.length + 1);
      group = /^date($|_)/.test(casePart) ? 'DATE' : 'TEMPORAL';
    }
    if (!sectionMap.has(group)) sectionMap.set(group, {key: group, label: sectionLabel(group), cases: []});
    const resultsForCase = {};
    const detailComps = [];
    for (const comp of competitors) {
      const divergences = byCaseComp.get(caseKey)?.get(comp);
      // A competitor that ran the case gets a count (0 = aligned); one that didn't is
      // absent → n-a. lowerBetter (count) makes 0 the best, divergences ramp to red.
      if (divergences !== undefined) resultsForCase[comp] = {divergence: {valid: divergences, status: 'ok'}};
      const caseSources = sources.get(comp)?.get(caseKey);
      if (caseSources) detailComps.push({name: comp, sources: caseSources});
    }
    sectionMap.get(group).cases.push({key: safeKey(caseKey), title: meta.name, results: resultsForCase});
    // Disagreements: per competitor, the exact deduped values it diverged on. Present
    // only on rows that actually disagree (so the hover shows it just for those).
    const perComp = divByCase.get(caseKey);
    const disagreements = [];
    if (perComp) {
      for (const comp of competitors) {
        const buckets = perComp.get(comp);
        if (!buckets) continue;
        const accepts = [...buckets.accepts];
        const rejects = [...buckets.rejects];
        if (accepts.length || rejects.length) disagreements.push({competitor: comp, accepts, rejects});
      }
    }
    // samples are shared across competitors → one block per case (absent key omitted).
    fs.writeFileSync(
      path.join(outDir, `${safeKey(caseKey)}.json`),
      JSON.stringify({competitors: detailComps, samplesCode: samplesCodeFor(caseKey), disagreements: disagreements.length ? disagreements : undefined})
    );
  }

  const index = {
    bench: 'alignment',
    label: 'Correctness',
    unit: 'count',
    showInvalid: false,
    hasSamples: true,
    metrics: [
      {
        key: 'divergence',
        label: 'Divergences from mion',
        metricLabel: 'samples each library treats differently than mion',
        lowerBetter: true,
        cellHint: 'samples the library accepts that mion rejects (0 = fully aligned)',
      },
    ],
    competitors,
    versions: ENV?.versions,
    meta: metaBlock(),
    sections: [...sectionMap.values()],
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  return caseMeta.size;
}

// ── compile-time bench ───────────────────────────────────────────────────────
// Build-time cost of the two transform-based libraries, from
// container/benchmarks/results/{mion,typia}.compiletime.json. The whole suite is
// compiled as ONE file, on tsgo. The two libraries sit SIDE BY SIDE as columns; the rows
// break the cost down: the three measured tiers (strip = transpile only, typecheck =
// --noEmit, full = transform + emit the validators) plus the two derived costs that fall
// out of them (type-checking = typecheck − strip; transform + emit = full − typecheck).
// unit = 'count' so the ms render bare; the geomean summary is hidden (the rows are not
// comparable to each other).
const COMPILETIME_LIBS = ['mion', 'typia'];

function buildCompiletimeBench() {
  const data = {};
  const competitors = [];
  const versions = {};
  for (const lib of COMPILETIME_LIBS) {
    const file = path.join(RESULTS_DIR, `${lib}.compiletime.json`);
    if (!fs.existsSync(file)) continue;
    data[lib] = JSON.parse(fs.readFileSync(file, 'utf8'));
    competitors.push(lib);
    if (ENV?.versions?.[lib]) versions[lib] = ENV.versions[lib];
  }
  if (competitors.length === 0) {
    process.stderr.write(
      `skip compiletime bench: no results/{mion,typia}.compiletime.json in ${RESULTS_DIR} (run \`pnpm rtx bench compiletime\`)\n`
    );
    return 0;
  }

  const outDir = path.join(OUT_ROOT, 'compiletime');
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});

  // Transposed layout: the columns are build stages and the rows are the libraries, so
  // mion and typia sit one per row. "tsgo compile" is the reference: a normal tsgo
  // type-check that emits, no validators. "full runtypes" is the build that transforms +
  // emits the validators. "typecheck+full runtypes" is each toolchain's REAL total to
  // type-check AND emit validators: mion runs tsgo (compile) + the vite RT plugin
  // (build) as two passes, so tsgo-compile + full; typia's ttsc type-checks AS it
  // transforms, so its full already includes the compile (no second compile added).
  // "transform cost" = full - tsgo-compile, clamped at 0. (A strip / no-check floor was
  // dropped: type-checking this suite is within the ~100ms tsgo startup/parse noise, so a
  // strip-vs-compile delta was not meaningful.) unit = 'count' renders the ms bare;
  // aggregate + heatmap + strategy tags are off (columns are stages, not competitors).
  const rounded = (n) => Math.round(n * 100) / 100;
  const clamp0 = (n) => Math.max(0, rounded(n));
  const TIERS = [
    ['tsgo compile', (d) => d.typecheck_ms],
    ['full runtypes', (d) => d.full_ms],
    ['typecheck+full runtypes', (d, lib) => (lib === 'typia' ? d.full_ms : d.typecheck_ms + d.full_ms)],
    ['transform cost', (d) => clamp0(d.full_ms - d.typecheck_ms)],
  ];
  const tierLabels = TIERS.map(([label]) => label);
  // Every declared library is a row, always (same posture as the typecost
  // columns): a lib whose results file is absent — e.g. a quick run narrowed
  // RT_COMPILETIME_COMPETITORS to mion on a fresh .docdata — renders as a
  // row of n/a cells instead of silently dropping out of the comparison.
  const cases = COMPILETIME_LIBS.map((lib) => {
    const results = {};
    if (data[lib]) for (const [label, pick] of TIERS) results[label] = {compiletime: {valid: rounded(pick(data[lib], lib)), status: 'ok'}};
    fs.writeFileSync(path.join(outDir, `${lib}.json`), JSON.stringify({competitors: []}));
    return {key: lib, title: lib, results};
  });

  const typeNote = competitors.map((lib) => `${lib} ${data[lib].types} types`).join(' · ');
  const index = {
    bench: 'compiletime',
    label: 'Compile Time',
    unit: 'count',
    showInvalid: false,
    hideAggregate: true,
    showStrategy: false,
    metrics: [
      {
        key: 'compiletime',
        label: 'Build cost',
        metricLabel: `Whole-suite build ms on tsgo (${typeNote}), lower is better`,
        cellHint: 'whole-suite build time in milliseconds (lower is better)',
        lowerBetter: true,
      },
    ],
    competitors: tierLabels,
    versions: {},
    meta: metaBlock(),
    sections: [{key: 'libs', label: 'Whole suite, on tsgo', cases}],
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  return cases.length;
}

// The serialization + serialization-formats datasets are produced separately by
// gen-serialization-bench.mjs (inside the Node 26 container, where results/env.json
// is not mounted), so unlike the benches built here they ship without the run-
// environment meta - and their pages render no "measured on ..." banner. Stamp the
// SAME metaBlock onto their already-written index.json so EVERY benchmark page is
// consistent. cmd_website_bench runs the serialization stage before this script, so
// the files exist by now; no-op when a dataset (or env.json) is absent.
function stampSerializationMeta() {
  const meta = metaBlock();
  if (!meta) return 0;
  let stamped = 0;
  for (const bench of ['serialization', 'serialization-formats']) {
    const indexFile = path.join(OUT_ROOT, bench, 'index.json');
    if (!fs.existsSync(indexFile)) continue;
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    index.meta = meta;
    fs.writeFileSync(indexFile, JSON.stringify(index));
    stamped++;
  }
  return stamped;
}

if (process.argv[1] && process.argv[1].endsWith('gen-docs.mjs')) {
  const v = buildValidationBench();
  process.stdout.write(`validation bench: ${v} cases → container/website/public/bench-data/validation/\n`);
  const t = buildTypecostBench();
  process.stdout.write(`typecost bench: ${t} cases → container/website/public/bench-data/typecost/\n`);
  const c = buildCompiletimeBench();
  process.stdout.write(`compiletime bench: ${c} cases → container/website/public/bench-data/compiletime/\n`);
  const a = buildAlignmentBench();
  process.stdout.write(`alignment bench: ${a} cases → container/website/public/bench-data/alignment/\n`);
  const sm = stampSerializationMeta();
  process.stdout.write(`serialization meta: stamped ${sm} index(es) → container/website/public/bench-data/{serialization,serialization-formats}/\n`);
}
