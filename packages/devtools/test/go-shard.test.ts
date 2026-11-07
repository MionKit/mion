// Unit tests for `miondevx core go-shard`: the shards must run every Go package and test exactly once.

import {describe, it, expect} from 'vitest';
// @ts-expect-error — a plain .mjs repo script, no types.
import {HEAVY, coverageErrors, parseTestList, planShard, runPattern, shardCommands} from '../../../scripts/ci/go-shard.mjs';

type Plan = {light: string[]; heavy: {pkg: string; tests: string[]}[]};

const [resolver, convert, apitypes] = HEAVY as string[];
const light = ['m/cmd/a', 'm/cmd/b', 'm/internal/c', 'm/internal/d', 'm/internal/e'];
const packages = [...light, resolver, convert, apitypes].sort();
const testsOf = new Map([
  [resolver, ['TestA', 'TestB', 'TestC', 'TestD', 'FuzzE', 'ExampleF', 'TestG']],
  [convert, ['TestOnly']],
  [apitypes, ['TestX', 'TestY']],
]);

const plans = (count: number): Plan[] => Array.from({length: count}, (_, index) => planShard({packages, testsOf, index, count}));
const selects = (plan: Plan, pkg: string, test: string): boolean =>
  plan.heavy.some((part) => part.pkg === pkg && new RegExp(runPattern(part.tests)).test(test));

describe('go-shard', () => {
  for (const count of [1, 2, 3]) {
    it(`runs every light package and every heavy test exactly once across ${count} shard(s)`, () => {
      const all = plans(count);
      for (const pkg of light)
        expect(
          all.filter((plan) => plan.light.includes(pkg)),
          pkg
        ).toHaveLength(1);
      for (const [pkg, tests] of testsOf)
        for (const test of tests)
          expect(
            all.filter((plan) => selects(plan, pkg, test)),
            `${pkg} ${test}`
          ).toHaveLength(1);
      for (const plan of all) for (const pkg of testsOf.keys()) expect(plan.light).not.toContain(pkg);
      expect(coverageErrors({packages, testsOf, count})).toEqual([]);
    });
  }

  it('matches whole test names only, so TestA never selects TestAB', () => {
    expect(new RegExp(runPattern(['TestA'])).test('TestAB')).toBe(false);
    expect(new RegExp(runPattern(['TestA', 'TestB'])).test('TestB')).toBe(true);
  });

  it('drops a heavy package with no test in the shard instead of running it whole', () => {
    const commands = shardCommands(planShard({packages, testsOf, index: 1, count: 3})) as string[][];
    expect(commands.some((command) => command.includes(convert))).toBe(false);
    expect(commands.at(-1)?.[0]).toBe('test');
  });

  it('reads tests, examples and fuzz targets from go test -list, never benchmarks or the ok line', () => {
    expect(parseTestList('TestB\nBenchmarkC\nFuzzD\nExampleE\nTestA\nok  \tm/x\t0.01s\n')).toEqual([
      'ExampleE',
      'FuzzD',
      'TestA',
      'TestB',
    ]);
  });

  it('fails the check when a heavy package is gone from go list', () => {
    const errors = coverageErrors({
      packages: packages.filter((pkg) => pkg !== apitypes),
      testsOf: new Map([...testsOf].slice(0, 2)),
      count: 3,
    });
    expect(errors).toEqual([`${apitypes} is listed as heavy but go list no longer has it`]);
  });
});
