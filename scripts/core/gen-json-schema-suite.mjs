// The official JSON-Schema-Test-Suite conformance pipeline (draft 2020-12).
//
// The suite is a root devDependency pinned to a full commit SHA
// (`json-schema-test-suite` in package.json), so the JSON lives under
// node_modules and nothing is vendored. This script turns it into the lane at
// packages/ts-runtypes/test/json-schema-official/:
//
//   triage    Classify every schema group (remote / proto-literal /
//             unsupported-input / ok) into the committed triage.json. The
//             unsupported-input verdicts come from real tsc probes of a
//             one-call-site snippet against `runTypeFromJsonSchema`'s
//             ExactJsonSchema overloads — a type error at the call site means
//             the door's input contract rejects the document. Minutes of work,
//             run only when the suite pin changes.
//   generate  Emit one strongly typed TS module per suite file into the
//             GITIGNORED generated/ tree: `ok` groups become `as const` schema
//             consts with a real createValidateFn(runTypeFromJsonSchema(s))
//             call site (the resolver reads the literal TYPE, so plain JSON
//             imports can never work); everything else is emitted data-only so
//             the report still counts it. Refuses to run when triage.json was
//             derived from a different suite commit than the lockfile pins.
//   report    Render results.json (written by the official.test.ts driver) into
//             the committed CONFORMANCE.md; `--update-ledger` reconciles
//             known-divergences.json with observed reality (preserving
//             hand-edited byDesign/note fields on surviving entries).
//
// Upgrading the suite: bump the SHA in package.json, `pnpm install
// --no-frozen-lockfile`, re-run triage + generate, run the lane, reconcile the
// ledger, re-run report. Functions are exported for generator.test.ts.

import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, info, reportCliError, success, warn} from '../lib/proc.mjs';

const SUITE_PKG = 'json-schema-test-suite';
const SUITE_TESTS_DIR = join(REPO_ROOT, 'node_modules', SUITE_PKG, 'tests', 'draft2020-12');
const LANE_DIR = join(REPO_ROOT, 'packages/ts-runtypes/test/json-schema-official');
const GENERATED_DIR = join(LANE_DIR, 'generated');
const TRIAGE_FILE = join(LANE_DIR, 'triage.json');
const QUARANTINE_FILE = join(LANE_DIR, 'quarantine.json');
const LEDGER_FILE = join(LANE_DIR, 'known-divergences.json');
const RESULTS_FILE = join(LANE_DIR, 'results.json');
const CONFORMANCE_FILE = join(LANE_DIR, 'CONFORMANCE.md');

// refRemote.json is wholly remote-dependent (every group needs the suite's
// localhost:1234 server); the lane skips the file outright.
const SKIPPED_FILES = new Set(['refRemote.json']);

// ── suite enumeration ────────────────────────────────────────────────────────

/** List the consumed suite files as {label, path} — the required draft2020-12
 *  set plus optional/format, refRemote excluded. Labels are the suite-relative
 *  posix paths ('allOf.json', 'optional/format/date.json'). **/
export function listSuiteFiles(testsDir = SUITE_TESTS_DIR) {
  if (!existsSync(testsDir)) die(`suite not installed at ${testsDir} — run pnpm install first.`);
  const files = [];
  for (const name of readdirSync(testsDir).sort()) {
    if (name.endsWith('.json') && !SKIPPED_FILES.has(name)) files.push({label: name, path: join(testsDir, name)});
  }
  const formatDir = join(testsDir, 'optional', 'format');
  if (existsSync(formatDir)) {
    for (const name of readdirSync(formatDir).sort()) {
      if (name.endsWith('.json')) files.push({label: `optional/format/${name}`, path: join(formatDir, name)});
    }
  }
  return files;
}

/** Load one suite file into [{key, description, schema, tests}] with keys made
 *  collision-safe within the file (duplicate descriptions get ' [i]'). **/
export function loadSuiteFile(label, path) {
  const groups = JSON.parse(readFileSync(path, 'utf8'));
  const seen = new Map();
  return groups.map((group) => {
    const n = seen.get(group.description) ?? 0;
    seen.set(group.description, n + 1);
    const description = n === 0 ? group.description : `${group.description} [${n}]`;
    return {key: `${label} :: ${description}`, description, schema: group.schema, tests: group.tests};
  });
}

// ── group classification helpers ─────────────────────────────────────────────

/** True when the group's schema reaches for the suite's remote-ref server. **/
export const isRemoteGroup = (group) => JSON.stringify(group.schema).includes('localhost:1234');

/** True when any object key anywhere in the value is __proto__ — such a value
 *  cannot be emitted as an object literal (a `__proto__:` entry in a literal
 *  sets the prototype instead of defining a property, quoted or not). **/
export function hasProtoKey(value) {
  if (Array.isArray(value)) return value.some(hasProtoKey);
  if (value === null || typeof value !== 'object') return false;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === '__proto__' || hasProtoKey(value[key])) return true;
  }
  return false;
}

/** The suite commit the lockfile pins (the git dep resolution's #sha). **/
export function suiteCommitFromLockfile(lockfilePath = join(REPO_ROOT, 'pnpm-lock.yaml')) {
  const text = readFileSync(lockfilePath, 'utf8');
  const match = text.match(/json-schema-test-suite@git\+[^#\n]*#([0-9a-f]{40})/);
  if (!match) die('could not find the json-schema-test-suite git pin in pnpm-lock.yaml.');
  return match[1];
}

// ── deterministic JSON → TS printer ──────────────────────────────────────────

const BARE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Print a JSON value as a TS expression: stable output for stable input (key
 *  order preserved from the suite), -0 kept (JSON.stringify would drop the
 *  sign), keys bare when identifier-safe. Lines fold at ~100 chars. **/
export function printTsValue(value, indent = 0) {
  const pad = '  '.repeat(indent);
  const childPad = '  '.repeat(indent + 1);
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const parts = value.map((v) => printTsValue(v, indent + 1));
    const oneLine = `[${parts.join(', ')}]`;
    if (oneLine.length <= 100 && !oneLine.includes('\n')) return oneLine;
    return `[\n${parts.map((p) => childPad + p).join(',\n')},\n${pad}]`;
  }
  const keys = Object.getOwnPropertyNames(value);
  if (keys.length === 0) return '{}';
  const parts = keys.map((k) => `${BARE_KEY.test(k) ? k : JSON.stringify(k)}: ${printTsValue(value[k], indent + 1)}`);
  const oneLine = `{${parts.join(', ')}}`;
  if (oneLine.length <= 100 && !oneLine.includes('\n')) return oneLine;
  return `{\n${parts.map((p) => childPad + p).join(',\n')},\n${pad}}`;
}

// ── triage ───────────────────────────────────────────────────────────────────

// Probe files are "placed" (virtually) next to the real compile-harness
// snippets so the relative import into src/ resolves through the actual tree.
const PROBE_DIR = join(REPO_ROOT, 'packages/ts-runtypes/test/types');
const PROBE_IMPORT = "import {runTypeFromJsonSchema} from '../../src/json-schema/runTypeFromJsonSchema.ts';";
const PROBE_CHUNK = 48;

export function probeSnippet(schema) {
  return `${PROBE_IMPORT}\nconst s = ${printTsValue(schema)} as const;\nrunTypeFromJsonSchema(s);\nexport {};\n`;
}

// Compile a batch of snippets (one virtual file each) against the REAL source
// tree and return per-snippet error strings (empty string = accepted). Mirrors
// the options proven by test/types/jsonSchemaHarness.ts; skipLibCheck + no
// @types keep the probe about our call site, not the environment.
function probeBatch(ts, snippets) {
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.esnext.temporal.d.ts'],
  };
  const virtual = new Map(snippets.map((text, i) => [join(PROBE_DIR, `__jss_probe_${i}.ts`), text]));
  const host = ts.createCompilerHost(options, true);
  const realRead = host.readFile.bind(host);
  const realExists = host.fileExists.bind(host);
  host.readFile = (f) => virtual.get(f) ?? realRead(f);
  host.fileExists = (f) => virtual.has(f) || realExists(f);
  host.writeFile = () => {};
  const program = ts.createProgram([...virtual.keys()], options, host);
  return [...virtual.keys()].map((file) => {
    const source = program.getSourceFile(file);
    const diags = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)].filter(
      (d) => d.category === ts.DiagnosticCategory.Error
    );
    if (diags.length === 0) return '';
    const first = diags[0];
    const message = ts.flattenDiagnosticMessageText(first.messageText, ' ').slice(0, 200);
    return `TS${first.code}: ${message}`;
  });
}

export async function runTriage() {
  const require = createRequire(join(REPO_ROOT, 'package.json'));
  const ts = require('typescript');
  const suiteCommit = suiteCommitFromLockfile();
  const groups = {};
  const probes = [];
  for (const {label, path} of listSuiteFiles()) {
    for (const group of loadSuiteFile(label, path)) {
      if (isRemoteGroup(group)) groups[group.key] = {verdict: 'remote'};
      else if (hasProtoKey(group.schema) || group.tests.some((t) => hasProtoKey(t.data))) groups[group.key] = {verdict: 'proto-literal'};
      else probes.push(group);
    }
  }
  info(`triage: ${probes.length} groups to type-probe (${Object.keys(groups).length} pre-classified) ...`);
  for (let at = 0; at < probes.length; at += PROBE_CHUNK) {
    const batch = probes.slice(at, at + PROBE_CHUNK);
    const errors = probeBatch(ts, batch.map((g) => probeSnippet(g.schema)));
    batch.forEach((group, i) => {
      groups[group.key] = errors[i] ? {verdict: 'unsupported-input', reason: errors[i]} : {verdict: 'ok'};
    });
    info(`triage: ${Math.min(at + PROBE_CHUNK, probes.length)}/${probes.length} probed`);
  }
  const sorted = Object.fromEntries(Object.keys(groups).sort().map((k) => [k, groups[k]]));
  writeFileSync(TRIAGE_FILE, `${JSON.stringify({suiteCommit, groups: sorted}, null, 2)}\n`);
  const counts = {};
  for (const {verdict} of Object.values(sorted)) counts[verdict] = (counts[verdict] ?? 0) + 1;
  success(`triage.json written: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

// ── generate ─────────────────────────────────────────────────────────────────

export function readTriage() {
  if (!existsSync(TRIAGE_FILE)) die(`missing ${TRIAGE_FILE} — run 'node scripts/core/gen-json-schema-suite.mjs triage' first.`);
  return JSON.parse(readFileSync(TRIAGE_FILE, 'utf8'));
}

function readQuarantine() {
  if (!existsSync(QUARANTINE_FILE)) return {groups: {}};
  return JSON.parse(readFileSync(QUARANTINE_FILE, 'utf8'));
}

const MODULE_HEADER = (label, suiteCommit) =>
  `// GENERATED by scripts/core/gen-json-schema-suite.mjs — do not edit.\n` +
  `// Source: ${label} from github.com/json-schema-org/JSON-Schema-Test-Suite\n` +
  `// at commit ${suiteCommit} (MIT licensed, (c) Julian Berman and contributors).\n`;

/** Emit the TS module for one suite file. Exported for generator.test.ts. **/
export function emitModule(label, groups, triageGroups, quarantineGroups, suiteCommit, harnessImport) {
  const lines = [MODULE_HEADER(label, suiteCommit)];
  lines.push(`import {createValidateFn} from '@ts-runtypes/core';`);
  lines.push(`import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';`);
  lines.push(`import {officialGroup, skippedGroup, type SuiteGroup} from '${harnessImport}';`);
  lines.push('');
  lines.push('export const groups: SuiteGroup[] = [];');
  groups.forEach((group, i) => {
    const verdict = quarantineGroups[group.key]
      ? {verdict: 'transform-halt', reason: quarantineGroups[group.key].reason ?? ''}
      : triageGroups[group.key];
    if (!verdict) die(`generate: '${group.key}' missing from triage.json — re-run triage.`);
    const file = JSON.stringify(label);
    const desc = JSON.stringify(group.description);
    lines.push('');
    if (verdict.verdict === 'ok') {
      lines.push(`const s_${i} = ${printTsValue(group.schema)} as const;`);
      const cases = group.tests
        .map((t) => `  {description: ${JSON.stringify(t.description)}, data: ${printTsValue(t.data, 1)}, valid: ${t.valid}},`)
        .join('\n');
      lines.push(`groups.push(officialGroup(${file}, ${desc}, s_${i}, () => createValidateFn(runTypeFromJsonSchema(s_${i})), [\n${cases}\n]));`);
    } else {
      const reason = JSON.stringify(verdict.reason ?? '');
      lines.push(`groups.push(skippedGroup(${file}, ${desc}, ${JSON.stringify(verdict.verdict)}, ${reason}, ${group.tests.length}));`);
    }
  });
  lines.push('');
  return lines.join('\n');
}

/** Module file path (relative to generated/) for a suite file label. **/
export const moduleRelPath = (label) => `draft2020-12/${label.replace('optional/format/', 'optional-format/').replace(/\.json$/, '.ts')}`;

export function runGenerate({testsDir = SUITE_TESTS_DIR, outDir = GENERATED_DIR, triage = readTriage(), quarantine = readQuarantine(), suiteCommit = suiteCommitFromLockfile(), write = true} = {}) {
  if (triage.suiteCommit !== suiteCommit)
    die(`triage.json was derived from suite commit ${triage.suiteCommit} but the lockfile pins ${suiteCommit} — re-run triage.`);
  const emitted = new Map();
  const barrel = [MODULE_HEADER('index (all files)', suiteCommit), `import type {SuiteGroup} from '../harness.ts';`, ''];
  const imports = [];
  const entries = [];
  for (const {label, path} of listSuiteFiles(testsDir)) {
    const rel = moduleRelPath(label);
    const depth = rel.split('/').length; // modules sit under generated/<rel>
    const harnessImport = `${'../'.repeat(depth)}harness.ts`;
    const groups = loadSuiteFile(label, path);
    emitted.set(rel, emitModule(label, groups, triage.groups, quarantine.groups ?? {}, suiteCommit, harnessImport));
    const id = `m${imports.length}`;
    imports.push(`import {groups as ${id}} from './${rel}';`);
    entries.push(`  {file: ${JSON.stringify(label)}, groups: ${id}},`);
  }
  barrel.push(...imports, '', 'export const allModules: {file: string; groups: SuiteGroup[]}[] = [', ...entries, '];', '');
  emitted.set('index.ts', barrel.join('\n'));
  if (write) {
    rmSync(outDir, {recursive: true, force: true});
    for (const [rel, text] of emitted) {
      const full = join(outDir, rel);
      mkdirSync(join(full, '..'), {recursive: true});
      writeFileSync(full, text);
    }
    success(`generated ${emitted.size} modules under ${outDir}`);
  }
  return emitted;
}

// ── report ───────────────────────────────────────────────────────────────────

function readResults() {
  if (!existsSync(RESULTS_FILE)) die(`missing ${RESULTS_FILE} — run the lane first: pnpm exec vitest run --project json-schema-official.`);
  return JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
}

function readLedger() {
  if (!existsSync(LEDGER_FILE)) return {entries: []};
  return JSON.parse(readFileSync(LEDGER_FILE, 'utf8'));
}

export const ledgerKey = (e) => `${e.file} :: ${e.group} :: ${e.case}`;

/** All divergence entries the results imply (case mismatches + build-rejected
 *  groups as a single '*' entry each). **/
export function divergencesFromResults(results) {
  const out = [];
  for (const g of results.groups) {
    if (g.outcome === 'build-rejected') {
      out.push({file: g.file, group: g.group, case: '*', expected: 'builds', observed: `build-rejected: ${g.reason}`});
      continue;
    }
    for (const c of g.cases) {
      if (c.observed !== c.expected) out.push({file: g.file, group: g.group, case: c.description, expected: c.expected, observed: c.observed});
    }
  }
  return out;
}

// Files whose divergences are BY-DESIGN policy, not bugs: the required-set
// format.json and content.json test that `format` / content keywords are
// annotation-only by default, while RunTypes deliberately enforces both (the
// same documented stance the bench spec corpus takes vs ajv). Seeded entries
// elsewhere start byDesign: false; hand-edited flags survive re-seeding.
const BY_DESIGN_FILES = new Set(['format.json', 'content.json']);

function updateLedger(results) {
  const previous = new Map(readLedger().entries.map((e) => [ledgerKey(e), e]));
  const entries = divergencesFromResults(results).map((e) => {
    const kept = previous.get(ledgerKey(e));
    previous.delete(ledgerKey(e));
    const byDesign = kept?.byDesign ?? BY_DESIGN_FILES.has(e.file);
    return {...e, byDesign, note: kept?.note ?? ''};
  });
  for (const stale of previous.values()) warn(`ledger entry no longer observed (dropped): ${ledgerKey(stale)}`);
  entries.sort((a, b) => ledgerKey(a).localeCompare(ledgerKey(b)));
  writeFileSync(LEDGER_FILE, `${JSON.stringify({entries}, null, 2)}\n`);
  success(`known-divergences.json updated: ${entries.length} entries.`);
}

function renderConformance(results) {
  const perFile = new Map();
  const row = (file) => {
    if (!perFile.has(file)) perFile.set(file, {cases: 0, conforming: 0, byDesign: 0, open: 0, buildRejected: 0, unsupported: 0, skipped: 0});
    return perFile.get(file);
  };
  const ledger = new Map(readLedger().entries.map((e) => [ledgerKey(e), e]));
  for (const g of results.groups) {
    const r = row(g.file);
    if (g.outcome === 'build-rejected') {
      r.cases += g.caseCount;
      r.buildRejected += g.caseCount;
      continue;
    }
    for (const c of g.cases) {
      r.cases += 1;
      if (c.observed === c.expected) r.conforming += 1;
      else if (ledger.get(`${g.file} :: ${g.group} :: ${c.description}`)?.byDesign) r.byDesign += 1;
      else r.open += 1;
    }
  }
  for (const s of results.skipped) {
    const r = row(s.file);
    r.cases += s.caseCount;
    if (s.verdict === 'unsupported-input') r.unsupported += s.caseCount;
    else r.skipped += s.caseCount;
  }
  const files = [...perFile.keys()].sort((a, b) => a.localeCompare(b));
  const total = {cases: 0, conforming: 0, byDesign: 0, open: 0, buildRejected: 0, unsupported: 0, skipped: 0};
  const lines = [
    '# JSON Schema Test Suite conformance (draft 2020-12)',
    '',
    `Suite pinned at json-schema-org/JSON-Schema-Test-Suite@${results.suiteCommit}; refRemote.json`,
    'and the remotes/ tree are out of scope. Generated by',
    '`node scripts/core/gen-json-schema-suite.mjs report` from the lane\'s results.json;',
    'see README.md for the taxonomy and the upgrade procedure. Do not edit by hand.',
    '',
    '| File | Cases | Conforming | By-design div. | Open div. | Build-rejected | Unsupported input | Skipped |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const file of files) {
    const r = perFile.get(file);
    for (const k of Object.keys(total)) total[k] += r[k];
    lines.push(`| ${file} | ${r.cases} | ${r.conforming} | ${r.byDesign} | ${r.open} | ${r.buildRejected} | ${r.unsupported} | ${r.skipped} |`);
  }
  lines.push(`| **total** | **${total.cases}** | **${total.conforming}** | **${total.byDesign}** | **${total.open}** | **${total.buildRejected}** | **${total.unsupported}** | **${total.skipped}** |`);
  lines.push('');
  return lines.join('\n');
}

function runReport(args) {
  const results = readResults();
  if (args.includes('--update-ledger')) updateLedger(results);
  writeFileSync(CONFORMANCE_FILE, renderConformance(results));
  success(`CONFORMANCE.md written.`);
}

// ── dispatch ─────────────────────────────────────────────────────────────────

export async function main(args) {
  const [command, ...rest] = args;
  if (command === 'triage') return runTriage();
  if (command === 'generate') return void runGenerate();
  if (command === 'report') return runReport(rest);
  die(`usage: gen-json-schema-suite.mjs <triage|generate|report [--update-ledger]>`);
}

if (import.meta.main) {
  loadEnv();
  main(process.argv.slice(2)).catch(reportCliError);
}
