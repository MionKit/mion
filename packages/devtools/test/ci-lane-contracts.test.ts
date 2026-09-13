// Contract tests for the CONTENT gate that decides which CI lanes run.
//
// The gate is easy to half-wire, and every half-wiring fails SILENTLY in the
// direction that costs coverage rather than time: a lane whose job never saves a
// green marker just re-runs forever (merely wasteful), but a lane gated on a
// marker some OTHER job writes, or saved by a job that was skipped, reports green
// having proved nothing. GitHub counts a skipped check as success, so nothing
// downstream would notice.
//
// These pin the three halves to each other: the lane table in scripts/ci/lanes.mjs,
// the `if:` that consults it, and the save step that writes the marker.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
// @ts-expect-error — a plain .mjs repo script, no types.
import {LANES, FEEDS_NOTHING, decide, greenKey, laneHashes, unclassified} from '../../../scripts/ci/lanes.mjs';
// @ts-expect-error — a plain .mjs repo script, no types.
import {SWEEPS} from '../../../scripts/ci/check-tree.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const WORKFLOWS = {
  'ci.yml': ['go', 'js-fuzz', 'js', 'smoke'],
  'pr-heavy.yml': ['website', 'bench', 'e2e'],
  'drizzle-e2e.yml': ['drizzle'],
} as const;

describe('the lane table', () => {
  it('classifies every tracked path, so nothing silently buys a skip', () => {
    const tracked = laneHashes('HEAD');
    expect(tracked.unknown, `classify these in scripts/ci/lanes.mjs: ${tracked.unknown.join(', ')}`).toEqual([]);
  });

  it('leaves the docs and agent trees feeding nothing, which is the whole point', () => {
    for (const dir of ['docs/', '.claude/', 'CLAUDE.md']) expect(FEEDS_NOTHING).toContain(dir);
    for (const lane of Object.values(LANES) as {paths: string[]}[]) {
      for (const ignored of FEEDS_NOTHING) expect(lane.paths, `${ignored} must feed no lane`).not.toContain(ignored);
    }
  });

  // The old dorny/paths-filter gate listed neither, so a pull request that only
  // touched the docs content skipped js-lint and with it check-code-imports, the
  // one gate that turns a dangling <code-import> into a failure instead of an
  // error placeholder rendered into the page.
  it('feeds the docs content and the examples into the js lane that checks them', () => {
    for (const fed of ['container/', 'packages/']) expect(LANES.js.paths).toContain(fed);
  });

  // The two trees read into each other, and the old path gate got BOTH wrong: it
  // ran js-lint on any Go change (right, but for no stated reason) and never fed
  // the marker sources into the Go lane at all. Derive each direction from the
  // thing that does the reading, so neither can rot into a silent skip.
  it('feeds every tsconfig the root typecheck compiles into the js lane', () => {
    const typecheck = JSON.parse(read('package.json')).scripts.typecheck as string;
    const projects = [...typecheck.matchAll(/tsc -p (\S+)/g)].map((match) => match[1]);
    expect(projects.length).toBeGreaterThan(2);
    for (const project of projects) {
      const dir = project.slice(0, project.lastIndexOf('/') + 1);
      expect(
        LANES.js.paths.some((fed: string) => dir.startsWith(fed)),
        `${project} is typechecked by js-lint but feeds no js lane path`
      ).toBe(true);
    }
  });

  it('feeds the packages the Go suites mount as node_modules into the go lane', () => {
    const fixtures =
      read('ts-go-runtypes/internal/testfixtures/realmarker.go') + read('ts-go-runtypes/internal/testfixtures/realdrizzle.go');
    const mounted = [...fixtures.matchAll(/filepath\.Join\(repoRoot, "packages", "([\w-]+)"\)/g)].map(
      (match) => `packages/${match[1]}/`
    );
    expect(mounted.length).toBeGreaterThan(2);
    for (const pkg of new Set(mounted)) {
      expect(
        LANES.go.paths.some((fed: string) => pkg.startsWith(fed)),
        `${pkg} is compiled by the Go suites but feeds no go lane path`
      ).toBe(true);
    }
  });

  it('gives each lane its own hash unless the two read the same inputs', () => {
    const {hashes} = laneHashes('HEAD');
    // js and js-fuzz are the two halves of one input set, split so each job half
    // owns its own marker; everything else must be distinguishable.
    expect(hashes.js).toBe(hashes['js-fuzz']);
    const distinct = new Set(
      Object.entries(hashes)
        .filter(([name]) => name !== 'js-fuzz')
        .map(([, hash]) => hash)
    );
    expect(distinct.size).toBe(Object.keys(LANES).length - 1);
  });

  it('is fail-safe: an unclassified path joins every lane, and an unknown marker list runs everything', () => {
    expect(unclassified(['brand-new-dir/thing.ts'])).toEqual(['brand-new-dir/thing.ts']);
    const hashes = {js: 'abc'};
    expect(decide(['js'], {hashes, greenKeys: []}).js.run).toBe(true);
    expect(decide(['js'], {hashes, greenKeys: [greenKey('js', 'abc')]}).js.run).toBe(false);
    // a marker for a DIFFERENT hash never counts
    expect(decide(['js'], {hashes, greenKeys: [greenKey('js', 'def')]}).js.run).toBe(true);
  });
});

// The ignore list is only safe because nothing gated reads those paths. The three
// whole-tree sweeps DO read every tracked file, so if one ever moves back into the
// vitest suite, a .claude/ or CLAUDE.md edit would skip the very check meant to
// catch it. Pin them to the one job no lane can skip.
// A gate job that FAILS takes every lane down with it, and GitHub reports a job
// skipped for a failed dependency as neutral, so the pull request can look settled
// while nothing ran. The job therefore installs nothing and must ask for nothing
// that needs an install.
describe('the gate job stands on its own', () => {
  const action = read('.github/actions/ci-lanes/action.yml');

  it('turns off the package-manager cache setup-node enables by default', () => {
    // On by default, it finds pnpm-lock.yaml and shells out to `pnpm` to locate the
    // store. pnpm is not on PATH here, and that failure fails the whole step.
    expect(action).toContain('package-manager-cache: false');
  });

  it('never runs pnpm, which the job does not install', () => {
    const steps = action.slice(action.indexOf('runs:'));
    expect(steps, 'the gate job has no pnpm').not.toMatch(/run:.*\bpnpm\b/);
    for (const file of Object.keys(WORKFLOWS)) {
      const workflow = read(`.github/workflows/${file}`);
      const gate = workflow.slice(workflow.indexOf('\n  lanes:'), workflow.indexOf('\n\n  ', workflow.indexOf('\n  lanes:')));
      expect(gate, `${file}'s gate job has no pnpm`).not.toMatch(/run:.*\bpnpm\b/);
    }
  });
});

describe('the whole-tree sweeps run ungated', () => {
  const ci = read('.github/workflows/ci.yml');
  const gate = ci.slice(ci.indexOf('\n  lanes:'), ci.indexOf('\n  go-fuzz:'));

  it('runs check-tree in the gate job, which has no `if:` of its own', () => {
    expect(gate).toContain('run: node scripts/ci/check-tree.mjs');
    expect(gate, 'the gate job must never be conditional').not.toMatch(/^    if:/m);
  });

  it('carries every sweep, so adding one to the script reaches CI for free', () => {
    expect((SWEEPS as {name: string}[]).length).toBeGreaterThanOrEqual(3);
    for (const sweep of SWEEPS as {name: string; run: () => string[]}[]) expect(typeof sweep.run).toBe('function');
  });

  it('keeps the sweeps out of the vitest suite they used to gate on', () => {
    const contracts = read('packages/devtools/test/repo-contracts.test.ts');
    expect(contracts, 'a whole-tree git grep is back in the js lane').not.toContain("spawnSync('git', ['grep'");
    expect(contracts).not.toContain("['ls-files', '-z'");
  });
});

describe('every workflow gates on the lanes it declares', () => {
  for (const [file, lanes] of Object.entries(WORKFLOWS)) {
    const workflow = read(`.github/workflows/${file}`);
    const declared = /uses: \.\/\.github\/actions\/ci-lanes\n\s+with:\n\s+lanes: (.+)/.exec(workflow)?.[1].trim().split(/\s+/);

    it(`${file} asks the gate for exactly the lanes it uses`, () => {
      expect(declared).toEqual([...lanes]);
      for (const lane of lanes) expect(Object.keys(LANES)).toContain(lane);
    });

    it(`${file} reads each lane's verdict in a job or step condition`, () => {
      for (const lane of lanes) {
        const reference = lane.includes('-')
          ? `fromJSON(needs.lanes.outputs.lanes)['${lane}'].run`
          : `fromJSON(needs.lanes.outputs.lanes).${lane}.run`;
        expect(workflow, `${file} never gates on ${lane}`).toContain(reference);
      }
    });

    // The save is what makes the NEXT run cheap; without it the lane re-runs
    // forever and the gate is dead weight nobody notices.
    it(`${file} records each lane green with that lane's own hash`, () => {
      for (const lane of lanes) {
        const hash = lane.includes('-')
          ? `fromJSON(needs.lanes.outputs.lanes)['${lane}'].hash`
          : `fromJSON(needs.lanes.outputs.lanes).${lane}.hash`;
        expect(workflow).toMatch(
          new RegExp(
            `save-lane-green\\n\\s+with:\\n\\s+lane: ${lane}\\n\\s+hash: \\$\\{\\{ ${hash.replace(/[.()[\]$]/g, '\\$&')} \\}\\}`
          )
        );
      }
    });

    it(`${file} grants the gate job the actions:read it needs to list the markers`, () => {
      const job = workflow.slice(
        workflow.indexOf('\n  lanes:'),
        workflow.indexOf('\n    steps:', workflow.indexOf('\n  lanes:'))
      );
      expect(job, `${file}'s lanes job cannot list caches without actions: read`).toContain('actions: read');
    });
  }
});

describe('a marker is only ever written by work that actually ran and passed', () => {
  const ci = read('.github/workflows/ci.yml');

  // go-fuzz runs when EITHER half is due, so each half's save must re-check its
  // own lane. Without the guard, a run triggered by the Go half alone would mark
  // the JS fuzz sweep green having never executed it.
  it('guards the two go-fuzz halves on their own lane, not on the job', () => {
    for (const lane of ['go', "['js-fuzz']"]) {
      const reference = lane.startsWith('[')
        ? `fromJSON(needs.lanes.outputs.lanes)${lane}.run`
        : `fromJSON(needs.lanes.outputs.lanes).${lane}.run`;
      expect(ci).toContain(`if: success() && ${reference}`);
    }
  });

  // Five dialects share one marker, so it cannot ride any single dialect's job.
  it('records drizzle green only after all five dialect lanes pass', () => {
    const drizzle = read('.github/workflows/drizzle-e2e.yml');
    const record = drizzle.slice(drizzle.indexOf('\n  record-green:'));
    expect(record).toContain('needs: [lanes, drizzle-e2e]');
    expect(record).toContain('if: success()');
    expect(drizzle.indexOf('save-lane-green')).toBe(drizzle.lastIndexOf('save-lane-green'));
  });

  // A save placed mid-job would claim the lane green while the steps after it are
  // still unproven, and those steps are exactly the slow ones worth skipping.
  it('puts every save after the last step that does work', () => {
    let checked = 0;
    for (const file of Object.keys(WORKFLOWS)) {
      const workflow = read(`.github/workflows/${file}`);
      for (const job of workflow.split(/\n  (?=[\w-]+:\n)/)) {
        const firstSave = job.indexOf('save-lane-green');
        if (firstSave === -1) continue;
        checked += 1;
        // drizzle's record-green job runs nothing itself (it waits on the five
        // dialect jobs), so "no work at all" is fine; work AFTER the save is not.
        expect(firstSave, `${file}: a run step follows a save-lane-green step`).toBeGreaterThan(
          job.lastIndexOf('\n        run: ')
        );
      }
    }
    // go-fuzz, js-lint, smoke, website, bench, pre-publish-e2e, record-green.
    // The count catches a save step lost to an edit, which the loop above cannot.
    expect(checked).toBe(7);
  });
});
