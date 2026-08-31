// Type-checking cost benchmark — measures the TypeScript **type instantiations**
// a developer pays to type-check the static type each library produces for a case.
//
// Reworked for the per-competitor layout (container/benchmarks/competitors/<lib>/cases.ts).
// For every shared case it assembles a tiny self-contained .ts probe per FORM and
// compiles it in isolation through the TypeScript compiler API, reading
// `program.getInstantiationCount()` (baseline-subtracted so the number is the
// marginal cost of resolving THAT case's type, not the import scaffold):
//
//   ts-go (type)    type T = <the TS type>;             const x: T = <sample>;
//   ts-go (builder)  const s = RT.…; type T = InferType<typeof s>;  const x: T = …;
//   zod             const s = z.…;  type T = z.infer<typeof s>;  const x: T = …;
//   typebox         const s = Type.…; type T = Static<typeof s>; const x: T = …;
//   typia           type T = <the TS type, incl. `& tags.*`>;  const x: T = <sample>;
//   ajv             — (JSON Schema has no static type inference)
//
// typia, like ts-go(type), is a PURE-TYPE form: its cost is the cost of resolving
// the literal `T` users write — no schema object, no transform needed (the runtime
// transform is irrelevant to type-checking cost). It still earns its own column
// because the FORMAT suites express constraints as typia tag intersections
// (`string & tags.MinLength<…>`) whose instantiation cost differs from the
// `Format*` brands, and because typia supports a different subset of cases.
//
// The probe sources are EXTRACTED (TS compiler API) from the real competitor maps:
//   - ts-go (type):   the `createValidateFn<TYPE>()` type argument per case in
//                     competitors/mion/cases.ts.
//   - typia:          the `typia.createIs<TYPE>()` type argument per case in
//                     competitors/typia/cases.ts.
//   - ts-go (builder): the `createValidateFn(EXPR)` argument per case in
//                     competitors/mion/schemaCases.ts.
//   - zod / typebox:  the `const schema = EXPR` declared inside each case's
//                     build / buildErrors thunk in competitors/{zod,typebox}/cases.ts.
// The type forms (ts-go type, typia) author each entry as a `{build, buildErrors}`
// object — optionally wrapped in an IIFE `(() => { …local decls…; return {…}; })()`
// so a case can declare a local enum/interface/type the `<T>` references; the
// literal type argument rides the `build` thunk's `createValidateFn<T>()` /
// `typia.createIs<T>()` call. The schema form (ts-go) is a LAZY `() => …` thunk;
// zod/typebox build their schema as `const schema = EXPR` inside a build/buildErrors
// thunk. Each extractor unwraps its wrapper, preserving the local declarations so
// `<T>`/`EXPR` resolves where written.
//
// Module resolution: each form's probe is emitted INTO the relevant competitor
// directory so Node-style `node_modules` resolution + each package's `exports`
// map resolve the bare imports naturally — `mion`(+/schema,
// /formats, /formats/temporal) from competitors/mion/node_modules
// (bind-mounted at run time), `zod` / `@sinclair/typebox` from their own image
// node_modules, and the realworld interfaces via the verbatim relative import.
// `paths` (see OPTIONS) additionally pins the marker subpaths to the mounted
// dist as a deterministic safety net.

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {spawnSync} from 'node:child_process';
import {makeExtractors} from '../_lib/extract-cases.mjs';

// Sample loading imports the shared cases as .ts via Node's type stripping; some
// `getSamples()` thunks contain `enum`, which plain strip-only mode rejects. When
// the running Node supports it, re-exec ourselves ONCE with
// --experimental-transform-types (enum-aware) so the value-forcing path works.
// Node >= 25 REMOVED that flag (type stripping is strip-only / unflagged), so we
// probe for it first and, when absent, skip the re-exec and run in-process —
// enum-containing samples then degrade to declare-only (still correct, just less
// value-forcing; loadSampleValues catches the import error). Guarded by a
// sentinel so it can't loop.
const TRANSFORM_FLAG = '--experimental-transform-types';
function nodeSupportsFlag(flag) {
  const probe = spawnSync(process.execPath, [flag, '-e', '0'], {stdio: 'ignore'});
  return probe.error === undefined && probe.status === 0;
}
if (!process.execArgv.includes(TRANSFORM_FLAG) && !process.env.__TYPECOST_REEXEC && nodeSupportsFlag(TRANSFORM_FLAG)) {
  const self = url.fileURLToPath(import.meta.url);
  const child = spawnSync(process.execPath, [TRANSFORM_FLAG, self, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {...process.env, __TYPECOST_REEXEC: '1'},
  });
  if (child.status !== null && child.error === undefined) process.exit(child.status);
  // spawn failed (e.g. flag rejected): continue in the current process.
}

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
// Benchmark root: /app in the container (typecost/ lives directly under it).
const ROOT = path.resolve(HERE, '..');
const COMPETITORS = path.join(ROOT, 'competitors');
const TSGO_DIR = path.join(COMPETITORS, 'mion');
const ZOD_DIR = path.join(COMPETITORS, 'zod');
const TYPEBOX_DIR = path.join(COMPETITORS, 'typebox');
const TYPIA_DIR = path.join(COMPETITORS, 'typia');

const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? '/app/results';

// One probe path PER competitor directory: the path decides where bare imports
// (node_modules walk) and the verbatim relative realworld import resolve from.
const PROBE_TSGO = path.join(TSGO_DIR, '__typecost_probe.ts');
const PROBE_ZOD = path.join(ZOD_DIR, '__typecost_probe.ts');
const PROBE_TYPEBOX = path.join(TYPEBOX_DIR, '__typecost_probe.ts');
const PROBE_TYPIA = path.join(TYPIA_DIR, '__typecost_probe.ts');
const PROBE_PATHS = new Set([PROBE_TSGO, PROBE_ZOD, PROBE_TYPEBOX, PROBE_TYPIA]);

const MARKER = path.join(TSGO_DIR, 'node_modules', '@mionjs', 'run-types', 'dist');

const OPTIONS = {
  strict: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  noUnusedLocals: false,
  noUnusedParameters: false,
  allowImportingTsExtensions: true,
  types: [],
  // TS 6.0 reports baseUrl as a deprecation *error* via getPreEmitDiagnostics;
  // keep baseUrl/paths (marker resolution fallback) but silence it for 6.x.
  ignoreDeprecations: '6.0',
  baseUrl: ROOT,
  // Deterministic pin for the bind-mounted marker subpaths (the mounted package
  // also carries a valid `exports` map, so natural node_modules resolution works
  // too — these just make it bulletproof regardless of probe location).
  paths: {
    '@mionjs/run-types': [path.join(MARKER, 'index.d.ts')],
    '@mionjs/run-types/builders': [path.join(MARKER, 'builders', 'index.d.ts')],
    '@mionjs/run-types/formats': [path.join(MARKER, 'formats', 'index.d.ts')],
    '@mionjs/run-types/formats/temporal': [path.join(MARKER, 'formats', 'datetime', 'temporalFormats.d.ts')],
  },
  // esnext.full + esnext.temporal: the shared DateTime suites reference
  // `typeof Temporal`, and the marker's own build pins TypeScript 6.0.3 with
  // esnext.temporal (so the type cost is measured the same way the project
  // type-checks). Both libs ship with the pinned 6.0.3 in typecost/package.json.
  lib: ['lib.esnext.full.d.ts', 'lib.esnext.temporal.d.ts'],
};

// ── source extraction ───────────────────────────────────────────────────────
// The AST helpers live in the shared _lib so compiletime/compiletime.mjs reads the
// competitor maps the exact same way (one source of truth). `ts` is injected here.

const {extractTsGo, extractSchemaCompetitor, extractTypeForm} = makeExtractors(ts);

// ── probe assembly ──────────────────────────────────────────────────────────

const INFERTYPE_IMPORT = `import {type InferType} from '@mionjs/run-types';`;
const TB_STATIC_IMPORT = `import {type Static as __TBStatic} from '@sinclair/typebox';`;

// Force TypeScript to fully RESOLVE + structurally check the recovered type by
// assigning a real value (the case's first valid sample). A bare `let x!: T`
// only declares the type and resolves it lazily; a concrete value assignment
// triggers the structural assignability walk that materializes the whole type —
// the cost users actually pay on every `const x: T = {…}`. Falls back to
// declare-only when no serializable sample exists (symbol/Temporal/etc.).
const force = (value) => (value === undefined ? `\nlet __x!: __T;\nvoid __x;\n` : `\nconst __x: __T = ${value};\nvoid __x;\n`);
const decls = (locals) => (locals.length ? locals.join('\n') + '\n' : '');

// Locals + the `__T` alias + the forcing assignment go in a BLOCK so a case-local
// redeclaration (e.g. a local `type User`) shadows a same-named preamble import
// (the realworld `import type {User}`) instead of colliding with it at module
// scope — faithful to the original IIFE/build-block scoping where it was authored.
function probeTsType(preamble, locals, typeText, value) {
  return `${preamble.join('\n')}\n{\n${decls(locals)}type __T = ${typeText};${force(value)}}\n`;
}
function probeTsSchema(preamble, locals, exprText, value) {
  const imps = preamble.includes(INFERTYPE_IMPORT) ? preamble : [...preamble, INFERTYPE_IMPORT];
  return `${imps.join('\n')}\n${decls(locals)}const __s = ${exprText};\ntype __T = InferType<typeof __s>;${force(value)}`;
}
function probeZod(preamble, locals, exprText, value) {
  return `${preamble.join('\n')}\n${decls(locals)}const __s = ${exprText};\ntype __T = z.infer<typeof __s>;${force(value)}`;
}
function probeTypebox(preamble, locals, exprText, value) {
  return `${preamble.join('\n')}\n${TB_STATIC_IMPORT}\n${decls(locals)}const __s = ${exprText};\ntype __T = __TBStatic<typeof __s>;${force(value)}`;
}

// ── isolated compile + instantiation count ──────────────────────────────────

const sfCache = new Map();
let oldProgram;

function compile(probePath, text) {
  const host = ts.createCompilerHost(OPTIONS, true);
  const baseGet = host.getSourceFile.bind(host);
  host.getSourceFile = (fn, lang, onErr, should) => {
    if (PROBE_PATHS.has(fn)) return ts.createSourceFile(fn, fn === probePath ? text : '', lang, true, ts.ScriptKind.TS);
    let cached = sfCache.get(fn);
    if (!cached) {
      cached = baseGet(fn, lang, onErr, should);
      if (cached) sfCache.set(fn, cached);
    }
    return cached;
  };
  host.fileExists = (f) => f === probePath || (!PROBE_PATHS.has(f) && ts.sys.fileExists(f));
  host.readFile = (f) => (f === probePath ? text : ts.sys.readFile(f));
  const program = ts.createProgram([probePath], OPTIONS, host, oldProgram);
  const diags = ts.getPreEmitDiagnostics(program);
  oldProgram = program;
  const errors = diags.filter((d) => d.category === ts.DiagnosticCategory.Error);
  return {count: program.getInstantiationCount(), errors};
}

// baseline = same scaffold/imports with a trivial type → fixed cost to subtract.
const baselineCache = new Map();
function baseline(key, probePath, text) {
  if (!baselineCache.has(key)) baselineCache.set(key, compile(probePath, text).count);
  return baselineCache.get(key);
}

function measure(form, baselineKey, probePath, baselineText, probeText, fallbackText) {
  let result = compile(probePath, probeText);
  // The probe assigns the case's first valid SAMPLE; some forms intentionally
  // accept a broader value set than their static type — ts-go's `noLiterals` (the
  // type stays the literal `2`, but any number validates) and the serializable-only
  // contract (a function/method member is dropped, so the data sample omits it) —
  // so the sample need not satisfy T. On such a *value* error, retry WITHOUT the
  // value to measure pure type-resolution cost. A genuine *type* error (missing
  // name, excessively-deep instantiation) still fails the retry and surfaces.
  if (result.errors.length && fallbackText && fallbackText !== probeText) {
    const retry = compile(probePath, fallbackText);
    if (!retry.errors.length) result = retry;
  }
  if (result.errors.length) return {status: 'err', n: 0, detail: ts.flattenDiagnosticMessageText(result.errors[0].messageText, ' ')};
  const base = baseline(`${form}:${baselineKey}`, probePath, baselineText);
  return {status: 'ok', n: Math.max(0, result.count - base)};
}

// ── value rendering — each case's first valid sample as a TS literal ─────────

/** Serialize a runtime value to a TS source literal. Throws on values with no
 *  faithful literal form (symbol, function, Temporal & other class instances),
 *  so the probe falls back to declare-only for that case. */
function serialize(v, depth = 0) {
  if (depth > 8) throw new Error('too deep');
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return String(v);
  if (t === 'bigint') return `${v}n`;
  if (t === 'number') return Number.isFinite(v) ? String(v) : Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity';
  if (v instanceof Date) return `new Date(${v.getTime()})`;
  if (v instanceof RegExp) return v.toString();
  if (Array.isArray(v)) return `[${v.map((x) => serialize(x, depth + 1)).join(', ')}]`;
  if (v instanceof Map)
    return `new Map([${[...v.entries()].map(([k, val]) => `[${serialize(k, depth + 1)}, ${serialize(val, depth + 1)}]`).join(', ')}])`;
  if (v instanceof Set) return `new Set([${[...v].map((x) => serialize(x, depth + 1)).join(', ')}])`;
  if (t === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error('non-plain object');
    return `{${Object.entries(v)
      .map(([k, val]) => `${JSON.stringify(k)}: ${serialize(val, depth + 1)}`)
      .join(', ')}}`;
  }
  throw new Error(`unserializable ${t}`);
}

/** Best-effort: import the shared cases (Node type-stripping; enums need the
 *  --experimental-transform-types re-exec above) and serialize each case's first
 *  valid sample to a TS literal, keyed `GROUP.case`. On ANY failure — import
 *  error or a per-case unserializable sample — that key is simply absent and its
 *  probe falls back to declare-only. The table/row structure does NOT depend on
 *  this (keys come from the ts-go map), so a failed import only loses forcing. */
async function loadSampleValues() {
  const valueByKey = new Map();
  let mod;
  try {
    mod = await import(path.join(ROOT, 'shared', 'cases', 'index.ts'));
  } catch (err) {
    console.error(`typecost: could not load shared samples (${err?.code ?? err?.message ?? err}); using declare-only probes.`);
    return valueByKey;
  }
  for (const iterated of mod.iterateCases()) {
    try {
      const valid = iterated.case.getSamples().valid;
      if (valid.length) valueByKey.set(iterated.key, serialize(valid[0]));
    } catch {
      /* no faithful literal → declare-only fallback */
    }
  }
  return valueByKey;
}

// ── run ──────────────────────────────────────────────────────────────────────

const V = "'x'"; // baseline value (type is `string`)

// RT_BENCH_CASE=<substr>: restrict the run to cases whose dotted key contains the
// (case-insensitive) substring — run ONE case across every form to inspect it
// (pair with RT_BENCH_DUMP=<exact.key> to print the probe sources). When set, the
// per-competitor results JSON is NOT rewritten (a filtered run is for inspection).
const CASE_FILTER = (process.env.RT_BENCH_CASE ?? '').toLowerCase();
const matchesFilter = (key) => !CASE_FILTER || key.toLowerCase().includes(CASE_FILTER);

async function main() {
  const tsType = extractTypeForm(path.join(TSGO_DIR, 'cases.ts'), 'cases', 'createValidateFn');
  const tsSchema = extractTsGo(path.join(TSGO_DIR, 'schemaCases.ts'), 'schemaCases', 'schema');
  const zod = extractSchemaCompetitor(path.join(ZOD_DIR, 'cases.ts'), 'cases');
  const typebox = extractSchemaCompetitor(path.join(TYPEBOX_DIR, 'cases.ts'), 'cases');
  // typia's install layer is non-fatal (container/website/Containerfile), so an
  // image where it failed simply has no node_modules for it. Degrade to an empty
  // form (every cell n/a) instead of paying ~200 probe compiles that all land as
  // 'err' — the column still renders, and this line names the cause in the log.
  const typiaInstalled = fs.existsSync(path.join(TYPIA_DIR, 'node_modules', 'typia'));
  if (!typiaInstalled) console.error('typecost: typia is not installed in this image (its install layer is non-fatal); its column renders n/a.');
  const typia = typiaInstalled ? extractTypeForm(path.join(TYPIA_DIR, 'cases.ts'), 'cases', 'typia.createIs') : {preamble: [], entries: {}, keys: []};

  const valueByKey = await loadSampleValues();

  // Authoritative case order comes from the ts-go cases.ts map (TOTAL over every
  // shared key, in file order); group/name split on the dotted key. Parsing the
  // map can't choke on enums (it's an AST read), so the table is always built.
  const keys = tsType.keys.filter(matchesFilter);
  if (!keys.length) {
    console.error(`typecost: RT_BENCH_CASE=${process.env.RT_BENCH_CASE} matched no cases.`);
    process.exit(1);
  }
  const rows = [];
  for (const key of keys) {
    const dot = key.indexOf('.');
    const group = key.slice(0, dot);
    const name = key.slice(dot + 1);
    const value = valueByKey.get(key);
    const cell = {key, group, name};

    // RT_BENCH_DUMP=<key>: print the exact self-contained probe sources for one case
    // (what actually gets compiled) and exit. Debugging aid.
    if (process.env.RT_BENCH_DUMP === key) {
      const t = tsType.entries[key];
      const s = tsSchema.entries[key];
      const tp = typia.entries[key];
      if (t) console.log(`\n===== ts-go(type) =====\n${probeTsType(tsType.preamble, t.locals, t.typeText, value)}`);
      if (s) console.log(`\n===== ts-go(builder) =====\n${probeTsSchema(tsSchema.preamble, s.locals, s.arg.text, value)}`);
      if (zod.entries[key]) console.log(`\n===== zod =====\n${probeZod(zod.preamble, zod.entries[key].locals, zod.entries[key].exprText, value)}`);
      if (typebox.entries[key]) console.log(`\n===== typebox =====\n${probeTypebox(typebox.preamble, typebox.entries[key].locals, typebox.entries[key].exprText, value)}`);
      if (tp) console.log(`\n===== typia =====\n${probeTsType(typia.preamble, tp.locals, tp.typeText, value)}`);
      process.exit(0);
    }

    const t = tsType.entries[key];
    cell.tsType = t
      ? measure('tsType', 'tsgo', PROBE_TSGO, probeTsType(tsType.preamble, [], 'string', V), probeTsType(tsType.preamble, t.locals, t.typeText, value), probeTsType(tsType.preamble, t.locals, t.typeText, undefined))
      : {status: 'na'};

    const s = tsSchema.entries[key];
    cell.tsSchema = s
      ? measure('tsSchema', 'tsgo', PROBE_TSGO, probeTsSchema(tsSchema.preamble, [], 'RT.string()', V), probeTsSchema(tsSchema.preamble, s.locals, s.arg.text, value), probeTsSchema(tsSchema.preamble, s.locals, s.arg.text, undefined))
      : {status: 'na'};

    cell.zod = zod.entries[key]
      ? measure('zod', 'zod', PROBE_ZOD, probeZod(zod.preamble, [], 'z.string()', V), probeZod(zod.preamble, zod.entries[key].locals, zod.entries[key].exprText, value))
      : {status: 'na'};

    cell.typebox = typebox.entries[key]
      ? measure('typebox', 'typebox', PROBE_TYPEBOX, probeTypebox(typebox.preamble, [], 'Type.String()', V), probeTypebox(typebox.preamble, typebox.entries[key].locals, typebox.entries[key].exprText, value))
      : {status: 'na'};

    const tp = typia.entries[key];
    cell.typia = tp
      ? measure('typia', 'typia', PROBE_TYPIA, probeTsType(typia.preamble, [], 'string', V), probeTsType(typia.preamble, tp.locals, tp.typeText, value), probeTsType(typia.preamble, tp.locals, tp.typeText, undefined))
      : {status: 'na'};

    rows.push(cell);
  }

  report(rows);
  // A filtered run is for inspection — don't clobber the full per-competitor JSON.
  if (!CASE_FILTER) writeResults(rows);
}

const LIBS = [
  ['ts-go(type)', 'tsType', 'mion-type'],
  ['ts-go(builder)', 'tsSchema', 'mion-schema'],
  ['zod', 'zod', 'zod'],
  ['typebox', 'typebox', 'typebox'],
  ['typia', 'typia', 'typia'],
];

function report(rows) {
  const padR = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  const padL = (s, n) => String(s).padStart(n);
  const COL = 15;
  const KEYW = 32;
  console.log('\nType-checking cost — TS type instantiations to resolve each form (baseline-subtracted)\n');
  console.log(padR('case', KEYW) + LIBS.map(([n]) => padL(n, COL)).join(''));
  console.log('-'.repeat(KEYW + COL * LIBS.length));

  const totals = Object.fromEntries(LIBS.map(([, field]) => [field, 0]));
  const counts = Object.fromEntries(LIBS.map(([, field]) => [field, 0]));
  let lastGroup = '';
  for (const row of rows) {
    if (row.group !== lastGroup) {
      console.log(`· ${row.group}`);
      lastGroup = row.group;
    }
    let line = padR('  ' + row.name, KEYW);
    for (const [, field] of LIBS) {
      const cell = row[field];
      if (cell.status === 'ok') {
        totals[field] += cell.n;
        counts[field] += 1;
        line += padL(String(cell.n), COL);
      } else if (cell.status === 'err') {
        line += padL('err', COL);
      } else {
        line += padL('—', COL);
      }
    }
    console.log(line);
  }

  console.log('\nTotals (sum of instantiations / cases measured):');
  for (const [name, field] of LIBS) {
    console.log(`  ${padR(name, 16)} ${padL(totals[field], 9)}  over ${counts[field]} cases`);
  }

  // Fair head-to-head: only cases every form measured cleanly.
  const commonRows = rows.filter((row) => LIBS.every(([, f]) => row[f].status === 'ok'));
  if (commonRows.length) {
    console.log(`\nApples-to-apples — same ${commonRows.length} cases all forms support:`);
    for (const [name, field] of LIBS) {
      const sum = commonRows.reduce((acc, row) => acc + row[field].n, 0);
      console.log(`  ${padR(name, 16)} ${padL(sum, 9)}  (avg ${Math.round(sum / commonRows.length)}/case)`);
    }
  }
  // `err` detail: the type did not compile, so it's excluded from totals. Surface
  // the first TS error per (case, form) — almost always either a broadened sample
  // not assignable to a narrow type, or a construct the pinned lib can't resolve.
  const errs = [];
  for (const row of rows) {
    for (const [name, field] of LIBS) {
      if (row[field].status === 'err') errs.push({key: row.key, lib: name, detail: row[field].detail});
    }
  }
  if (errs.length) {
    console.log(`\nErrors (${errs.length}) — type did not compile (excluded from totals):`);
    for (const e of errs) console.log(`  ${padR(e.key, KEYW)} ${padR(e.lib, 14)} ${e.detail}`);
  }

  console.log(
    "\nNote: each probe ASSIGNS a real value to a `const x: <type>` (the case's\n" +
      'first valid sample, serialized), forcing TypeScript to fully resolve the\n' +
      'type AND structurally check the value against it — the cost users pay on\n' +
      'every `const x: T = {…}`. ts-go(type) and typia are pure-type forms (the cost\n' +
      'of resolving the literal T); ts-go(builder) is the type-builder form + InferType<>.\n' +
      'ajv has no static type inference.'
  );
}

// Per-competitor results JSON so typecost can be aggregated like the runtime
// results. One file per form/column: results/<competitor>.typecost.json with
// {competitor, cases:[{key, group, name, instantiations}], total}.
function writeResults(rows) {
  fs.mkdirSync(RESULTS_DIR, {recursive: true});
  for (const [, field, competitor] of LIBS) {
    const cases = [];
    let total = 0;
    for (const row of rows) {
      const cell = row[field];
      if (cell.status !== 'ok') continue; // skip na/err — only measured cases ship
      cases.push({key: row.key, group: row.group, name: row.name, instantiations: cell.n});
      total += cell.n;
    }
    const out = {competitor, cases, total};
    fs.writeFileSync(path.join(RESULTS_DIR, `${competitor}.typecost.json`), JSON.stringify(out, null, 2) + '\n');
  }
}

main();
