// Contract tests for the benchmark CONTAINER lanes.
//
// Everything under `container/benchmarks` runs inside the podman image, so none
// of it is exercised by this repo's CI on a normal PR — which is how a whole
// broken column shipped unnoticed: every `buildErrors` thunk in the typia map
// called `typia.createValidateFn`, an export typia does not have, so 195 cases
// errored and the two "get validation errors" pages rendered no typia column at
// all. The lane still produced a results file and still looked like it ran.
//
// These tests pin the parts of that machinery that can be checked from the host
// without the image: the API names the competitor maps call, the exit-code
// meaning each lane reports, the aggregate step's tolerance for the non-competitor
// artifacts that share `results/`, and the rtx -> bench.mjs verb wiring.

import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {readFileSync, existsSync, mkdtempSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
import {tmpdir} from 'node:os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BENCH_DIR = join(REPO_ROOT, 'container/benchmarks');
const COMPETITORS = ['ts-runtypes', 'zod', 'typebox', 'ajv', 'typia'];

const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

describe('typia competitor map calls real typia exports', () => {
  // typia 13.0.0-dev.20260511 (the version pinned in
  // container/benchmarks/_deps/competitors/typia/package.json), read off its own
  // lib/module.d.ts. `createValidateFn` is NOT among them: it is a RunTypes name
  // that leaked in through one of our own createX -> createXFn renames.
  const TYPIA_EXPORTS = new Set([
    'assert',
    'assertEquals',
    'assertGuard',
    'assertGuardEquals',
    'createAssert',
    'createAssertEquals',
    'createAssertGuard',
    'createAssertGuardEquals',
    'createEquals',
    'createIs',
    'createRandom',
    'createValidate',
    'createValidateEquals',
    'equals',
    'is',
    'random',
    'validate',
    'validateEquals',
  ]);

  const source = read('container/benchmarks/competitors/typia/cases.ts');
  const called = [...new Set([...source.matchAll(/\btypia\.([A-Za-z]+)/g)].map((match) => match[1]))].sort();

  it('calls nothing typia does not export', () => {
    expect(called.filter((name) => !TYPIA_EXPORTS.has(name))).toEqual([]);
  });

  it('never calls the RunTypes-flavoured createValidateFn', () => {
    expect(source).not.toContain('typia.createValidateFn');
  });

  it('still measures both metrics: createIs for validate, createValidate for validationErrors', () => {
    expect(called).toContain('createIs');
    expect(called).toContain('createValidate');
    // The error path always builds from a validate-family export (whose result
    // carries `.success`), never from the boolean `createIs` family.
    const errorPathBuilders = [...source.matchAll(/const val = typia\.([A-Za-z]+)/g)].map((match) => match[1]);
    expect(errorPathBuilders.length).toBeGreaterThan(100);
    expect([...new Set(errorPathBuilders)].filter((name) => !name.startsWith('createValidate'))).toEqual([]);
  });
});

describe('a competitor lane exits non-zero only when it did not really run', () => {
  // A `fail` is a correctness DIVERGENCE from the shared samples. Several
  // competitors have standing ones (an all-optional zod object accepts a value
  // RunTypes rejects), and they are what the alignment audit and the Correctness
  // page exist to record. Exiting non-zero on them made the zod lane print
  // "FAILED (build or run)" on EVERY run, in a message byte-identical to the one
  // a genuinely broken ajv build printed the same day.
  it.each(COMPETITORS)('%s/main.ts exits on errored, not on fail', (competitor) => {
    const source = readFileSync(join(BENCH_DIR, 'competitors', competitor, 'main.ts'), 'utf8');
    expect(source).toContain('process.exit(result.summary.errored ? 1 : 0);');
    expect(source).not.toContain('result.summary.fail +');
  });

  it('bench.mjs tells "did not run" from "errored", and names the missing results file', () => {
    const source = read('scripts/website/bench-data/bench.mjs');
    expect(source).toContain('DID NOT RUN');
    expect(source).toContain('errored case(s)');
    // The distinguishing signal: a lane that never ran wrote no results file. The
    // directory is resolved per RUNTIME (`runtimeResultsDir`) because the same built
    // bundle now runs under node and bun, and bun's results live in their own subdir
    // — so accept either the plain RESULTS_DIR or that resolver, but still require
    // the existence check itself.
    expect(source).toMatch(/existsSync\(join\((?:RESULTS_DIR|runtimeResultsDir\(runtime\)), `\$\{competitor}\.json`\)\)/);
  });
});

describe('aggregate.mjs survives the other artifacts that share results/', () => {
  // `bench-one` clears only <name>.json by design, so an audit / typecost /
  // compiletime run leaves its own files behind and aggregate used to die on the
  // first one with "Cannot read properties of undefined (reading 'map')".
  function runAggregate(files: Record<string, string>): {status: number | null; stdout: string; stderr: string} {
    const dir = mkdtempSync(join(tmpdir(), 'rt-aggregate-'));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    const run = spawnSync(process.execPath, [join(BENCH_DIR, 'aggregate.mjs')], {
      encoding: 'utf8',
      env: {...process.env, RT_BENCH_RESULTS_DIR: dir},
    });
    return {status: run.status, stdout: run.stdout, stderr: run.stderr};
  }

  const competitorResult = (name: string): string =>
    JSON.stringify({
      competitor: name,
      env: {node: process.version, timeMs: 0, noTiming: true},
      summary: {
        total: 1,
        fail: 0,
        errored: 0,
        validate: {ok: 1, fail: 0, errored: 0, notSupported: 0},
        validationErrors: {ok: 0, fail: 0, errored: 0, notSupported: 1},
      },
      cases: [
        {
          key: 'ATOMIC.string',
          suite: 'validation',
          group: 'ATOMIC',
          name: 'string',
          samplesOverridden: false,
          validate: {status: 'ok', validOpsSec: 1000, invalidOpsSec: 900, mixedOpsSec: 950, detail: null},
          validationErrors: {status: 'not-supported', validOpsSec: 0, invalidOpsSec: 0, mixedOpsSec: 0, detail: null},
        },
      ],
    });

  it('renders the table instead of crashing on audit / typecost / env artifacts', () => {
    const run = runAggregate({
      'zod.json': competitorResult('zod'),
      'env.json': JSON.stringify({node: process.version}),
      'zod.alignment.json': JSON.stringify({competitor: 'zod', records: []}),
      'alignment-misalignments.json': JSON.stringify({misalignments: []}),
      'ts-runtypes.typecost.json': JSON.stringify({library: 'ts-runtypes', instantiations: 1}),
      'ts-runtypes.compiletime.json': JSON.stringify({library: 'ts-runtypes', stripMs: 1}),
    });
    expect(run.stderr).not.toContain('TypeError');
    expect(run.status).toBe(0);
    // The table renders the case's group + name, and the competitor as a column.
    expect(run.stdout).toContain('· ATOMIC');
    expect(run.stdout).toContain('zod');
  });

  it('names what it skipped, so a malformed competitor file is not dropped in silence', () => {
    const run = runAggregate({'zod.json': competitorResult('zod'), 'ajv.json': '{ not json'});
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('ajv.json');
    expect(run.stdout).toContain('unreadable JSON');
  });
});

describe('rtx bench sub-verbs reach bench.mjs', () => {
  // rtx dies with "unknown bench target" before bench.mjs is ever imported when a
  // verb is missing from BENCH_SUB, so the two lists have to agree.
  const rtx = read('scripts/rt.mjs');
  const bench = read('scripts/website/bench-data/bench.mjs');
  const exposed = [...(/const BENCH_SUB = new Set\(\[([^\]]*)]/.exec(rtx)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
    (match) => match[1]
  );
  const dispatched = new Set([...bench.matchAll(/case '([^']+)':/g)].map((match) => match[1]));

  it('exposes at least the verbs this repo documents', () => {
    expect(exposed).toContain('typecheck');
    expect(exposed).toContain('smoke');
  });

  it('every exposed verb has a dispatch case', () => {
    expect(exposed.filter((verb) => !dispatched.has(verb))).toEqual([]);
  });

  it('CI runs the competitor-map typecheck gate', () => {
    expect(read('.github/workflows/ci.yml')).toContain('pnpm rtx bench typecheck');
  });

  it('every competitor project lists its own first-party sources, so the gate covers them', () => {
    for (const competitor of COMPETITORS) {
      const dir = join(BENCH_DIR, 'competitors', competitor);
      const {include} = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
      // Each map annotated `CompetitorCases` is a totality claim; the gate only
      // proves it for files the project actually compiles.
      const maps = ['cases.ts', 'schemaCases.ts', 'jsonSchemaCases.ts', 'specCases.ts'].filter(
        (file) => existsSync(join(dir, file)) && readFileSync(join(dir, file), 'utf8').includes('CompetitorCases')
      );
      for (const map of maps) expect(include, `${competitor}/tsconfig.json`).toContain(map);
      expect(include).toContain('../../shared');
    }
  });
});
