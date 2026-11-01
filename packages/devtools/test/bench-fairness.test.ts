// The benchmark's fairness machinery that runs on the host, from the timing loop to each competitor's settings.
import {describe, expect, it, vi} from 'vitest';
import ts from 'typescript';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
// Untyped dev scripts: one directive per import line, so the formatter cannot wrap an import away from its error.
// @ts-expect-error untyped .mjs
import {makeExtractors} from '../../../container/benchmarks/_lib/extract-cases.mjs';
// @ts-expect-error untyped .mjs
import {stripReturnPredicates} from '../../../container/benchmarks/competitors/typia/strip-predicates.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');
// Loaded by a computed path: the harness pulls in the shared cases, whose Temporal globals this package's tsconfig lacks.
const harness = (file: string) => import(join(REPO_ROOT, 'container/benchmarks/shared/harness', file));

describe('benchOps times batches of many calls', () => {
  it('reads the clock once per 1000 or more validator calls, and calls the validator on every sample', async () => {
    vi.stubEnv('MION_VALIDATION_BENCH_TIME_MS', '5');
    vi.resetModules();
    const {benchOps} = await harness('measure.ts');
    const seen = new Set<unknown>();
    let calls = 0;
    const validator = (value: unknown) => {
      calls++;
      seen.add(value);
      return true;
    };
    const clock = vi.spyOn(performance, 'now');
    const opsPerSec = benchOps(validator, ['a', 'b']);
    const reads = clock.mock.calls.length;
    clock.mockRestore();
    vi.unstubAllEnvs();
    expect(opsPerSec).toBeGreaterThan(0);
    expect([...seen]).toEqual(['a', 'b']);
    // the 2000-call warm-up runs before the clock starts; a timed batch makes >= 1000 calls between clock reads
    expect((calls - 2000) / reads).toBeGreaterThanOrEqual(500);
  });

  it('returns 0 for an empty sample list without calling the validator', async () => {
    const {benchOps} = await harness('measure.ts');
    const validator = vi.fn(() => true);
    expect(benchOps(validator, [])).toBe(0);
    expect(validator).not.toHaveBeenCalled();
  });
});

describe('a case with no samples is not-supported, never ok', () => {
  it('skips the builder and reports why', async () => {
    const {runCompetitor} = await harness('runner.ts');
    const builder = vi.fn(() => () => true);
    // ATOMIC.symbol has no samples: mion refuses a bare symbol at the root as non-data
    const result = runCompetitor({name: 'probe', cases: {'ATOMIC.symbol': builder} as never});
    const symbol = result.cases.find((kase: {key: string}) => kase.key === 'ATOMIC.symbol');
    expect(builder).not.toHaveBeenCalled();
    expect(symbol?.validate).toMatchObject({status: 'not-supported', detail: 'the case has no samples'});
  });
});

describe('the case extractor reads each call verbatim', () => {
  const fixture = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'extract-cases-'));
    const file = join(dir, 'cases.ts');
    writeFileSync(
      file,
      [
        'export const cases: CompetitorCases = {',
        "  'A.typed': {build: () => createValidateFn<{a: string}>(undefined, {checkUnknowns: true})},",
        "  'A.equals': {build: () => { const check = typia.createEquals<{b: number}>(); return (v) => check(v); }},",
        "  'A.builder': {build: () => createValidateFn(RT.object({c: TF.string()}))},",
        "  'A.none': NOT_SUPPORTED,",
        '};',
      ].join('\n')
    );
    return file;
  };

  it('matches any listed call name and keeps its options', () => {
    const {extractTypeForm} = makeExtractors(ts);
    const model = extractTypeForm(fixture(), 'cases', ['createValidateFn', 'typia.createEquals']);
    expect(model.keys).toEqual(['A.typed', 'A.equals', 'A.builder', 'A.none']);
    expect(model.entries['A.typed']).toMatchObject({
      typeText: '{a: string}',
      callText: 'createValidateFn<{a: string}>(undefined, {checkUnknowns: true})',
    });
    expect(model.entries['A.equals'].typeText).toBe('{b: number}');
    // a builder-form call has no type argument: only allowUntyped takes it
    expect(model.entries['A.builder']).toBeUndefined();
  });

  it('takes a builder-form call with allowUntyped, with no type text', () => {
    const {extractTypeForm} = makeExtractors(ts);
    const model = extractTypeForm(fixture(), 'cases', ['createValidateFn'], {allowUntyped: true});
    expect(model.entries['A.builder']).toMatchObject({typeText: null, callText: 'createValidateFn(RT.object({c: TF.string()}))'});
  });
});

describe("typia's predicate strip", () => {
  it('skips a nested function type, so the strip ends at the predicate arrow', () => {
    expect(stripReturnPredicates('const f = (input): input is {cb: () => void; a: Array<number>} => check(input);')).toBe(
      'const f = (input) => check(input);'
    );
  });

  it('consumes a parenthesized union arm whole', () => {
    expect(stripReturnPredicates('x = (input): input is A | (B) => y;')).toBe('x = (input) => y;');
  });
});

describe('the side benches compare the same work', () => {
  const compiletime = read('container/benchmarks/compiletime/compiletime.mjs');
  const typecost = read('container/benchmarks/typecost/typecost.mjs');

  it('compiletime builds both libraries over the cases both support, each call verbatim', () => {
    expect(compiletime).toContain('model.keys.filter((k) => model.entries[k] && other.entries[k])');
    expect(compiletime).toContain('e.callText');
    expect(compiletime).toContain("typia: ['typia.createIs', 'typia.createEquals']");
  });

  it('compiletime fails a build that exits non-zero, and the probe emits so the typia transform runs', () => {
    expect(compiletime).toMatch(/if \(r\.error \|\| r\.status !== 0\)[\s\S]{0,200}throw new Error/);
    expect(compiletime).toContain('noEmit: false');
  });

  it('typecost counts typia STRICT and refuses a baseline that does not compile', () => {
    expect(typecost).toContain("['typia.createIs', 'typia.createEquals']");
    expect(typecost).toMatch(/does not compile/);
    expect(typecost).toContain("'TF.string()'");
  });
});

describe('each competitor runs with the settings that make it do mion work', () => {
  it('typia rejects NaN / Infinity at every number (finite plugin option)', () => {
    const {compilerOptions} = JSON.parse(read('container/benchmarks/competitors/typia/tsconfig.json'));
    expect(compilerOptions.plugins).toContainEqual({transform: 'typia/lib/transform', finite: true});
  });

  it('TypeBox collects every error (no default cap)', () => {
    expect(read('container/benchmarks/competitors/typebox/cases.ts')).toContain('Settings.Set({maxErrors: Infinity});');
  });

  it('ajv keeps its strict defaults, whose strictNumbers rejects NaN / Infinity', () => {
    expect(read('container/benchmarks/competitors/ajv/cases.ts')).not.toMatch(/strict\w*:\s*false/);
  });

  it('the bench table fills a skipped case per metric (bytes are lower-is-better inside an ops bench)', () => {
    expect(read('container/website/app/components/content/BenchTable.vue')).toContain(
      'aggregateRows(orderedSections.value, index.value.competitors, metricKey, lowerBetterFor(metricKey))'
    );
  });
});
