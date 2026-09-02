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
// meaning each lane reports, the tolerance both results readers (aggregate.mjs and
// the website's gen-docs.mjs) have for the non-competitor artifacts that share
// `results/`, and the miondevx -> bench.mjs verb wiring.

import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, dirname, join} from 'node:path';
import {tmpdir} from 'node:os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BENCH_DIR = join(REPO_ROOT, 'container/benchmarks');
const COMPETITORS = ['mion', 'zod', 'typebox', 'ajv', 'typia'];

const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

// What `writeResults` in container/benchmarks/typecost/typecost.mjs ACTUALLY drops next
// to the timing results. This exact object is why the published validation tables shipped
// zod / typebox / typia twice with their real numbers blanked: it carries `competitor` and
// `cases`, so every shape test built on those two fields absorbed it as a sixth
// competitor. Built here from the writer's own field names, because the fixture this
// replaced was invented (`{library, instantiations}`) and therefore proved nothing.
const typecostArtifact = (form: string): string =>
  JSON.stringify({
    competitor: form,
    cases: [{key: 'ATOMIC.string', group: 'ATOMIC', name: 'string', instantiations: 12}],
    total: 12,
  });

describe('the typecost artifact fixture tracks the real writer', () => {
  it('still matches what container/benchmarks/typecost/typecost.mjs writes', () => {
    const source = read('container/benchmarks/typecost/typecost.mjs');
    // If the writer's shape changes, the fixture has to follow or the regression tests
    // below silently stop testing the real thing — which is exactly how this shipped.
    expect(source).toContain('const out = {competitor, cases, total};');
    expect(source).toContain('`${competitor}.typecost.json`');
  });
});

describe('typia competitor map calls real typia exports', () => {
  // typia 13.2.0 (the version pinned in
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

describe('the shared cases never assert a presentation-only format tag as failable', () => {
  // How a permanent fake correctness failure shipped: the shared `number_float` case
  // titled FormatFloat "non-integer only" and listed [1, 0, -2] as invalid, but `float`
  // is a generation/presentation tag that NEVER fails (a float legally holds 2.0), so
  // RunTypes accepted all three and the lane reported a divergence against itself on
  // every run. No unit test could catch it: the shared cases are data, the packages/
  // suites keep their own copy, and a wrong label fails nothing until two libraries
  // disagree. This pins the whole class instead of that one case.
  //
  // The non-failable tags are DERIVED from the format sources rather than listed here,
  // so a newly added presentation-only param is covered the day it lands.
  const FORMATS_DIR = join(REPO_ROOT, 'packages/run-types/src/formats');
  const NON_FAILABLE_DOC = /NEVER a failable constraint|PURE PRESENTATION METADATA/;

  function tsFiles(dir: string): string[] {
    return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return tsFiles(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
  }

  // Every param whose own JSDoc block declares it non-failable: take the identifier that
  // opens the declaration right after the block's `*/`.
  const nonFailableTags = new Set(
    tsFiles(FORMATS_DIR).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\/\*\*([\s\S]*?)\*\/\s*([A-Za-z_$][\w$]*)\??\s*:/g)]
        .filter((match) => NON_FAILABLE_DOC.test(match[1]))
        .map((match) => match[2])
    )
  );

  it('finds the documented non-failable tags, so the derivation cannot go quietly empty', () => {
    expect([...nonFailableTags].sort()).toEqual(['float', 'isCurrency']);
  });

  it('declares no expectedFormatErrors on any of them', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(join(BENCH_DIR, 'shared/cases'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/formatPathTail:\s*'([^']+)'/g)) {
        if (nonFailableTags.has(match[1])) offenders.push(`${file.slice(REPO_ROOT.length + 1)}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
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
      env: {...process.env, MION_VALIDATION_BENCH_RESULTS_DIR: dir},
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
      'zod.typecost.json': typecostArtifact('zod'),
      'mion-type.typecost.json': typecostArtifact('mion-type'),
      'mion.compiletime.json': JSON.stringify({library: 'mion', stripMs: 1}),
    });
    expect(run.stderr).not.toContain('TypeError');
    expect(run.status).toBe(0);
    // zod gets ONE column. `zod.typecost.json` sorts after `zod.json`, so when it was
    // absorbed it also won the by-name lookup and blanked zod's real numbers.
    const headers = run.stdout.split('\n').filter((line) => line.trimStart().startsWith('case'));
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header.match(/zod/g)?.length).toBe(1);
    expect(run.stdout).not.toContain('mion-type');
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

describe('gen-docs.mjs reads results/ the same way everywhere', () => {
  // Same class of bug as the aggregate one above, one directory up: the strict lane's
  // reader carried its OWN filename blocklist, that copy never learned about the audit
  // lane's <competitor>.alignment.json, and `pnpm miondevx website build` (which runs the
  // audit right before gen-docs) died with "Cannot read properties of undefined
  // (reading 'map')" — a red website deploy with the site already built.
  //
  // Filtering on shape alone then shipped the NEXT one: `<form>.typecost.json` carries
  // `competitor` + `cases` too. Both readers now share
  // container/benchmarks/_lib/read-results.mjs, which leads on the FILENAME (a result is
  // always `<name>.json`, every artifact is `<name>.<kind>.json`).
  const results = (name: string, key: string, suite: string): string =>
    JSON.stringify({
      competitor: name,
      cases: [
        {
          key,
          suite,
          group: key.split('.')[0],
          name: key.split('.')[1],
          validate: {status: 'ok', validOpsSec: 1, invalidOpsSec: 1, mixedOpsSec: 1},
          validationErrors: {status: 'ok', validOpsSec: 1, invalidOpsSec: 1, mixedOpsSec: 1},
        },
      ],
      summary: {total: 1, fail: 0, errored: 0},
    });

  // gen-docs.mjs is a plain script with no declarations, so call its reader out of
  // process (the same shape the aggregate tests above use) rather than importing it.
  function readResults(dir: string): {competitors: string[]; firstCaseKey: string | null; error?: string} {
    const genDocs = pathToFileURL(join(REPO_ROOT, 'scripts/website/bench-data/gen-docs.mjs')).href;
    const script = `
      const {readCompetitorResults} = await import(${JSON.stringify(genDocs)});
      try {
        const results = readCompetitorResults(process.argv[1]);
        process.stdout.write(JSON.stringify({competitors: results.map((r) => r.competitor), firstCaseKey: results[0]?.cases[0]?.key ?? null}));
      } catch (err) {
        process.stdout.write(JSON.stringify({competitors: [], firstCaseKey: null, error: err.message}));
      }
    `;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script, dir], {encoding: 'utf8'});
    expect(run.stderr).not.toContain('TypeError');
    expect(run.status, run.stderr).toBe(0);
    return JSON.parse(run.stdout);
  }

  function resultsDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'rt-gen-docs-'));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    return dir;
  }

  it('keeps the competitor results and skips every other artifact that shares the dir', () => {
    const dir = resultsDir({
      'zod.json': results('zod', 'ATOMIC.string', 'validation'),
      'env.json': JSON.stringify({node: process.version}),
      'zod.alignment.json': JSON.stringify({competitor: 'zod', records: [], totals: {misalignments: 0}}),
      'alignment-misalignments.json': JSON.stringify({misalignments: []}),
      'mion.compiletime.json': JSON.stringify({library: 'mion', stripMs: 1}),
      'transform-wire.json': JSON.stringify({mode: 'go', samples: []}),
      // Carries both `competitor` and `cases`, so only the name rules it out.
      'zod.spec.json': results('zod', 'JSON_SCHEMA.type', 'validation'),
      'broken.json': '{ not json',
    });
    expect(readResults(dir)).toEqual({competitors: ['zod'], firstCaseKey: 'ATOMIC.string'});
  });

  it('never absorbs a typecost artifact as a competitor', () => {
    // The regression test for the shipped bug. `zod.typecost.json` used to become a
    // second zod column AND, sorting after `zod.json`, win the by-name lookup — so both
    // zod columns rendered n-a. `mion-*.typecost.json` added two bogus columns.
    const dir = resultsDir({
      'zod.json': results('zod', 'ATOMIC.string', 'validation'),
      'zod.typecost.json': typecostArtifact('zod'),
      'typebox.typecost.json': typecostArtifact('typebox'),
      'mion-type.typecost.json': typecostArtifact('mion-type'),
      'mion-schema.typecost.json': typecostArtifact('mion-schema'),
    });
    expect(readResults(dir)).toEqual({competitors: ['zod'], firstCaseKey: 'ATOMIC.string'});
  });

  it('fails loudly when two files claim the same competitor, instead of duplicating its column', () => {
    // Belt and braces behind the filename rule: whatever a future artifact is named,
    // a duplicate name must never reach the published table quietly.
    const dir = mkdtempSync(join(tmpdir(), 'rt-gen-docs-dup-'));
    writeFileSync(join(dir, 'zod.json'), results('zod', 'ATOMIC.string', 'validation'));
    writeFileSync(join(dir, 'zodcopy.json'), results('zod', 'ATOMIC.number', 'validation'));
    const {competitors, error} = readResults(dir);
    expect(competitors).toEqual([]);
    expect(error).toContain("two results for competitor 'zod'");
    expect(error).toContain('zod.json');
    expect(error).toContain('zodcopy.json');
  });

  it('returns nothing for a lane directory that was never written', () => {
    // The bun lane's subdir is absent whenever MION_VALIDATION_BENCH_BUN=0.
    expect(readResults(join(tmpdir(), 'rt-gen-docs-absent-lane'))).toEqual({competitors: [], firstCaseKey: null});
  });

  it('has one results-directory reader, shared with aggregate.mjs', () => {
    const genDocs = read('scripts/website/bench-data/gen-docs.mjs');
    const aggregate = read('container/benchmarks/aggregate.mjs');
    // buildSampleMap walks shared/cases/**; nothing in gen-docs lists results/ any more.
    expect([...genDocs.matchAll(/readdirSync\(/g)]).toHaveLength(1);
    expect([...aggregate.matchAll(/readdirSync\(/g)]).toHaveLength(0);
    expect(genDocs).toContain("from '../../../container/benchmarks/_lib/read-results.mjs'");
    expect(aggregate).toContain("from './_lib/read-results.mjs'");
    expect(genDocs).toContain('export function readCompetitorResults(dir)');
  });
});

describe('the strict suite is a section of the validation bench, not its own page', () => {
  // It used to be a third bench with a per-runtime column dimension (each library once
  // per JavaScript engine), which made a table nobody could read.
  const genDocs = read('scripts/website/bench-data/gen-docs.mjs');

  it('emits no strict bench at all', () => {
    expect(genDocs).not.toContain('emitStrictBench');
    expect(genDocs).not.toContain("bench: 'strict'");
  });

  it('does not filter strict rows out of the validation bench', () => {
    expect(genDocs).not.toContain("row.suite === 'strict'");
  });

  it('labels the section for what it measures', () => {
    expect(genDocs).toContain("STRICT: 'Strict (no unknown keys)'");
  });

  it('has no strict page left in the content tree', () => {
    expect(existsSync(join(REPO_ROOT, 'container/website/content/03.benchmarks/02.runtypes/09.strict.md'))).toBe(false);
  });

  it('keeps the per-engine counter pinned by the bench lane instead', () => {
    // Dropping the published column must not drop the invariant it used to show.
    const bench = read('scripts/website/bench-data/bench.mjs');
    expect(bench).toContain('function checkEngineBranch');
    expect(bench).toContain('rt::countEnumKeys');
  });
});

describe('the STRICT case set', () => {
  const STRICT_CASES = ['flat_required', 'nested_required', 'moltar_dto', 'realworld_order'];
  const shared = read('container/benchmarks/shared/cases/strict/index.ts');

  // The body of `export interface <name> { … }`, taken up to the closing brace in
  // column 0. A regex cannot do this: the bodies nest inline object types.
  function declaredInterface(name: string): string {
    const start = shared.indexOf(`export interface ${name} {`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const end = shared.indexOf('\n}', start);
    expect(end, `${name} has no closing brace`).toBeGreaterThan(start);
    return shared.slice(start, end);
  }

  it('every competitor map carries all of them, so no column can be missing', () => {
    // EVERY map annotated `CompetitorCases`, not just cases.ts. The mion
    // competitor also authors schemaCases.ts (the builder form), which is total over
    // the same CaseKey union — adding a case to cases.ts alone leaves it red, and this
    // test looked only at cases.ts when that first happened.
    for (const competitor of COMPETITORS) {
      const dir = join(BENCH_DIR, 'competitors', competitor);
      const maps = ['cases.ts', 'schemaCases.ts'].filter(
        (file) => existsSync(join(dir, file)) && readFileSync(join(dir, file), 'utf8').includes('CompetitorCases')
      );
      expect(maps.length, `${competitor} has no CompetitorCases map`).toBeGreaterThan(0);
      for (const map of maps) {
        const source = readFileSync(join(dir, map), 'utf8');
        for (const key of STRICT_CASES)
          expect(source, `${competitor}/${map} is missing STRICT.${key}`).toContain(`'STRICT.${key}'`);
      }
    }
  });

  it('keeps the first three all-required, so the key-count fast path keeps its coverage', () => {
    // countFastPathN only emits `cntEK(v) !== N` for an all-required object with no
    // index signature. An optional slipped into these three would silently drop the
    // per-engine counter's only benchmark coverage.
    for (const name of ['StrictFlat', 'StrictNested', 'StrictMoltarDto']) {
      expect(declaredInterface(name), `${name} must stay all-required`).not.toMatch(/\w\?:/);
    }
  });

  it('realworld_order says strict means no unknown keys, not all-required', () => {
    // The DTO keeps REALWORLD.order's optional `note`, so this case rides the key-array
    // scan rather than the count check. That is the point: the samples have to accept the
    // optional key both present and absent, and reject an UNDECLARED one.
    const order = declaredInterface('StrictOrder');
    expect(order).toContain('note?: string;');
    const samples = /realworld_order: \{[\s\S]*?\n  \},/.exec(shared)?.[0] ?? '';
    expect(samples).toContain("note: 'leave at the door'"); // valid WITH the optional key
    expect(samples).toContain('extra: 1'); // invalid: an undeclared key
    expect(samples).toContain('not-an-object');
  });
});

describe('miondevx bench sub-verbs reach bench.mjs', () => {
  // miondevx dies with "unknown bench target" before bench.mjs is ever imported when a
  // verb is missing from BENCH_SUB, so the two lists have to agree.
  const miondevx = read('scripts/miondevx.mjs');
  const bench = read('scripts/website/bench-data/bench.mjs');
  const exposed = [...(/const BENCH_SUB = new Set\(\[([^\]]*)]/.exec(miondevx)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
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
    expect(read('.github/workflows/ci.yml')).toContain('pnpm miondevx bench typecheck');
  });

  it('every competitor project lists its own first-party sources, so the gate covers them', () => {
    for (const competitor of COMPETITORS) {
      const dir = join(BENCH_DIR, 'competitors', competitor);
      const {include} = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
      // Each map annotated `CompetitorCases` is a totality claim; the gate only
      // proves it for files the project actually compiles.
      const maps = ['cases.ts', 'schemaCases.ts'].filter(
        (file) => existsSync(join(dir, file)) && readFileSync(join(dir, file), 'utf8').includes('CompetitorCases')
      );
      for (const map of maps) expect(include, `${competitor}/tsconfig.json`).toContain(map);
      expect(include).toContain('../../shared');
    }
  });
});

describe('the typia lane pins a toolchain that agrees with itself', () => {
  // How the release gate's benchmark job broke: the lane pinned a typia DEV build whose
  // package exports mapped `./lib/internal/*.mjs` to files the tarball did not ship,
  // next to a ttsc line whose transform still emitted those imports, so esbuild died on
  // `Could not resolve "typia/lib/internal/_isMultipleOf"`. The image's install and
  // warm steps were both non-fatal, so the broken lane still produced an image.
  const manifest = JSON.parse(read('container/benchmarks/_deps/competitors/typia/package.json')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const exact = /^\d+\.\d+\.\d+$/;

  it('pins a stable typia release, never a dev build', () => {
    expect(manifest.dependencies.typia).toMatch(exact);
  });

  it('pins ttsc and @ttsc/unplugin to the same release (the unplugin peers its exact ttsc line)', () => {
    expect(manifest.devDependencies.ttsc).toMatch(exact);
    expect(manifest.devDependencies['@ttsc/unplugin']).toBe(manifest.devDependencies.ttsc);
  });

  it('installs the typescript package ttsc resolves for the native compiler, not the preview package', () => {
    // ttsc >= 0.19 resolves `typescript` (7 ships the native tsgo binary as
    // @typescript/typescript-<platform>) and refuses to run without it.
    expect(manifest.devDependencies.typescript).toMatch(exact);
    expect(Number(manifest.devDependencies.typescript.split('.')[0])).toBeGreaterThanOrEqual(7);
    expect(manifest.devDependencies).not.toHaveProperty('@typescript/native-preview');
  });
});

describe('the image bakes the compiled typia plugin, or fails to build', () => {
  const containerfile = read('container/website/Containerfile');

  it('installs typia fatally, like every other lane', () => {
    expect(containerfile).not.toContain('typia install failed');
    expect(containerfile).toMatch(/cd \/bench\/competitors\/typia && pnpm install --no-frozen-lockfile\n/);
  });

  it('proves the compiled plugin sits under node_modules/.cache/ttsc before the layer ends', () => {
    // ttsc >= 0.19 caches plugins under <workspace>/node_modules/.cache/ttsc/plugins/<key>/plugin;
    // the old `.ttsc` dir is never created, so a `test -d node_modules/.ttsc` proved nothing.
    expect(containerfile).toContain('find node_modules/.cache/ttsc/plugins -type f -name plugin');
    expect(containerfile).not.toContain('node_modules/.ttsc');
    expect(containerfile).not.toContain('ttsc warm skipped');
  });

  it('drops the Go build cache the warm leaves behind, in the same layer', () => {
    expect(containerfile).toContain('rm -rf node_modules/.cache/ttsc/go-build');
  });

  it('lets every CI lane run typia now that the plugin is baked', () => {
    for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/pr-heavy.yml']) {
      expect(read(workflow), workflow).not.toContain("MION_VALIDATION_BENCH_NO_TYPIA: '1'");
    }
    // --quick used to skip typia by default ("its native build dominates"); it no longer does.
    expect(read('scripts/website/bench-data/bench.mjs')).not.toContain("setIfUnset('MION_VALIDATION_BENCH_NO_TYPIA'");
  });
});

describe("typia's esbuild wrapper leaves the shared harness to esbuild", () => {
  // @ttsc/unplugin compiles the project its `project` option names and emits only that
  // project's OWN files. The shared harness under ../../shared is in the program (it is in
  // the tsconfig `include`) but never emitted: asking the adapter for it fails the build
  // with "ttsc transform did not return output for .../shared/harness/audit.ts".
  const source = read('container/benchmarks/competitors/typia/esbuild.config.mjs');

  it('names its own tsconfig as the ttsc project for the bench bundle', () => {
    expect(source).toContain("plugins: [typiaTsgo(path.join(here, 'tsconfig.json'))]");
  });

  it('hands files outside the project dir back to esbuild instead of the adapter', () => {
    expect(source).toContain('if (!args.path.startsWith(projectDir + path.sep)) return undefined;');
  });
});

describe('the all-optional zod cases keep the plain-object guard', () => {
  // The Correctness page states zod agrees with RunTypes on every sample, the alignment
  // report records zod's plain-object guard as deliberate, and aggregate.mjs fails the
  // release gate on any `fail`. z.object alone accepts a Date / Map / Set / RegExp for an
  // all-optional shape, and a `.refine` sees the parsed copy, so the guard has to wrap
  // the schema from the input side (z.custom(...).pipe(schema)).
  const source = read('container/benchmarks/competitors/zod/cases.ts');
  const entry = (key: string): string => {
    const start = source.indexOf(`'${key}': {`);
    expect(start, `${key} not found`).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('\n  },', start));
  };

  it('defines the guard on the input side of the object schema', () => {
    expect(source).toMatch(
      /const plainObject = [\s\S]*?z\s*\.custom<Input>\([\s\S]*?'\[object Object\]'\)[\s\S]*?\.pipe\(schema\)/
    );
  });

  it.each(['OBJECT.interface_all_optional', 'UTILITY.partial', 'UTILITY.deep_partial_recursive_mapped'])(
    '%s wraps its schema in it',
    (key) => {
      expect(entry(key)).toContain('plainObject(');
      expect(entry(key)).not.toContain('samples:');
    }
  );
});
