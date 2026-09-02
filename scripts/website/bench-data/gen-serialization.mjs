#!/usr/bin/env node
// Generates the SERIALIZATION benchmark dataset the docs website renders, under
// container/website/public/bench-data/serialization/:
//
//   index.json          — { bench, label, competitors (= round-trips), metrics,
//                           bandwidthsMbps, sections: [{ key, label,
//                           cases: [{ key, title, jsonSafe, results }] }] }
//   <case>.json         — { competitors: [{ name, source }] }  (lazy hover)
//
// Unlike the validation/typecost benches there are NO competitor libraries: the
// "columns" are mion's own round-trips plus a native-JSON baseline, all
// measured in-process from the SERIALIZATION test suite. So this is built like
// the suite exporters (load the suite through Vite + the runtypes plugin, time
// the real generated encoders/decoders), NOT like container/benchmarks/ (no podman, no
// per-competitor isolation).
//
// Eight round-trips per case (the "competitors" the table shows). Each one's
// reader-facing blurb lives on its ROUNDTRIPS entry and ships as index.columnNotes,
// which is what hovering that column's table header reveals:
//   clone              cloneEncoder  + preserveDecoder   (strategy 'clone', default)
//   mutate             mutateEncoder + preserveDecoder   (strategy 'mutate')
//   direct             directEncoder + preserveDecoder   (strategy 'direct')
//   compact            compactEncoder + compactDecoder   (strategy 'compact', positional array)
//   binary             binaryEncoder + binaryDecoder
//   jsonSchema         the clone codec, authored from a JSON Schema document
//   jsonSchema binary  the binary codec, authored from a JSON Schema document
//   native JSON        JSON.stringify + JSON.parse       (baseline, JSON-safe cases only)
//
// Three metric groups (one stacked table each on the page):
//   roundtrip  derived client-side = 1/(t_encode + t_network(bytes) + t_decode)
//   encdec     encode ops/sec (headline) + decode ops/sec (secondary)
//   payload    bytes on the wire (lower is better)
//
// Round-trip is NOT stored — the page derives it from encdec + payload at the
// selected link speed, so the bandwidth selector needs no re-generation. We ship
// the raw measurements (encode ops/sec, decode ops/sec, bytes); the network term
// is bytes * 8 / (Mbps * 1e6).

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {performance} from 'node:perf_hooks';
import {createServer} from 'vite';

// Load .env on the host (dev) so MION_VALIDATION_BENCH_* knobs apply when run directly. Inside
// the benchmark container this file is mounted ALONE (no sibling loader) and gets
// its env via `podman run -e`, so a failing import is a harmless no-op there.
try {
  const {loadEnv} = await import('../../lib/env.mjs');
  loadEnv();
} catch {}

// The benchmark runs on Node >= 26, which ships Temporal natively — so the timed
// encoders/decoders run on the same runtime the published library targets. The
// suites read globalThis.Temporal at getTestData / emitted-code time.
if (typeof globalThis.Temporal === 'undefined') {
  process.stderr.write('Temporal is unavailable: this benchmark requires Node >= 26.\n');
  process.exit(1);
}

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
// All inputs are env-overridable so the SAME script runs on the host (defaults:
// the repo checkout) and INSIDE the Node 26 benchmark container, where the
// marker package, the vite plugin and the Go binary are bind-mounted into the
// mion competitor context (see scripts/website/bench-data/bench.mjs cmdSerialization).
const REPO_ROOT = process.env.MION_VALIDATION_BENCH_REPO_ROOT ?? path.resolve(HERE, '..', '..', '..');
const GO_ROOT = path.join(REPO_ROOT, 'ts-go-runtypes');
const PACKAGE_ROOT = process.env.MION_VALIDATION_BENCH_PACKAGE_ROOT ?? path.join(REPO_ROOT, 'packages/run-types');
const VITE_ROOT = process.env.MION_VALIDATION_BENCH_VITE_ROOT ?? REPO_ROOT;
const OUT_BASE = process.env.MION_VALIDATION_BENCH_OUT_DIR ?? path.join(REPO_ROOT, 'container/website/public/bench-data');
// Source extractor: a prebuilt linux binary in-container (no Go toolchain there),
// else `go run ./cmd/extract-fn-bodies` from the repo on the host.
const EXTRACT_BIN = process.env.MION_EXTRACT_BIN ?? '';
// SSR transform boundary: in-container the marker package is a bind-mounted dir,
// not a pnpm workspace symlink, so vite would externalize it; force it (+ the
// plugin) through the transform pipeline. On the host (workspace symlink) leave
// it unset so behaviour is unchanged.
const SSR_NOEXTERNAL = (process.env.MION_VALIDATION_BENCH_SSR_NOEXTERNAL ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Resolver disk cache: it follows TypeScript's incremental switch, and this
// bench loads the suite through `tsconfig.test.json` (incremental:false), so it
// is off by default. The in-container run also passes MION_VALIDATION_BENCH_CACHE_DIR=false
// (the marker mount is read-only, so a write must never be attempted) — forward
// it to the binary's internal MION_CACHE_DIR control: 'false' forces the cache
// off, a path forces it on there. The plugin's resolver child inherits the env.
if (process.env.MION_VALIDATION_BENCH_CACHE_DIR === 'false') process.env.MION_CACHE_DIR = '';
else if (process.env.MION_VALIDATION_BENCH_CACHE_DIR) process.env.MION_CACHE_DIR = process.env.MION_VALIDATION_BENCH_CACHE_DIR;

// Files-mode writes the generated cache modules under <outDir>/types. The default
// (<srcDir>/__runtypes, inferred from the tsconfig) lands under the read-only marker
// mount in-container, so MION_VALIDATION_BENCH_RT_OUTDIR points it at a writable path under the
// vite root instead. Omitted on the host, where the inferred dir is writable.
const OUTDIR_OPT = process.env.MION_VALIDATION_BENCH_RT_OUTDIR ? {genDir: process.env.MION_VALIDATION_BENCH_RT_OUTDIR} : {};

// The vite plugin entry — dynamic import so it can resolve from the bind-mounted
// node_modules in-container (bare specifier) or the dist path on the host.
const PLUGIN_ENTRY = process.env.MION_VALIDATION_BENCH_PLUGIN_ENTRY ?? path.join(REPO_ROOT, 'packages/devtools/dist/runtypes/vite.js');
const pluginSpec =
  PLUGIN_ENTRY.startsWith('.') || path.isAbsolute(PLUGIN_ENTRY) ? url.pathToFileURL(path.resolve(PLUGIN_ENTRY)).href : PLUGIN_ENTRY;
const runtypesPlugin = (await import(pluginSpec)).default;

// Suite selection — `--suite serialization` (default) or `--suite format-serialization`.
// Both use the SerializationCase shape; each maps to its own bench slug + label.
const SUITE_CONFIGS = {
  serialization: {dir: 'serialization', exportConst: 'SERIALIZATION_SPEC', bench: 'serialization', label: 'Serialization'},
  'format-serialization': {
    dir: 'format-serialization',
    exportConst: 'FORMAT_SERIALIZATION_SUITE',
    bench: 'serialization-formats',
    label: 'Serialization Formats',
  },
};
const suiteArgIndex = process.argv.indexOf('--suite');
const SUITE = suiteArgIndex >= 0 ? process.argv[suiteArgIndex + 1] : 'serialization';
const SUITE_CFG = SUITE_CONFIGS[SUITE];
if (!SUITE_CFG) {
  process.stderr.write(`unknown --suite '${SUITE}' (known: ${Object.keys(SUITE_CONFIGS).join(', ')})\n`);
  process.exit(1);
}

const SUITE_DIR = path.join(PACKAGE_ROOT, 'test/suites', SUITE_CFG.dir);
const SUITE_PATH = path.join(SUITE_DIR, 'index.ts');
const BIN = process.env.MION_VALIDATION_BENCH_BIN ?? path.join(REPO_ROOT, 'bin/mion');
const OUT_DIR = path.join(OUT_BASE, SUITE_CFG.bench);

// The round-trips shown as columns. `enc`/`dec` name the SerializationCase thunk
// fields; `native` synthesises JSON.stringify/parse (no thunk). Order = column order.
// `note` is the reader-facing one-liner behind the info icon on every table caption.
const ROUNDTRIPS = [
  {
    key: 'clone',
    enc: 'cloneEncoder',
    dec: 'preserveDecoder',
    kind: 'json',
    note: 'Default. Builds a fresh copy and drops any key the type does not declare.',
  },
  {
    key: 'mutate',
    enc: 'mutateEncoder',
    dec: 'preserveDecoder',
    kind: 'json',
    note: 'Writes into the value you pass in and keeps the keys it does not declare.',
  },
  {
    key: 'direct',
    enc: 'directEncoder',
    dec: 'preserveDecoder',
    kind: 'json',
    note: 'A single pass over the value, the least overhead of the JSON strategies.',
  },
  {
    key: 'compact',
    enc: 'compactEncoder',
    dec: 'compactDecoder',
    kind: 'json',
    note: 'Positional arrays instead of named keys, so no field names travel on the wire.',
  },
  {
    key: 'binary',
    enc: 'binaryEncoder',
    dec: 'binaryDecoder',
    kind: 'binary',
    note: 'Raw bytes rather than text. Best for numeric payloads.',
  },
  // No JSON-Schema-authored round-trip: the suite cases define no jsonSchema* thunks
  // (only the builder-authored schema* ones), so the two columns that once named them
  // shipped n-a all the way down. A column here must be a thunk every case carries.
  {
    key: 'native JSON',
    enc: null,
    dec: null,
    kind: 'native',
    note: 'Baseline. Plain JSON.stringify and JSON.parse, on JSON-safe cases only.',
  },
];

// competitor -> what that column is, revealed by hovering that column's header
// (BenchTable reads index.columnNotes). The detail line names the thunks this run
// actually timed, so the tooltip cannot drift from the measured pair.
function columnNotes() {
  const notes = {};
  for (const rt of ROUNDTRIPS) {
    notes[rt.key] = {text: rt.note, detail: `encode ${rt.enc ?? 'JSON.stringify'} · decode ${rt.dec ?? 'JSON.parse'}`};
  }
  return notes;
}

// Thunk fields whose TS source we extract for the hover panel.
const SOURCE_FIELDS = [
  'cloneEncoder',
  'mutateEncoder',
  'directEncoder',
  'compactEncoder',
  'binaryEncoder',
  'preserveDecoder',
  'compactDecoder',
  'binaryDecoder',
];

// Bandwidth options for the page's round-trip selector (Mbps). Default mid-tier.
const BANDWIDTHS_MBPS = [10, 100, 1000];
const DEFAULT_BANDWIDTH_MBPS = 100;

// MION_VALIDATION_BENCH_QUICK=1 trades accuracy for speed (preview / two-staged website builds):
// far fewer cycles + iterations, so numbers are noisy but every panel still renders.
const QUICK = process.env.MION_VALIDATION_BENCH_QUICK === '1';

// Workload knobs. Modest vs the suite exporter — every case runs 5 round-trips ×
// (encode + decode), so keep each measurement cheap but stable.
const OPS_CYCLES = QUICK ? 2 : 8;
const OPS_ITERS = QUICK ? 100 : 800;
const OPS_WARMUP = QUICK ? 10 : 50;
// Cap iters for large payloads so the pre-allocated pool stays a few MB.
const LARGE_SAMPLE_BYTES = 100 * 1024;
const LARGE_ITERS = QUICK ? 25 : 150;

function ensureBinary() {
  if (!fs.existsSync(BIN)) {
    process.stderr.write(`mion binary not found at ${BIN}\n`);
    process.stderr.write(`build it with: pnpm run check:builds\n`);
    process.exit(1);
  }
}

// Load the suite WITH the runtypes plugin active so the marker scanner + RT cache
// populate before we exercise any factory. Mirrors export-serialization-suite.mjs.
async function loadSuiteWithPlugin() {
  const server = await createServer({
    root: VITE_ROOT,
    configFile: false,
    server: {middlewareMode: true, watch: null},
    appType: 'custom',
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}, ...(SSR_NOEXTERNAL.length ? {noExternal: SSR_NOEXTERNAL.map((p) => new RegExp(p))} : {})},
    optimizeDeps: {noDiscovery: true},
    logLevel: 'error',
    // In-container this config is read from a bind-mounted marker package whose
    // `extends` chain walks OUT of it, so bench.mjs mounts that chain too
    // (SERIALIZATION_TSCONFIG there must name this same file).
    //
    // failOnError:false for the same reason packages/run-types/vitest.config.ts
    // sets it — this is the marker package's OWN test program, and buildStart
    // scans everything tsconfig.test.json includes, alwaysThrow suites included.
    // Those deliberately hold Error-severity types (root-position symbols,
    // functions, …), so the strict default refuses to boot the project and the
    // bench dies before a single case is measured. Consumers keep the default.
    plugins: [runtypesPlugin({binary: BIN, cwd: PACKAGE_ROOT, tsconfig: 'tsconfig.test.json', failOnError: false, ...OUTDIR_OPT})],
  });
  try {
    const mod = await server.ssrLoadModule(SUITE_PATH);
    return mod[SUITE_CFG.exportConst];
  } finally {
    await server.close();
  }
}

// UPPER_SNAKE group name -> PascalCase data-file basename ('CIRCULAR_REFS' -> 'CircularRefs').
function groupToFile(group) {
  const pascal = group
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  const wanted = `${pascal.toLowerCase()}.ts`;
  const actual = fs.readdirSync(SUITE_DIR).find((name) => name.toLowerCase() === wanted);
  return actual ? actual.slice(0, -3) : pascal;
}

// Extract the thunk source bodies per group via the Go object-literal walker —
// a prebuilt binary (MION_EXTRACT_BIN, in-container) or `go run` from the repo
// (host). Returns { GROUP: { caseKey: { field: body } } }.
function runGoExtractor(groups) {
  const bodies = {};
  const cmd = EXTRACT_BIN || 'go';
  const baseArgs = EXTRACT_BIN ? [] : ['run', './cmd/extract-fn-bodies'];
  for (const group of groups) {
    const groupFile = path.join(SUITE_DIR, `${groupToFile(group)}.ts`);
    const res = spawnSync(cmd, [...baseArgs, '--file', groupFile, '--identifier', group], {
      cwd: EXTRACT_BIN ? REPO_ROOT : GO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) {
      process.stderr.write(`extract-fn-bodies failed to launch (${cmd}): ${res.error.message}\n`);
      process.exit(1);
    }
    if (res.status !== 0) {
      process.stderr.write(res.stderr || '');
      process.exit(res.status || 1);
    }
    bodies[group] = JSON.parse(res.stdout);
  }
  return bodies;
}

function sectionLabel(group) {
  return group
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function safeKey(key) {
  return String(key).replace(/[^A-Za-z0-9_.-]/g, '_');
}

function roundSig(x) {
  if (!Number.isFinite(x)) return x;
  if (Math.abs(x) >= 1000) return Math.round(x);
  return Math.round(x * 1000) / 1000;
}

// Geometric-style center: median of the per-cycle ops/sec samples (outlier-robust).
function opsOf(samples) {
  if (!samples || samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return roundSig(median);
}

// One ops/sec measurement = `iters` fn calls timed, repeated `cycles` times, each
// indexing into a pre-built pool so per-iter work mirrors production but pool prep
// sits outside the timed window. Ported from export-serialization-suite.mjs.
function benchOpsPerSecPooled(fn, pool, cycles, iters, warmup) {
  let idx = 0;
  for (let i = 0; i < warmup; i++) {
    fn(pool[idx % pool.length]);
    idx += 1;
  }
  const out = [];
  for (let c = 0; c < cycles; c++) {
    const start = performance.now();
    for (let i = 0; i < iters; i++) {
      fn(pool[idx % pool.length]);
      idx += 1;
    }
    const elapsed = performance.now() - start;
    out.push(iters / (elapsed / 1000));
  }
  return out;
}

// Date/bigint/Temporal-aware structural equality — used both for the round-trip
// sanity check and the JSON-safe probe (native JSON loses Date→string, bigint
// throws, Map/Set collapse, so any of those make a sample NOT json-safe).
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'bigint' || typeof b === 'bigint') return a === b;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    // Map / Set collapse under JSON — treat any non-plain container as unequal to
    // its JSON projection so those cases read as not json-safe.
    if (a instanceof Map || a instanceof Set || b instanceof Map || b instanceof Set) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

// A case is JSON-safe when EVERY sample round-trips losslessly through native
// JSON.stringify/JSON.parse (bigint throws → caught → false; Date/Map/Set/Temporal
// → structural mismatch → false). Drives the "JSON-safe" badge + the native column.
function isJsonSafe(samples) {
  if (!samples || samples.length === 0) return false;
  for (const sample of samples) {
    try {
      const text = JSON.stringify(sample);
      if (typeof text !== 'string') return false;
      if (!deepEqual(JSON.parse(text), sample)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function byteLengthOf(encoded) {
  if (encoded == null) return null;
  if (typeof encoded === 'string') return Buffer.byteLength(encoded, 'utf8');
  if (typeof encoded.getLength === 'function') return encoded.getLength(); // DataViewSerializer (binaryEncoder return)
  if (encoded.byteLength != null) return encoded.byteLength; // ArrayBuffer / TypedArray / Buffer
  if (encoded.length != null) return encoded.length;
  return null;
}

function pickIters(sample) {
  try {
    const text = JSON.stringify(sample, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    if (typeof text === 'string' && text.length > LARGE_SAMPLE_BYTES) return LARGE_ITERS;
  } catch {
    // bigint-at-root / functions / cycles — fall through to default.
  }
  return OPS_ITERS;
}

// Fresh sample list for a case (each call rebuilds the values so encode-in-place
// mutation never leaks across pool entries). Binary may diverge from JSON.
function jsonValues(caseObj) {
  return (caseObj.getTestDataForStringify ?? caseObj.getTestData)().values;
}
function binaryValues(caseObj) {
  return (caseObj.getBinaryTestData ?? caseObj.getTestDataForStringify ?? caseObj.getTestData)().values;
}

// Build a pool of `count` fresh values rotating through `indices` of a freshly
// rebuilt values array (so in-place encoders get a clean object every iteration).
function buildPool(selectValues, count, indices) {
  const pool = new Array(count);
  for (let i = 0; i < count; i++) {
    const values = selectValues();
    const idx = indices[i % indices.length];
    pool[i] = values[idx];
  }
  return pool;
}

// Measure one round-trip for one case. Returns {encOps, decOps, bytes} or null
// when the round-trip can't run (factory throws, no sample survives, etc.).
function measureRoundTrip(caseObj, rt) {
  const isBinary = rt.kind === 'binary';
  const isNative = rt.kind === 'native';
  const selectValues = isBinary ? () => binaryValues(caseObj) : () => jsonValues(caseObj);

  // Build the encode/decode pair.
  let encode;
  let decode;
  if (isNative) {
    encode = (v) => JSON.stringify(v);
    decode = (s) => JSON.parse(s);
  } else {
    try {
      const encThunk = caseObj[rt.enc];
      const decThunk = caseObj[rt.dec];
      if (encThunk === 'not-supported' || decThunk === 'not-supported') return null;
      encode = encThunk();
      decode = decThunk();
    } catch {
      return null; // factory threw (alwaysThrow entry) — round-trip unsupported
    }
  }
  if (typeof encode !== 'function' || typeof decode !== 'function') return null;

  // Probe: which sample indices survive encode AND decode? (bigint-in-`any`,
  // best-effort broad types, etc. can throw on a subset.)
  let surviving = [];
  let firstSample;
  try {
    const values = selectValues();
    if (!Array.isArray(values) || values.length === 0) return null;
    firstSample = values[0];
    for (let i = 0; i < values.length; i++) {
      try {
        const wire = encode(selectValues()[i]);
        if (wire == null) continue;
        decode(wire);
        surviving.push(i);
      } catch {
        // skip this sample
      }
    }
  } catch {
    return null;
  }
  if (surviving.length === 0) return null;

  const iters = pickIters(firstSample);
  const poolSize = iters * OPS_CYCLES + OPS_WARMUP;

  // Bytes: encode one surviving sample.
  const bytes = byteLengthOf(encode(selectValues()[surviving[0]]));

  // Encode throughput over a fresh pool (mutate encoders need fresh objects).
  const encodePool = buildPool(selectValues, poolSize, surviving);
  const encOps = opsOf(benchOpsPerSecPooled(encode, encodePool, OPS_CYCLES, iters, OPS_WARMUP));

  // Decode throughput: pre-encode a fresh pool to wire form, then time decode.
  const decodeSource = buildPool(selectValues, poolSize, surviving);
  const wirePool = [];
  for (const value of decodeSource) {
    try {
      const wire = encode(value);
      if (wire != null) wirePool.push(wire);
    } catch {
      // skip
    }
  }
  const decOps = wirePool.length > 0 ? opsOf(benchOpsPerSecPooled(decode, wirePool, OPS_CYCLES, iters, OPS_WARMUP)) : 0;

  return {encOps, decOps, bytes};
}

// Tidy a thunk body for display: drop a leading `return ` so a self-declaring
// thunk reads as a usage example. Mirrors gen-website-suite-data.mjs forDisplay.
function forDisplay(body) {
  if (typeof body !== 'string') return '';
  return body.replace(/(^|\n)[ \t]*return (?=create[A-Za-z]+[<(])/, '$1');
}

// The hover source for one round-trip = its encoder body + decoder body.
function roundTripSource(rt, caseBodies) {
  if (rt.kind === 'native') return 'JSON.stringify(value)\nJSON.parse(text)';
  const enc = forDisplay(caseBodies?.[rt.enc]);
  const dec = forDisplay(caseBodies?.[rt.dec]);
  return [enc, dec].filter(Boolean).join('\n');
}

async function main() {
  ensureBinary();

  const t0 = performance.now();
  const suite = await loadSuiteWithPlugin();
  process.stdout.write(`loaded ${SUITE_CFG.exportConst} via vite + runtypes plugin (${ms(t0)})\n`);

  const tExtract = performance.now();
  const bodies = runGoExtractor(Object.keys(suite));
  process.stdout.write(`extracted thunk sources (${ms(tExtract)})\n`);

  fs.rmSync(OUT_DIR, {recursive: true, force: true});
  fs.mkdirSync(OUT_DIR, {recursive: true});

  const totalCases = Object.values(suite).reduce((n, cases) => n + Object.keys(cases).length, 0);
  const sections = [];
  let doneCases = 0;
  let benched = 0;
  let skipped = 0;
  const benchStart = performance.now();

  for (const [group, cases] of Object.entries(suite)) {
    const rows = [];
    for (const [caseKey, caseObj] of Object.entries(cases)) {
      doneCases += 1;
      progress(doneCases, totalCases, benchStart, `${group}.${caseKey}`);

      // Cases the Go pipeline renders as an always-throw factory can't serialize
      // at all — skip rather than emit a row of n-a noise.
      if (caseObj.factoryThrows) {
        skipped += 1;
        continue;
      }

      const samples = (() => {
        try {
          return jsonValues(caseObj);
        } catch {
          return [];
        }
      })();
      const jsonSafe = isJsonSafe(samples);

      const results = {};
      const detailComps = [];
      for (const rt of ROUNDTRIPS) {
        // The native baseline only runs on JSON-safe cases.
        if (rt.kind === 'native' && !jsonSafe) {
          detailComps.push({name: rt.key, source: roundTripSource(rt, bodies?.[group]?.[caseKey]), status: 'not-supported'});
          continue;
        }
        const measured = measureRoundTrip(caseObj, rt);
        if (measured) {
          results[rt.key] = {
            encdec: {valid: measured.encOps, invalid: measured.decOps, status: 'ok'},
            payload: {valid: measured.bytes ?? 0, status: 'ok'},
          };
        }
        detailComps.push({name: rt.key, source: roundTripSource(rt, bodies?.[group]?.[caseKey])});
      }

      if (Object.keys(results).length === 0) {
        skipped += 1;
        continue;
      }
      benched += 1;

      // Section-qualified key so cases sharing a name across groups don't collide
      // (the detail file is named by this key, and BenchTable fetches it by key).
      const rowKey = safeKey(`${group}.${caseKey}`);
      rows.push({key: rowKey, title: caseObj.title ?? caseKey, jsonSafe, results});
      fs.writeFileSync(path.join(OUT_DIR, `${rowKey}.json`), JSON.stringify({competitors: detailComps}));
    }
    if (rows.length > 0) sections.push({key: group, label: sectionLabel(group), cases: rows});
  }
  progressEnd();

  const index = {
    bench: SUITE_CFG.bench,
    label: SUITE_CFG.label,
    showStrategy: false,
    competitors: ROUNDTRIPS.map((rt) => rt.key),
    columnNotes: columnNotes(),
    bandwidthsMbps: BANDWIDTHS_MBPS,
    defaultBandwidthMbps: DEFAULT_BANDWIDTH_MBPS,
    metrics: [
      {
        key: 'roundtrip',
        label: 'Round-trip throughput',
        metricLabel: 'encode + network + decode, per second — higher is better',
        unit: 'ops',
        derived: 'roundtrip',
        cellHint: 'round-trips/sec at the selected link speed (encode + transmit + decode)',
      },
      {
        key: 'encdec',
        label: 'Encode / Decode throughput',
        metricLabel: 'encode (headline) and decode (small), per second — higher is better',
        unit: 'ops',
        cellHint: 'encode/sec (headline) · decode/sec (smaller)',
      },
      {
        key: 'payload',
        label: 'Payload size',
        metricLabel: 'bytes on the wire — lower is better',
        unit: 'bytes',
        lowerBetter: true,
        cellHint: 'bytes on the wire (the JSON string / binary buffer)',
      },
    ],
    sections,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));

  process.stdout.write(
    `${SUITE_CFG.bench}: ${benched} cases benched, ${skipped} skipped (factoryThrows / unsupported) → ` +
      `container/website/public/bench-data/${SUITE_CFG.bench}/ (total ${ms(t0)})\n`
  );
}

function ms(start) {
  const elapsed = performance.now() - start;
  if (elapsed < 1000) return `${Math.round(elapsed)}ms`;
  return `${(elapsed / 1000).toFixed(1)}s`;
}

let lastDecile = -1;
function progress(current, total, startTime, detail) {
  const pct = total > 0 ? (current * 100) / total : 100;
  const decile = Math.floor(pct / 10);
  if (decile <= lastDecile) return;
  lastDecile = decile;
  const elapsed = (performance.now() - startTime) / 1000;
  const rate = current > 0 ? current / elapsed : 0;
  const remaining = rate > 0 ? (total - current) / rate : 0;
  process.stdout.write(
    `[bench] ${decile * 10}% (${current}/${total}) — ${elapsed.toFixed(1)}s elapsed, ~${remaining.toFixed(1)}s left${detail ? ` — ${detail}` : ''}\n`
  );
}
function progressEnd() {
  lastDecile = -1;
}

await main();
