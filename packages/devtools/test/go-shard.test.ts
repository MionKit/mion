// Unit tests for `miondevx core go-shard`: the shards must run every Go package and test exactly once.

import {describe, it, expect, vi} from 'vitest';
import {
  HEAVY,
  main,
  parseShard,
  parseTestLists,
  planShard,
  runPattern,
  runShard,
  shardCommands,
  staleHeavy,
  // @ts-expect-error — a plain .mjs repo script, no types.
} from '../../../scripts/ci/go-shard.mjs';

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

  it('reads each package of one go test -list call: tests, examples and fuzz targets, never benchmarks', () => {
    const stdout = `TestB\nBenchmarkC\nFuzzD\nok  \t${resolver}\t0.01s\nExampleE\nTestA\nok  \t${convert}\t0.02s\n`;
    expect(parseTestLists(stdout)).toEqual(
      new Map([
        [resolver, ['FuzzD', 'TestB']],
        [convert, ['ExampleE', 'TestA']],
      ])
    );
  });

  it('names a heavy package go list no longer has, which would otherwise run whole', () => {
    expect(staleHeavy(packages)).toEqual([]);
    expect(staleHeavy(packages.filter((pkg) => pkg !== apitypes))).toEqual([apitypes]);
  });

  it('finds <i>/<n> wherever it sits among the flags, and refuses one out of range', () => {
    expect(parseShard(['--list', '2/3'])).toEqual({index: 1, count: 3});
    for (const bad of [[], ['0/3'], ['4/3'], ['1/0'], ['x']])
      expect(() => parseShard(bad), bad.join(' ')).toThrow(/expected <i>\/<n>/);
  });

  it('refuses an unknown flag before running anything', async () => {
    await expect(main(['--check', '3'])).rejects.toThrow(/unknown flag --check/);
  });

  it('fails the shard when any one of its runs fails, and passes when all do', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(runShard([['a'], ['b']], '1/3', async () => 0)).resolves.toBeUndefined();
      const oneFails = async (command: string[]) => (command[0] === 'b' ? 1 : 0);
      await expect(runShard([['a'], ['b']], '1/3', oneFails)).rejects.toThrow(/go-shard 1\/3: a go test run failed/);
    } finally {
      log.mockRestore();
    }
  });
});
