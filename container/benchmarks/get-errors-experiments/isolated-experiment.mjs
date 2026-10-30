// Isolated getErrors experiment: one variant per optimization idea, applied or discarded, timed head to head.
//
// Each case is a verbatim copy of the code the resolver generated for a benchmark case before the change (`base`), plus
// one hand edit per idea. Every variant runs in its own Node process (no JIT state shared between variants) and the
// table reports the median of --runs runs. A FAITHFULNESS GATE runs first: every variant must return exactly the errors
// `base` returns, for every sample, with and without a caller-supplied path / errors list, or the run aborts.
//
// Run (plain Node, no deps):
//   node container/benchmarks/get-errors-experiments/isolated-experiment.mjs [--runs 7] [--ms 1000] [--cases user,date]
//
// Variants:
//   base              generated code before the change: `(v, pth=[], er=[])`, spread path copies, `pth.splice(-n)`
//   spreadFree        APPLIED: newRunTypeErr builds the path with slice / concat, reuses a fresh access-path literal
//   shortcut          APPLIED on container roots: `if(er===undefined){er=[];if(validate(v))return er}`, no defaults
//   shortcutDefaults  DISCARDED: same shortcut keeping the defaults, gated on `arguments.length < 3` (2 allocations)
//   spliceToLength    DISCARDED: `pth.length -= n` instead of `pth.splice(-n)` after a recursive call
//   final             what ships: spreadFree + shortcut where the root is a container, spreadFree alone otherwise
//
// The `date` case is a one-check root: there the shortcut is the DISCARDED variant (final has no shortcut), kept to
// show why: nothing to gain on a valid value, the check runs twice on an invalid one.

import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';

// ── error helpers (newRunTypeErr before / after) ────────────────────────────────────────────────────────────
function nRTSpread(pth, er, expected, accessPath) {
  const path = accessPath?.length ? [...pth, ...accessPath] : [...pth];
  er.push({expected, path});
}
function nRTSpreadFree(pth, er, expected, accessPath) {
  const path = !accessPath?.length ? pth.slice() : pth.length === 0 ? accessPath : pth.concat(accessPath);
  er.push({expected, path});
}

// ── variant builders: body(v, pth, er, nRT, self) is the generated body, the wrapper is the idea under test ──
function wrap(variant, validate, body) {
  const nRT = variant === 'base' || variant === 'shortcutDefaults' || variant === 'spliceToLength' ? nRTSpread : nRTSpreadFree;
  const pop = variant === 'spliceToLength' ? 'length' : 'splice';
  switch (variant) {
    case 'base':
    case 'spreadFree':
    case 'spliceToLength':
      return function self(v, pth = [], er = []) {
        return body(v, pth, er, nRT, self, pop);
      };
    case 'shortcutDefaults':
      return function self(v, pth = [], er = []) {
        if (arguments.length < 3 && validate(v)) return er;
        return body(v, pth, er, nRT, self, pop);
      };
    case 'shortcut':
    case 'final':
      return function self(v, pth, er) {
        if (er === undefined) {
          er = [];
          if (validate(v)) return er;
        }
        if (pth === undefined) pth = [];
        return body(v, pth, er, nRT, self, pop);
      };
  }
  throw new Error(`unknown variant ${variant}`);
}

const popPath = (pth, n, pop) => (pop === 'length' ? (pth.length -= n) : pth.splice(-n));

// ── cases ───────────────────────────────────────────────────────────────────────────────────────────────────
// REALWORLD.user
const rolesUnion = {fn: (v) => v === 'admin' || v === 'editor' || v === 'user'};
const ctxRoles = (v) => {
  if (!Array.isArray(v.roles)) return false;
  for (let i = 0; i < v.roles.length; i++) if (!rolesUnion.fn(v.roles[i])) return false;
  return true;
};
const userValidate = (v) =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite(v.id) &&
  typeof v.email === 'string' &&
  typeof v.name === 'string' &&
  (v.age === undefined || Number.isFinite(v.age)) &&
  ctxRoles(v) &&
  typeof v.active === 'boolean' &&
  typeof v.createdAt === 'string';
function userBody(v, pth, er, nRT) {
  if (!(typeof v === 'object' && v !== null)) {
    nRT(pth, er, 'objectLiteral');
  } else {
    if (!Number.isFinite(v.id)) nRT(pth, er, 'number', ['id']);
    if (typeof v.email !== 'string') nRT(pth, er, 'string', ['email']);
    if (typeof v.name !== 'string') nRT(pth, er, 'string', ['name']);
    if (v.age !== undefined) {
      if (!Number.isFinite(v.age)) nRT(pth, er, 'number', ['age']);
    }
    if (!Array.isArray(v.roles)) {
      nRT(pth, er, 'array', ['roles']);
    } else {
      for (let i0 = 0; i0 < v.roles.length; i0++) if (!rolesUnion.fn(v.roles[i0])) nRT(pth, er, 'union', ['roles', i0]);
    }
    if (typeof v.active !== 'boolean') nRT(pth, er, 'boolean', ['active']);
    if (typeof v.createdAt !== 'string') nRT(pth, er, 'string', ['createdAt']);
  }
  return er;
}
const sampleUser = (over = {}) => ({id: 1, email: 'ann@example.com', name: 'Ann', roles: ['user'], active: true, createdAt: '2024-01-02', ...over});

// CIRCULAR.object_full_mion_shape
const circValidate = (v) =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite(v.n) &&
  typeof v.s === 'string' &&
  (v.c === undefined || circValidate(v.c)) &&
  (v.d === undefined || (v.d instanceof Date && !isNaN(v.d.getTime())));
function circBody(v, pth, er, nRT, self, pop) {
  if (!(typeof v === 'object' && v !== null)) {
    nRT(pth, er, 'objectLiteral');
  } else {
    if (!Number.isFinite(v.n)) nRT(pth, er, 'number', ['n']);
    if (typeof v.s !== 'string') nRT(pth, er, 'string', ['s']);
    if (v.c !== undefined) {
      pth.push('c');
      self(v.c, pth, er);
      popPath(pth, 1, pop);
    }
    if (v.d !== undefined) {
      if (!(v.d instanceof Date) || isNaN(v.d.getTime())) nRT(pth, er, 'date', ['d']);
    }
  }
  return er;
}

// STRICT.nested_required (checkUnknowns)
const countKeys = (obj) => {
  let count = 0;
  for (const _key in obj) count++;
  return count;
};
const unknownKeys = (obj, keys) => {
  const out = [];
  for (const prop in obj) {
    if (!keys.includes(prop)) {
      out.push(prop);
      if (out.length >= 10) throw new Error('Too many unknown keys');
    }
  }
  return out;
};
const innerKeys = ['x', 'y'];
const rootKeys = ['name', 'inner'];
const strictValidate = (v) =>
  typeof v === 'object' &&
  v !== null &&
  typeof v.name === 'string' &&
  typeof v.inner === 'object' &&
  v.inner !== null &&
  Number.isFinite(v.inner.x) &&
  typeof v.inner.y === 'string' &&
  countKeys(v.inner) === 2 &&
  countKeys(v) === 2;
function strictBody(v, pth, er, nRT) {
  if (!(typeof v === 'object' && v !== null)) {
    nRT(pth, er, 'objectLiteral');
  } else {
    if (typeof v.name !== 'string') nRT(pth, er, 'string', ['name']);
    if (!(typeof v.inner === 'object' && v.inner !== null)) {
      nRT(pth, er, 'objectLiteral', ['inner']);
    } else {
      if (!Number.isFinite(v.inner.x)) nRT(pth, er, 'number', ['inner', 'x']);
      if (typeof v.inner.y !== 'string') nRT(pth, er, 'string', ['inner', 'y']);
      if (!Array.isArray(v.inner)) for (const key of unknownKeys(v.inner, innerKeys)) nRT(pth, er, 'never', ['inner', key]);
    }
    if (!Array.isArray(v)) for (const key of unknownKeys(v, rootKeys)) nRT(pth, er, 'never', [key]);
  }
  return er;
}
const okStrict = {name: 'n', inner: {x: 1, y: 'y'}};

// ATOMIC.date: a one-check root
const dateValidate = (v) => v instanceof Date && !isNaN(v.getTime());
function dateBody(v, pth, er, nRT) {
  if (!(v instanceof Date) || isNaN(v.getTime())) nRT(pth, er, 'date');
  return er;
}

const CASES = {
  user: {
    validate: userValidate,
    body: userBody,
    variants: ['base', 'spreadFree', 'shortcut', 'shortcutDefaults', 'final'],
    samples: () => ({
      valid: [sampleUser(), sampleUser({age: 30, roles: ['admin', 'editor']})],
      invalid: [sampleUser({roles: ['superuser']}), sampleUser({id: '1'}), {email: 'x', name: 'x', roles: [], active: true, createdAt: 'x'}, null, 'not-an-object', 42],
    }),
  },
  circular: {
    validate: circValidate,
    body: circBody,
    variants: ['base', 'spreadFree', 'shortcut', 'shortcutDefaults', 'spliceToLength', 'final'],
    samples: () => ({
      valid: [{n: 1, s: 'hello', c: {n: 2, s: 'world'}}, {n: 2, s: 'world'}, {n: 3, s: 'foo', c: {n: 3, s: 'foo'}}],
      invalid: [
        {n: 1, s: 'hello', c: {n: 2, s: 123}},
        {n: 1, s: 'hello', c: {n: 2}},
        null,
        undefined,
        {n: NaN, s: 'x'},
        {n: 1, s: 'x', d: new Date('invalid')},
        {n: 1, s: 'x', d: 'not date'},
        {},
      ],
    }),
  },
  strict: {
    validate: strictValidate,
    body: strictBody,
    variants: ['base', 'spreadFree', 'shortcut', 'shortcutDefaults', 'final'],
    samples: () => ({
      valid: [okStrict, {name: '', inner: {x: -0.5, y: ''}}],
      invalid: [{...okStrict, extra: 1}, {name: 'n', inner: {x: 1, y: 'y', extra: 1}}, {name: 'n', inner: {x: 1}}, {name: 'n', inner: {x: 1, y: 2}}, null, 'not-an-object'],
    }),
  },
  date: {
    validate: dateValidate,
    body: dateBody,
    // `final` here is spreadFree alone: the shortcut stays off a one-check root.
    variants: ['base', 'spreadFree', 'shortcut', 'final'],
    finalIs: 'spreadFree',
    samples: () => ({valid: [new Date(), new Date(0)], invalid: ['hello', null, undefined, 42, new Date('invalid'), new Date(NaN)]}),
  },
};

function build(caseName, variant) {
  const spec = CASES[caseName];
  const effective = variant === 'final' && spec.finalIs ? spec.finalIs : variant;
  return wrap(effective, spec.validate, spec.body);
}

const interleave = (valid, invalid) => {
  const out = [];
  for (let i = 0; i < Math.max(valid.length, invalid.length); i++) {
    if (i < valid.length) out.push(valid[i]);
    if (i < invalid.length) out.push(invalid[i]);
  }
  return out;
};

// Same loop shape as shared/harness/measure.ts benchOps: warm up, then batch for `ms`.
function opsPerSec(fn, samples, ms) {
  for (let i = 0; i < 1000; i++) for (const sample of samples) fn(sample);
  let batches = 0;
  const start = performance.now();
  while (performance.now() - start < ms) {
    for (const sample of samples) fn(sample);
    batches++;
  }
  return (batches * samples.length) / ((performance.now() - start) / 1000);
}

function child(caseName, variant, ms) {
  const getErrors = build(caseName, variant);
  const benchFn = (value) => getErrors(value).length === 0; // the harness wrapper, as in competitors/mion/cases.ts
  const {valid, invalid} = CASES[caseName].samples();
  const result = {valid: opsPerSec(benchFn, valid, ms), invalid: opsPerSec(benchFn, invalid, ms), mixed: opsPerSec(benchFn, interleave(valid, invalid), ms)};
  process.stdout.write(JSON.stringify(result));
}

function faithfulnessGate(caseNames) {
  for (const caseName of caseNames) {
    const {valid, invalid} = CASES[caseName].samples();
    const base = build(caseName, 'base');
    for (const variant of CASES[caseName].variants) {
      const candidate = build(caseName, variant);
      for (const sample of [...valid, ...invalid]) {
        // Fresh path / errors arrays per call: the functions mutate both.
        const callShapes = [() => [], () => [['root']], () => [['root'], [{path: ['seed'], expected: 'x'}]]];
        for (const extraArgs of callShapes) {
          const want = base(sample, ...extraArgs());
          const got = candidate(sample, ...extraArgs());
          if (!isDeepStrictEqual(got, want)) {
            throw new Error(`faithfulness gate: ${caseName}/${variant} disagrees with base on ${String(sample)}\n got  ${JSON.stringify(got)}\n want ${JSON.stringify(want)}`);
          }
        }
      }
    }
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function main(argv) {
  const opt = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  const runs = Number(opt('runs', 7));
  const ms = Number(opt('ms', 1000));
  const caseNames = opt('cases', Object.keys(CASES).join(',')).split(',');
  faithfulnessGate(caseNames);
  console.log(`faithfulness gate: ok. ${runs} runs x ${ms} ms per path, median, million ops/s (ratio vs base)\n`);
  const self = fileURLToPath(import.meta.url);
  const fmt = (value, base) => `${(value / 1e6).toFixed(1).padStart(6)} (${(value / base).toFixed(2)})`;
  console.log('case/variant'.padEnd(28) + ['valid', 'invalid', 'mixed'].map((path) => path.padStart(15)).join(''));
  for (const caseName of caseNames) {
    let baseRow = null;
    for (const variant of CASES[caseName].variants) {
      const samples = {valid: [], invalid: [], mixed: []};
      for (let i = 0; i < runs; i++) {
        const proc = spawnSync(process.execPath, [self, '--child', caseName, variant, String(ms)], {encoding: 'utf8'});
        if (proc.status !== 0) throw new Error(`${caseName}/${variant} child failed:\n${proc.stderr}`);
        const result = JSON.parse(proc.stdout);
        for (const path of Object.keys(samples)) samples[path].push(result[path]);
      }
      const row = Object.fromEntries(Object.entries(samples).map(([path, values]) => [path, median(values)]));
      baseRow ??= row;
      console.log(`${caseName}/${variant}`.padEnd(28) + ['valid', 'invalid', 'mixed'].map((path) => fmt(row[path], baseRow[path]).padStart(15)).join(''));
    }
  }
}

const childIndex = process.argv.indexOf('--child');
if (childIndex >= 0) child(process.argv[childIndex + 1], process.argv[childIndex + 2], Number(process.argv[childIndex + 3]));
else main(process.argv.slice(2));
