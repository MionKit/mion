// Contract tests for the fuzz lanes and their budget tiers.
//
// The lane list lives in ONE place — the `FUZZ` registry in scripts/miondevx.mjs —
// and everything else derives from it or is pinned to it here:
//   - release-gate.yml and fuzz-soak.yml derive their soak matrices at runtime
//     via `miondevx core fuzz-lanes` (pinned: the emitter's output matches the
//     registry, and both workflows actually invoke it into a fromJSON matrix).
//   - fuzz-soak.yml's `lane` dispatch options are the one copy that can never
//     be derived (GitHub resolves choice options before any job runs), so that
//     list is pinned equal to the registry.
//   - ci.yml runs every lane on every PR at its QUICK budget; the lane names,
//     env values and the sweep's exclude list there are pinned to the
//     registry's `quick` blocks so the per-PR tier cannot silently drift.
//
// Why so paranoid: both failure shapes have already happened. A dead
// `jsonschema` lane sat in the gate's matrix after the suite was removed and
// broke the first round of the v0.12.0 release, and `roundtrip` / `size` /
// `nondata` had registered soak env vars with no registry entry to set them,
// so those budgets were unreachable for months
// (docs/done/drain-fuzz-soak-backlog.md).

import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

const miondevx = read('scripts/miondevx.mjs');
const releaseGate = read('.github/workflows/release-gate.yml');
const fuzzSoak = read('.github/workflows/fuzz-soak.yml');
const ci = read('.github/workflows/ci.yml');

// One registry entry per line (the registry comment pins that layout for this
// parser's sake): name, then the tier blocks parsed out of the body.
type Lane = {patterns: string[]; quick: Record<string, string>; soak: Record<string, string>};
const registry = ((): Record<string, Lane> => {
  const start = miondevx.indexOf('const FUZZ = {');
  const block = miondevx.slice(start, miondevx.indexOf('\n};', start));
  const lanes: Record<string, Lane> = {};
  for (const [, lane, body] of block.matchAll(/^ {2}(\w+): \{(.*)$/gm)) {
    const tier = (name: string): Record<string, string> => {
      const match = new RegExp(`\\b${name}: \\{([^}]*)\\}`).exec(body);
      return match ? Object.fromEntries([...match[1].matchAll(/(\w+): '([^']*)'/g)].map(([, k, v]) => [k, v])) : {};
    };
    const patterns = [...(/\bpatterns: \[([^\]]*)\]/.exec(body)?.[1] ?? '').matchAll(/'([^']*)'/g)].map(([, p]) => p);
    lanes[lane] = {patterns, quick: tier('quick'), soak: tier('soak')};
  }
  return lanes;
})();

const soakLanes = Object.keys(registry)
  .filter((lane) => Object.keys(registry[lane].soak).length > 0)
  .sort();
// The scheduling split the budgets encode: time-boxed lanes (a *_SOAK_MS wall
// clock — must never share CPU) vs count-based lanes (fixed coverage).
const timeBoxedLanes = soakLanes.filter((lane) => Object.keys(registry[lane].soak).some((k) => k.endsWith('_SOAK_MS'))).sort();
const countBasedLanes = soakLanes.filter((lane) => !timeBoxedLanes.includes(lane)).sort();

// A workflow list written as a YAML block sequence (only the dispatch options
// remain in that shape — the matrices are derived at runtime).
const yamlLaneBlock = (source: string, after: string): string[] => {
  const at = source.indexOf(after);
  const rest = source.slice(at + after.length);
  const lines = rest.split('\n').slice(1);
  const lanes: string[] = [];
  for (const line of lines) {
    const item = /^\s*- ([a-z0-9]+)\s*$/.exec(line);
    if (!item) break;
    lanes.push(item[1]);
  }
  return lanes.sort();
};
const dispatchOptions = yamlLaneBlock(fuzzSoak, '\n        options:').filter((lane) => lane !== 'all');

// One ci.yml step's slice, so env values can be pinned to the step that owns them.
const ciStep = (stepName: string): string => {
  const at = ci.indexOf(`- name: ${stepName}`);
  if (at === -1) throw new Error(`ci.yml: no step named '${stepName}'`);
  const next = ci.indexOf('- name:', at + 1);
  return ci.slice(at, next === -1 ? undefined : next);
};

describe('the lane list has one source of truth: the miondevx FUZZ registry', () => {
  it('the registry actually yields soak lanes', () => {
    // Guards the parser itself: a rewritten registry that stops matching would
    // otherwise make every comparison below trivially pass on empty lists.
    expect(soakLanes.length).toBeGreaterThan(5);
    expect(soakLanes).toContain('convert');
    expect(timeBoxedLanes.length).toBeGreaterThan(2);
    expect(countBasedLanes.length).toBeGreaterThan(2);
  });

  it('`miondevx core fuzz-lanes` emits exactly the soak lanes (the matrix source)', () => {
    const emitted = spawnSync('node', ['scripts/miondevx.mjs', 'core', 'fuzz-lanes'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(emitted.status).toBe(0);
    expect((JSON.parse(emitted.stdout) as string[]).sort()).toEqual(soakLanes);
  });

  for (const [name, source] of [
    ['release-gate.yml', releaseGate],
    ['fuzz-soak.yml', fuzzSoak],
  ] as const) {
    it(`${name} derives its matrix from the emitter`, () => {
      expect(source).toContain('node scripts/miondevx.mjs core fuzz-lanes');
      expect(source).toContain('lane: ${{ fromJSON(needs.pick.outputs.lanes) }}');
    });
  }

  it('fuzz-soak.yml offers exactly the soak lanes as dispatch choices (the one underivable copy)', () => {
    expect(dispatchOptions).toEqual(soakLanes);
  });

  it('fuzz-soak.yml offers `all` as the default choice', () => {
    expect(yamlLaneBlock(fuzzSoak, '\n        options:')).toContain('all');
    expect(fuzzSoak).toMatch(/type: choice\n\s*default: all/);
  });
});

describe('every soak lane carries a quick budget (the per-PR tier)', () => {
  it('quick and soak cover the same lanes', () => {
    const quickLanes = Object.keys(registry)
      .filter((lane) => Object.keys(registry[lane].quick).length > 0)
      .sort();
    expect(quickLanes).toEqual(soakLanes);
  });

  for (const lane of soakLanes) {
    it(`${lane}: quick stays below its soak budget`, () => {
      const {quick, soak} = registry[lane];
      const shared = Object.keys(quick).filter((k) => k in soak);
      expect(shared.length).toBeGreaterThan(0);
      for (const k of shared) expect(Number(quick[k])).toBeLessThanOrEqual(Number(soak[k]));
      expect(shared.some((k) => Number(quick[k]) < Number(soak[k]))).toBe(true);
    });
  }
});

describe('ci.yml runs every lane at its quick budget on every PR', () => {
  it('js-lint runs exactly the time-boxed lanes at --quick, in one invocation', () => {
    const step = ciStep('Time-boxed fuzz lanes at quick budgets');
    const command = /pnpm miondevx core fuzz ([a-z0-9 ]+) --quick/.exec(step);
    if (!command) throw new Error('ci.yml: the time-boxed quick step no longer runs `miondevx core fuzz … --quick`');
    expect(command[1].trim().split(' ').sort()).toEqual(timeBoxedLanes);
  });

  it('miondevx forces a multi-lane time-boxed run sequential (the scheduling rule, enforced)', () => {
    // The rule is only worth writing down if the tool applies it: a batched run
    // of time-boxed lanes must not let vitest parallelise the files.
    expect(miondevx).toContain('--no-file-parallelism');
    expect(miondevx).toMatch(/const isTimeBoxed = \(lane\) =>[^\n]*_SOAK_MS/);
  });

  it("go-fuzz's sweep excludes exactly the time-boxed lanes' files (nothing double-runs)", () => {
    const sweep = ciStep('JS fuzz sweep (count-based lanes at quick budgets)');
    // Trailing slash on the filter keeps this devtools test file (test/fuzz-…)
    // out of the sweep, so the two jobs stay a disjoint partition.
    expect(sweep).toMatch(/vitest run test\/fuzz\/\s/);
    const excluded = /--exclude '\*\*\/test\/fuzz\/\{([^}]*)\}\.integration\.test\.ts'/.exec(sweep);
    if (!excluded) throw new Error('ci.yml: the sweep no longer excludes the time-boxed lane files');
    const stems = excluded[1].split(',');
    expect(stems).toHaveLength(timeBoxedLanes.length);
    for (const lane of timeBoxedLanes) {
      const stem = registry[lane].patterns[0].replace(/\.integration$/, '');
      expect(stems.some((s) => s.includes(stem))).toBe(true);
    }
  });

  it("the sweep pins the count-based JS lanes' quick env values to the registry", () => {
    const sweep = ciStep('JS fuzz sweep (count-based lanes at quick budgets)');
    for (const lane of countBasedLanes) {
      if (lane === 'race' || lane === 'convert') continue; // own steps, pinned below
      for (const [k, v] of Object.entries(registry[lane].quick)) expect(sweep).toContain(`${k}: '${v}'`);
    }
  });

  it("the Go suite step pins the convert lane's quick budget", () => {
    const goStep = ciStep('Go test suite (fuzz sweeps at quick budgets)');
    for (const [k, v] of Object.entries(registry.convert.quick)) expect(goStep).toContain(`${k}: '${v}'`);
  });

  it('the race lane runs through miondevx at its quick budget', () => {
    expect(ciStep('Concurrent CLI race fuzz (MION_FUZZ_RACE gate)')).toContain('pnpm miondevx core fuzz race --quick');
  });
});

describe('a pnpm-free job can actually start', () => {
  // Both pickers run bare node on the zero-dep CLI and never install pnpm, but
  // setup-node@v5 defaults package-manager-cache to true, auto-detects the
  // `packageManager` field, and dies with "Unable to locate executable file:
  // pnpm" before any step runs. That killed the whole v0.12.1 soak matrix on
  // the first release gate that reached it — the pickers were added in the same
  // release and nothing had exercised them (the gate's runs only on a PR into
  // prod, fuzz-soak.yml's only on manual dispatch).
  //
  // The invariant, over every workflow: a job that checks the repo out and sets
  // node up without bringing pnpm along must opt out of the cache.
  const workflowsDir = join(REPO_ROOT, '.github/workflows');
  const workflows = readdirSync(workflowsDir).filter((file) => file.endsWith('.yml'));

  // Split a workflow into its jobs — `jobs:` at column 0, one job per 2-space key.
  const jobsOf = (source: string): Array<{name: string; body: string}> => {
    const at = source.indexOf('\njobs:\n');
    if (at === -1) return [];
    const lines = source.slice(at + '\njobs:\n'.length).split('\n');
    const jobs: Array<{name: string; body: string}> = [];
    for (const line of lines) {
      const header = /^ {2}([\w-]+):\s*$/.exec(line);
      if (header) jobs.push({name: header[1], body: ''});
      else if (jobs.length > 0) jobs[jobs.length - 1].body += line + '\n';
    }
    return jobs;
  };

  const pnpmFreeJobs = workflows.flatMap((file) =>
    jobsOf(read(`.github/workflows/${file}`))
      .filter((job) => job.body.includes('actions/setup-node@'))
      .filter((job) => job.body.includes('actions/checkout@')) // no checkout, nothing to auto-detect
      .filter((job) => !job.body.includes('pnpm/action-setup@') && !job.body.includes('.github/actions/bootstrap'))
      .map((job) => ({file, ...job}))
  );

  it('the scan finds the pnpm-free jobs it is meant to guard', () => {
    // Guards the parser: a rewrite that stopped matching would make the
    // assertion below pass over an empty list.
    const found = pnpmFreeJobs.map((job) => `${job.file}:${job.name}`);
    expect(found).toContain('release-gate.yml:pick');
    expect(found).toContain('fuzz-soak.yml:pick');
  });

  for (const job of pnpmFreeJobs) {
    it(`${job.file}'s \`${job.name}\` job opts out of the pnpm cache`, () => {
      expect(job.body).toContain('package-manager-cache: false');
    });
  }
});

describe('a soak run can always be replayed', () => {
  // A finding whose seed was never printed costs a bisect instead of a re-run,
  // so both workflows must set the seed AND echo the command that replays it.
  for (const [name, source] of [
    ['release-gate.yml', releaseGate],
    ['fuzz-soak.yml', fuzzSoak],
  ] as const) {
    it(`${name} sets MION_FUZZ_SEED and echoes the replay command`, () => {
      expect(source).toContain('MION_FUZZ_SEED:');
      expect(source).toContain('replay this run: MION_FUZZ_SEED=$MION_FUZZ_SEED pnpm miondevx core fuzz');
    });
  }

  it('fuzz-soak.yml falls back to the run id so an unattended round is fresh', () => {
    expect(fuzzSoak).toContain('MION_FUZZ_SEED: ${{ inputs.seed || github.run_id }}');
  });
});
