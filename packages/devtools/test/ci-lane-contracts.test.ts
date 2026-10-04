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
import {spawnSync} from 'node:child_process';
import {globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {
  LANES,
  FEEDS_NOTHING,
  candidateKeys,
  decide,
  greenKey,
  itemFeeds,
  laneHashes,
  laneLive,
  main as lanesMain,
  matches,
  unclassified,
  // @ts-expect-error — a plain .mjs repo script, no types.
} from '../../../scripts/ci/lanes.mjs';
// @ts-expect-error — a plain .mjs repo script, no types.
import {SWEEPS} from '../../../scripts/ci/check-tree.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const WORKFLOWS = {
  'ci.yml': ['go', 'js-fuzz', 'go-tools', 'go-static', 'js', 'js-static', 'smoke'],
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
      expect(matches(project, LANES.js.paths), `${project} is typechecked by js-lint but feeds no js lane path`).toBe(true);
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
        .filter(([name]) => name in LANES && name !== 'js-fuzz')
        .map(([, hash]) => hash)
    );
    expect(distinct.size).toBe(Object.keys(LANES).length - 1);
  });

  // None of these reaches a binary the other lanes run, so only the lanes that run Go itself re-run.
  it('keeps Go tests, testdata and the generators out of every lane that only runs the binaries', () => {
    for (const path of [
      'ts-go-runtypes/internal/reflection/kind_test.go',
      'ts-go-runtypes/internal/cachegen/testdata/golden.json',
      'ts-go-runtypes/cmd/gen-ts-constants/main.go',
    ]) {
      for (const [name, lane] of Object.entries(LANES) as [string, {paths: unknown[]}][]) {
        expect(matches(path, lane.paths), `${name} reads ${path}`).toBe(['go', 'go-tools', 'go-static'].includes(name));
      }
    }
    for (const path of [
      'ts-go-runtypes/internal/reflection/kind.go',
      'ts-go-runtypes/cmd/mion/main.go',
      'ts-go-runtypes/third_party/tsgolint',
    ]) {
      for (const [name, lane] of Object.entries(LANES) as [string, {paths: unknown[]}][]) {
        expect(matches(path, lane.paths), `${name} misses ${path}`).toBe(true);
      }
    }
  });

  // A change re-runs exactly the items that read it.
  it("feeds each item its own paths and the shared ones, never a sibling's", () => {
    const feeds = (lane: string, path: string): string[] =>
      Object.keys(LANES[lane].items).filter((item) => itemFeeds(LANES[lane], item, path));
    expect(feeds('drizzle', 'packages/drizzle-orm-pg-core/src/columns.ts')).toEqual(['pg']);
    expect(feeds('drizzle', 'packages/drizzle-orm-sqlite-core/src/columns.ts')).toEqual(['sqlite', 'd1', 'durable']);
    expect(feeds('drizzle', 'container/drizzle-e2e/cloudflare/Containerfile')).toEqual(['d1', 'durable']);
    expect(feeds('drizzle', 'packages/drizzle-orm/src/table.ts')).toEqual(['pg', 'mysql', 'sqlite', 'd1', 'durable']);
    expect(feeds('bench', 'packages/core/src/errors.ts')).toEqual(['mion']);
    expect(feeds('bench', 'ts-go-runtypes/internal/reflection/kind.go')).toEqual(['mion']);
    expect(feeds('bench', 'container/benchmarks/competitors/zod/cases.ts')).toEqual(['zod']);
    expect(feeds('bench', 'container/benchmarks/shared/cases/objects.ts')).toEqual(['mion', 'zod', 'typebox', 'ajv', 'typia']);
    expect(feeds('e2e', 'container/pre-publish-e2e/host-smoke/src/main.ts')).toEqual(['host-smoke']);
    expect(feeds('e2e', 'packages/core/src/errors.ts')).toEqual(['matrix', 'mion', 'host-smoke']);
    expect(feeds('smoke', 'container/benchmarks/competitors/ajv/cases.ts')).toEqual(['bench']);
    expect(feeds('smoke', 'container/website/app/components/content/ServerBenchBars.vue')).toEqual(['website']);
    expect(feeds('smoke', 'container/website/content/index.md')).toEqual([]);
    // `bench smoke` builds the mion competitor with our packages, so a package edit re-runs it too.
    expect(feeds('smoke', 'packages/core/src/errors.ts')).toEqual(['website', 'bench']);
  });

  it('keeps page text and CSS out of the website lanes, and every other website file in', () => {
    const textAndStyle = [
      'container/website/content/01.rpc/01.intro.md',
      'container/website/content/01.rpc/_dir.yml',
      'container/website/app/assets/css/mion.css',
      'container/website/sites/rpc/theme.css',
    ];
    const siteCode = [
      'container/website/app/components/content/ServerBenchBars.vue',
      'container/website/app/plugins/theme.ts',
      'container/website/nuxt.config.ts',
      'container/website/content.config.ts',
      'container/website/_deps/package.json',
      'container/website/Containerfile',
      'container/website/public/_redirects',
    ];
    const readers = (path: string): string[] => [
      ...['smoke', 'website'].filter((lane) => matches(path, LANES[lane].paths)),
      ...(itemFeeds(LANES.smoke, 'website', path) ? ['smoke.website'] : []),
    ];
    for (const path of textAndStyle) expect(readers(path), path).toEqual([]);
    for (const path of siteCode) expect(readers(path), path).toEqual(['smoke', 'website', 'smoke.website']);
    // Still read by the js lane, so the code-import check keeps covering the pages.
    for (const path of textAndStyle) expect(matches(path, LANES.js.paths), path).toBe(true);
  });

  it('runs only the unproven items, and skips them all on the lane marker', () => {
    const hashes = {
      drizzle: 'lane',
      'drizzle.pg': 'p',
      'drizzle.mysql': 'm',
      'drizzle.sqlite': 's',
      'drizzle.d1': 'd',
      'drizzle.durable': 'u',
    };
    const none = decide(['drizzle'], {hashes}).drizzle;
    expect(none.run).toBe(true);
    expect(none.runItems).toEqual(['pg', 'mysql', 'sqlite', 'd1', 'durable']);
    const someGreen = decide(['drizzle'], {
      hashes,
      greenKeys: [greenKey('drizzle.pg', 'p'), greenKey('drizzle.d1', 'd')],
    }).drizzle;
    expect(someGreen.runItems).toEqual(['mysql', 'sqlite', 'durable']);
    expect(someGreen.items.pg).toEqual({run: false, hash: 'p'});
    // An item marker at an OLD hash proves nothing.
    expect(decide(['drizzle'], {hashes, greenKeys: [greenKey('drizzle.pg', 'old')]}).drizzle.items.pg.run).toBe(true);
    const laneGreen = decide(['drizzle'], {hashes, greenKeys: [greenKey('drizzle', 'lane')]}).drizzle;
    expect(laneGreen.run).toBe(false);
    expect(laneGreen.runItems).toEqual([]);
    const allItems = ['pg', 'mysql', 'sqlite', 'd1', 'durable'].map((item) =>
      greenKey(`drizzle.${item}`, hashes[`drizzle.${item}` as keyof typeof hashes])
    );
    expect(decide(['drizzle'], {hashes, greenKeys: allItems}).drizzle.run).toBe(false);
    expect(candidateKeys(['drizzle'], {hashes})).toEqual([greenKey('drizzle', 'lane'), ...allItems]);
  });

  // Exact keys, so a marker can never fall off the end of a long cache listing.
  it('names the exact marker keys decide reads, with the PR proof only on a pull request', () => {
    const hashes = {js: 'abc', go: 'def'};
    expect(candidateKeys(['js', 'go'], {hashes})).toEqual([greenKey('js', 'abc'), greenKey('go', 'def')]);
    expect(candidateKeys(['js'], {hashes, pr: true})).toEqual([greenKey('js', 'abc'), greenKey('js-pr', 'abc')]);
    expect(read('.github/actions/ci-lanes/action.yml')).not.toContain('--limit 200');
  });

  it('is fail-safe: an unclassified path joins every lane, and an unknown marker list runs everything', () => {
    expect(unclassified(['brand-new-dir/thing.ts'])).toEqual(['brand-new-dir/thing.ts']);
    const hashes = {js: 'abc'};
    expect(decide(['js'], {hashes, greenKeys: []}).js.run).toBe(true);
    expect(decide(['js'], {hashes, greenKeys: [greenKey('js', 'abc')]}).js.run).toBe(false);
    // a marker for a DIFFERENT hash never counts
    expect(decide(['js'], {hashes, greenKeys: [greenKey('js', 'def')]}).js.run).toBe(true);
  });

  // A PR's partial run must never let the push to main skip the full suite.
  it('a partial js-pr marker skips a pull request only, never a push', () => {
    const hashes = {js: 'abc'};
    const greenKeys = [greenKey('js-pr', 'abc')];
    expect(decide(['js'], {hashes, greenKeys, pr: true}).js.run).toBe(false);
    expect(decide(['js'], {hashes, greenKeys}).js.run).toBe(true);
    expect(decide(['js'], {hashes, greenKeys: [greenKey('js-pr', 'def')], pr: true}).js.run).toBe(true);
  });

  // A docs-only pull request merged onto an unproven main must not re-run the code lanes.
  it('skips a lane whose inputs equal the pull request base, items included, and runs the rest', () => {
    const hashes = {js: 'new', go: 'same', drizzle: 'same', 'drizzle.pg': 'same-pg', 'drizzle.mysql': 'new-mysql'};
    const baseHashes = {js: 'old', go: 'same', drizzle: 'same', 'drizzle.pg': 'same-pg', 'drizzle.mysql': 'old-mysql'};
    const lanes = decide(['js', 'go'], {hashes, baseHashes, pr: true});
    expect(lanes.js.run).toBe(true);
    expect(lanes.go.run).toBe(false);
    expect(decide(['go'], {hashes}).go.run).toBe(true);
    const drizzle = decide(['drizzle'], {hashes: {...hashes, drizzle: 'changed'}, baseHashes, pr: true}).drizzle;
    expect(drizzle.items.pg.run).toBe(false);
    expect(drizzle.items.mysql.run).toBe(true);
    expect(decide(['drizzle'], {hashes, baseHashes, pr: true}).drizzle.runItems).toEqual([]);
  });

  it('hashes a docs-only change identically to its base for every lane, and a source change differently', () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'lanes-base-'));
    const git = (...args: string[]) =>
      spawnSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=t', ...args], {cwd: repo, encoding: 'utf8'});
    try {
      git('init', '-q');
      mkdirSync(path.join(repo, 'docs/notes'), {recursive: true});
      mkdirSync(path.join(repo, 'packages/x'), {recursive: true});
      writeFileSync(path.join(repo, 'docs/notes/a.md'), 'a');
      writeFileSync(path.join(repo, 'packages/x/a.ts'), 'a');
      git('add', '.');
      git('commit', '-qm', 'base');
      writeFileSync(path.join(repo, 'docs/notes/a.md'), 'b');
      writeFileSync(path.join(repo, 'CLAUDE.md'), 'b');
      git('add', '.');
      git('commit', '-qm', 'docs');
      writeFileSync(path.join(repo, 'packages/x/a.ts'), 'b');
      git('add', '.');
      git('commit', '-qm', 'src');
      const base = laneHashes('HEAD~2', {cwd: repo}).hashes;
      expect(laneHashes('HEAD~1', {cwd: repo}).hashes).toEqual(base);
      const changed = laneHashes('HEAD', {cwd: repo}).hashes;
      expect(changed.js).not.toBe(base.js);
      expect(changed.go).toBe(base.go);
    } finally {
      rmSync(repo, {recursive: true, force: true});
    }
  });

  it('ci-lanes passes --base HEAD^1 only on a pull_request, and every gate job checks out two commits', () => {
    const action = read('.github/actions/ci-lanes/action.yml');
    expect(action).toContain(`BASE_FLAG="\${{ github.event_name == 'pull_request' && '--base HEAD^1' || '' }}"`);
    expect(action).toContain('--github --out .lane-decision/lanes.json $PR_FLAG $BASE_FLAG');
    for (const file of Object.keys(WORKFLOWS)) {
      expect(read(`.github/workflows/${file}`), file).toMatch(
        /- uses: actions\/checkout@v5\n\s+with:\n\s+fetch-depth: 2\n\s+- id: decide/
      );
    }
  });

  it('ci-lanes passes --pr only on a pull_request event', () => {
    const action = read('.github/actions/ci-lanes/action.yml');
    expect(action).toContain(`PR_FLAG="\${{ github.event_name == 'pull_request' && '--pr' || '' }}"`);
    expect(action).toContain('--candidates $LANES $PR_FLAG');
    expect(action).toContain('--out .lane-decision/lanes.json $PR_FLAG');
  });

  it('js-lint saves the full js marker only for a full run, and js-pr for a partial one', () => {
    const ci = read('.github/workflows/ci.yml');
    const suite = ci.slice(ci.indexOf('- name: JS suite (everything except test/fuzz)'));
    expect(suite).toMatch(/scope=partial"[^\n]*\n\s+pnpm miondevx core test-pr --base HEAD\^1 --skip-passed /);
    expect(suite).toMatch(/scope=full"[^\n]*\n\s+pnpm miondevx core test-skip --audit /);
    expect(ci).toMatch(
      /if: success\(\) && steps\.suite\.outputs\.scope == 'full'\n\s+uses: \.\/\.github\/actions\/save-lane-green\n\s+with:\n\s+lane: js\n/
    );
    expect(ci).toMatch(
      /if: success\(\) && steps\.suite\.outputs\.scope == 'partial'\n\s+uses: \.\/\.github\/actions\/save-lane-green\n\s+with:\n\s+lane: js-pr\n/
    );
  });
});

// PRs skip what the list proved; main runs everything, so a key missing an input fails there instead of hiding.
// Both halves share one list, keyed per run so every run saves.
describe('js-lint — the passed test list', () => {
  const job = () => jobOf(read('.github/workflows/ci.yml'), 'js-lint');
  const step = (name: string) =>
    job()
      .slice(job().indexOf(`- name: ${name}`))
      .split(/\n\s+- name: /)[0];

  it('restores the list before the suite and saves it after, under one per-run key with a prefix fallback', () => {
    const restore = step('Restore the passed test list');
    const save = step('Save the passed test list');
    const key = 'key: mion-vitest-passed-${{ github.run_id }}-${{ github.run_attempt }}';
    expect(restore).toContain('uses: actions/cache/restore@v4');
    expect(restore).toContain('path: node_modules/.cache/mion/vitest-passed.json');
    expect(restore).toContain(key);
    expect(restore).toContain('restore-keys: mion-vitest-passed-');
    expect(save).toContain('uses: actions/cache/save@v4');
    expect(save).toContain('path: node_modules/.cache/mion/vitest-passed.json');
    expect(save).toContain(key);
    expect(save).toContain("if: always() && steps.suite.outcome != 'skipped'");
    expect(job().indexOf('Restore the passed test list')).toBeLessThan(job().indexOf('- name: JS suite'));
    expect(job().indexOf('- name: JS suite')).toBeLessThan(job().indexOf('Save the passed test list'));
  });

  it('keeps a few of the lists on main, where every pull request restores from', async () => {
    // @ts-expect-error plain ESM dev script, no types
    const {KEEP_ON_MAIN} = await import('../../../scripts/ci/cache-cleanup.mjs');
    expect(KEEP_ON_MAIN['mion-vitest-passed-']).toBeGreaterThan(0);
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
  const start = ci.indexOf('\n  lanes:');
  const gate = ci.slice(start, start + 1 + ci.slice(start + 1).search(/\n {2}[\w-]+:\n/));

  it('runs check-tree in the gate job, which has no `if:` of its own', () => {
    expect(gate).toContain('run: node scripts/ci/check-tree.mjs');
    expect(gate, 'the gate job must never be conditional').not.toMatch(/^    if:/m);
  });

  it('carries every sweep, so adding one to the script reaches CI for free', () => {
    expect((SWEEPS as {name: string}[]).length).toBeGreaterThanOrEqual(4);
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

    // Via env.MION_LANES, or `waiter || gate` where env is unavailable; the gate alone repeats what an older run proves.
    it(`${file} reads each lane's verdict in a job or step condition, through its waiter`, () => {
      for (const lane of lanes) {
        const accessor = (lane.includes('-') ? `['${lane}']` : `.${lane}`).replace(/[.[\]]/g, '\\$&');
        expect(workflow, `${file} never gates on ${lane}`).toMatch(
          new RegExp(
            `(fromJSON\\(env\\.MION_LANES\\)|-wait\\.outputs\\.lanes \\|\\| needs\\.lanes\\.outputs\\.lanes\\))${accessor}\\.run`
          )
        );
      }
      // A job that waits in-job decides only whether to start from the gate; its steps read the re-decided env.MION_LANES.
      const withoutStartConditions = workflow.replace(
        /^ {4}if: \$\{\{ !cancelled\(\) && needs\.lanes\.result == 'success' && \(fromJSON\(needs\.lanes\.outputs\.lanes\).*$/gm,
        ''
      );
      expect(withoutStartConditions, `${file} reads a verdict from the gate alone`).not.toMatch(
        /fromJSON\(needs\.lanes\.outputs\.lanes\)(\.[\w]+|\['[\w-]+'\])\.(run|runItems)\b/
      );
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

    it(`${file} grants the gate job the actions:write it needs for the markers and the older runs`, () => {
      const job = workflow.slice(
        workflow.indexOf('\n  lanes:'),
        workflow.indexOf('\n    steps:', workflow.indexOf('\n  lanes:'))
      );
      expect(job, `${file}'s lanes job cannot list caches or cancel runs without actions: write`).toContain('actions: write');
      expect(job, `${file}'s lanes job cannot read the labels without pull-requests: read`).toContain('pull-requests: read');
      expect(job).toContain('labels: ${{ steps.decide.outputs.labels }}');
    });
  }
});

describe('a marker is only ever written by work that actually ran and passed', () => {
  const ci = read('.github/workflows/ci.yml');

  // go-fuzz runs when ANY of its lanes is due, or a Go-only run would mark the JS fuzz sweep green unrun.
  it('guards the two go-fuzz halves on their own lane, not on the job', () => {
    for (const lane of ['go', "['js-fuzz']", "['go-tools']"]) {
      const reference = lane.startsWith('[') ? `fromJSON(env.MION_LANES)${lane}.run` : `fromJSON(env.MION_LANES).${lane}.run`;
      expect(ci).toContain(`if: success() && ${reference}`);
    }
  });

  // The lane marker claims all five, so it waits on every dialect job that ran; the rest had their own markers.
  it('records each drizzle dialect on its own, and the lane only after every dialect that ran passed', () => {
    const drizzle = read('.github/workflows/drizzle-e2e.yml');
    const dialects = drizzle.slice(drizzle.indexOf('\n  drizzle-e2e:'), drizzle.indexOf('\n  record-green:'));
    expect(dialects).toContain(
      'dialect: ${{ fromJSON(needs.drizzle-wait.outputs.lanes || needs.lanes.outputs.lanes).drizzle.runItems }}'
    );
    expect(dialects).toMatch(
      /lane: drizzle\.\$\{\{ matrix\.dialect \}\}\n\s+hash: \$\{\{ fromJSON\(needs\.lanes\.outputs\.lanes\)\.drizzle\.items\[matrix\.dialect\]\.hash \}\}/
    );
    const record = drizzle.slice(drizzle.indexOf('\n  record-green:'));
    expect(record).toContain('needs: [lanes, drizzle-e2e]');
    expect(record).toContain("if: ${{ !cancelled() && needs.drizzle-e2e.result == 'success' }}");
    expect(record).toContain('lane: drizzle\n');
  });

  // An item that did not run proved nothing, so its save must re-check its own verdict.
  it('guards every in-job item save on that item having run', () => {
    for (const [file, lane, items] of [
      ['ci.yml', 'smoke', ['website', 'bench']],
      ['pr-heavy.yml', 'e2e', ['matrix', 'mion', 'host-smoke']],
    ] as const) {
      const workflow = read(`.github/workflows/${file}`);
      for (const item of items) {
        expect(workflow, `${file} saves ${lane}.${item} unguarded`).toMatch(
          new RegExp(
            `if: success\\(\\) && contains\\(fromJSON\\(env\\.MION_LANES\\)\\.${lane}\\.runItems, '${item}'\\)\\n\\s+uses: \\./\\.github/actions/save-lane-green\\n\\s+with:\\n\\s+lane: ${lane}\\.${item}\\n`
          )
        );
      }
    }
  });

  it('declares items only on lanes whose workflow reads runItems', () => {
    const workflows = Object.keys(WORKFLOWS)
      .map((file) => read(`.github/workflows/${file}`))
      .join('\n');
    for (const [name, lane] of Object.entries(LANES) as [string, {items?: object}][]) {
      if (lane.items) expect(workflows, `${name} has items nobody runs`).toContain(`.${name}.runItems`);
    }
  });

  // A save sits mid-job so a later cancel keeps it; a run step after it must gate on another lane, or it claims unrun work.
  it('puts every save after the last step its lane gates', () => {
    const verdictsOf = (lane: string): string[] => {
      const [name, item] = lane.split('.');
      return item ? [`runItems, '${item}'`] : [`.${name}.run`, `['${name}'].run`];
    };
    let checked = 0;
    for (const file of Object.keys(WORKFLOWS)) {
      const workflow = read(`.github/workflows/${file}`);
      for (const job of workflow.split(/\n  (?=[\w-]+:\n)/)) {
        if (!job.includes('save-lane-green')) continue;
        checked += 1;
        const saved: string[] = [];
        for (const step of job.split('\n      - ')) {
          const lane = /save-lane-green\n\s+with:\n\s+lane: (\S+)/.exec(step)?.[1];
          if (lane) {
            saved.push(lane);
            continue;
          }
          if (!step.includes('\n        run: ') || saved.length === 0) continue;
          const guard = /\n {8}if: (.+)/.exec(step)?.[1] ?? '';
          for (const lane of saved) {
            for (const verdict of verdictsOf(lane)) {
              expect(guard.includes(verdict), `${file}: a step of ${lane} runs after its marker is saved`).toBe(false);
            }
          }
          expect(guard, `${file}: an ungated step runs after ${saved.join(', ')} is saved`).toMatch(/\.run|runItems/);
        }
      }
    }
    // go-fuzz, js-lint, smoke, website, bench, bench-green, pre-publish-e2e, drizzle-e2e, record-green.
    // The count catches a save step lost to an edit, which the loop cannot.
    expect(checked).toBe(9);
  });
});

const jobOf = (workflow: string, name: string): string => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  const next = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
};

// Fails silently both ways (scripts/ci/supersede.mjs): GitHub's per-ref cancel back on throws the older run's work
// away, and a heavy job that skips its `-wait` job repeats it.
describe('a new commit cancels only what it changed', () => {
  // The heavy job each waiter guards, and the lanes that job reads.
  const WAITERS = {
    'ci.yml': {smoke: ['smoke']},
    'pr-heavy.yml': {website: ['website'], bench: ['bench'], 'pre-publish-build': ['e2e']},
    'drizzle-e2e.yml': {build: ['drizzle']},
  } as const;
  const WAITER_NAME: Record<string, string> = {'pre-publish-build': 'e2e-wait', build: 'drizzle-wait'};
  const waiterOf = (job: string) => WAITER_NAME[job] ?? `${job}-wait`;
  // Jobs after the heavy one that also read the waited verdict.
  const READERS: [string, string, string][] = [
    ['pr-heavy.yml', 'pre-publish-e2e', 'e2e-wait'],
    ['drizzle-e2e.yml', 'drizzle-e2e', 'drizzle-wait'],
  ];
  // Heavy jobs that wait in a step, so the lanes that read comments run at once; they read the gate's MION_LANES and the step re-decides it.
  const IN_JOB_WAITERS: [string, string][] = [
    ['ci.yml', 'go-fuzz'],
    ['ci.yml', 'js-lint'],
  ];
  const gates = LANES as Record<string, {gate: {label?: string; unless?: string; base?: string}}>;
  const labelsIn = (condition: string, negated: boolean) =>
    [...condition.matchAll(/(!?)contains\(fromJSON\(needs\.lanes\.outputs\.labels\), '([\w-]+)'\)/g)]
      .filter((match) => (match[1] === '!') === negated)
      .map((match) => match[2]);

  it('leaves cancelling to the gate, except on a fork whose token cannot cancel', () => {
    for (const file of Object.keys(WORKFLOWS)) {
      const name = file.replace('.yml', '');
      expect(read(`.github/workflows/${file}`), file).toContain(
        `group: ${name}-\${{ github.ref }}-\${{ github.event.pull_request.head.repo.fork && 'fork' || github.run_id }}`
      );
    }
  });

  it('lets only the gate keep or cancel runs, and has every waiter re-decide without doing either', () => {
    const action = read('.github/actions/ci-lanes/action.yml');
    expect(action).toMatch(/supersede:\n.*\n {4}default: 'true'/);
    expect(action).toContain('node scripts/ci/supersede.mjs --plan');
    for (const file of Object.keys(WORKFLOWS)) {
      expect(jobOf(read(`.github/workflows/${file}`), 'lanes'), file).not.toContain('supersede:');
    }
    const wait = read('.github/workflows/lane-wait.yml');
    expect(wait).toMatch(
      /uses: \.\/\.github\/actions\/ci-lanes\n\s+with:\n\s+lanes: \$\{\{ inputs\.lanes \}\}\n\s+supersede: 'false'/
    );
    // Without --pr a js waiter waits for the full js marker, which a pull request's partial run never saves.
    expect(wait).toContain(
      `--jobs '\${{ inputs.jobs }}' --timeout $(( \${{ inputs.minutes }} - 10 )) \${{ github.event_name == 'pull_request' && '--pr' || '' }}`
    );
    expect(wait).toContain('timeout-minutes: ${{ inputs.minutes }}');
  });

  for (const [file, jobs] of Object.entries(WAITERS)) {
    const workflow = read(`.github/workflows/${file}`);
    for (const [job, lanes] of Object.entries(jobs)) {
      const waiter = waiterOf(job);
      it(`${file}: ${waiter} waits for exactly the lanes ${job} reads, and ${job} runs after it`, () => {
        const wait = jobOf(workflow, waiter);
        expect(wait).toContain('uses: ./.github/workflows/lane-wait.yml');
        expect(wait).toContain(`      lanes: ${lanes.join(' ')}\n`);
        expect(wait).toContain('      decision: ${{ needs.lanes.outputs.lanes }}\n');
        // The heavy job's own name, so the wait ends when that job fails in the older run.
        const name = /^ {4}name: (.+)$/m.exec(jobOf(workflow, job))?.[1] ?? '';
        const prefixes = /^ {6}jobs: (.+)$/m.exec(wait)?.[1].split('|') ?? [];
        expect(
          prefixes.some((prefix) => name.startsWith(prefix)),
          `${waiter} never names ${name}`
        ).toBe(true);
        for (const lane of lanes)
          expect(wait).toContain(
            `fromJSON(needs.lanes.outputs.lanes)${lane.includes('-') ? `['${lane}']` : `.${lane}`}.deferredTo`
          );
        const heavy = jobOf(workflow, job);
        expect(/^ {4}needs: \[(.+)\]$/m.exec(heavy)?.[1].split(', ')).toContain(waiter);
        // A skipped waiter (the usual case) would skip the job too without the status function.
        expect(heavy).toContain("    if: ${{ !cancelled() && needs.lanes.result == 'success' && ");
        expect(heavy).toContain(`needs.${waiter}.outputs.lanes || needs.lanes.outputs.lanes`);
      });
    }
  }

  // The cheap lanes hash raw and must start at once on a comment-only commit; the code lanes then wait inside the job.
  describe('waits inside go-fuzz and js-lint, after the checks that read comments', () => {
    const ci = read('.github/workflows/ci.yml');
    const WAITS_IN: Record<string, {lanes: string[]; name: string; first: string; last: string}> = {
      'go-fuzz': {
        lanes: ['go', 'js-fuzz', 'go-tools', 'go-static'],
        name: 'go tests + fuzz',
        first: 'Go formatting (our code only; never third_party)',
        last: 'Go test suite (fuzz sweeps at quick budgets)',
      },
      'js-lint': {
        lanes: ['js', 'js-static'],
        name: 'js tests + lint',
        first: 'Check formatting (no build needed — runs first)',
        last: 'JS suite (everything except test/fuzz)',
      },
    };
    for (const [job, {lanes, name, first, last}] of Object.entries(WAITS_IN)) {
      it(`${job} starts from the gate alone, with no waiter job, and may read the actions`, () => {
        const heavy = jobOf(ci, job);
        expect(ci).not.toContain(`  ${job}-wait:`);
        expect(heavy).toContain('    needs: lanes\n');
        expect(heavy).toContain('      actions: read\n');
        expect(heavy).toContain('      MION_LANES: ${{ needs.lanes.outputs.lanes }}\n');
        expect(heavy).toMatch(/uses: actions\/checkout@v5\n\s+with:\n(\s+#.*\n)?\s+fetch-depth: 2\n/);
      });

      it(`${job} waits for exactly its lanes, ends on its own job failing in the older run, and keeps the gate verdict on a failed wait`, () => {
        const heavy = jobOf(ci, job);
        const steps = [...heavy.matchAll(/- name: (Wait for the older run's .+)\n((?:\s{8,}.+\n)+)/g)];
        expect(steps.length).toBeGreaterThan(0);
        for (const [, , body] of steps) {
          expect(body).toContain('continue-on-error: true');
          expect(body).toContain('uses: ./.github/actions/wait-for-older-run');
          expect(body).toContain(`lanes: ${lanes.join(' ')}\n`);
          expect(body).toContain(`jobs: ${name}\n`);
        }
        expect(name.startsWith(/^ {4}name: (.+)$/m.exec(heavy)?.[1] ?? '')).toBe(true);
      });

      it(`${job} runs the comment-reading steps before the wait, and the code steps after it`, () => {
        const heavy = jobOf(ci, job);
        const late = heavy.lastIndexOf("- name: Wait for the older run's");
        expect(heavy.indexOf(`- name: ${first}`)).toBeLessThan(late);
        expect(late).toBeLessThan(heavy.indexOf(`- name: ${last}`));
      });
    }

    it('re-decides from the markers without cancelling or keeping runs, and hands the verdict to the steps below', () => {
      const action = read('.github/actions/wait-for-older-run/action.yml');
      expect(action).toMatch(
        /uses: \.\/\.github\/actions\/ci-lanes\n\s+with:\n\s+lanes: \$\{\{ inputs\.lanes \}\}\n\s+supersede: 'false'/
      );
      // Without --pr a js wait looks for the full js marker, which a pull request's partial run never saves.
      expect(action).toContain(
        `--jobs '\${{ inputs.jobs }}' --timeout $(( \${{ inputs.minutes }} - 10 )) \${{ github.event_name == 'pull_request' && '--pr' || '' }}`
      );
      expect(action).toContain('>> "$GITHUB_ENV"');
    });
  });

  it('waits on every drizzle dialect job, which GitHub names after the dialect alone', () => {
    const jobs = /^ {6}jobs: (.+)$/m.exec(jobOf(read('.github/workflows/drizzle-e2e.yml'), 'drizzle-wait'))?.[1].split('|');
    for (const item of Object.keys((LANES as Record<string, {items: object}>).drizzle.items)) expect(jobs).toContain(item);
  });

  // A job reading env.MION_LANES set from the gate alone would repeat what the older run proves.
  it('sets MION_LANES from the waiter on every job that reads it', () => {
    let checked = 0;
    for (const file of Object.keys(WORKFLOWS)) {
      const workflow = read(`.github/workflows/${file}`);
      const owners: [string, string][] = [
        ...Object.keys(WAITERS[file as keyof typeof WAITERS]).map((job): [string, string] => [job, waiterOf(job)]),
        ...READERS.filter(([owner]) => owner === file).map(([, job, waiter]): [string, string] => [job, waiter]),
      ];
      for (const job of workflow.split(/\n  (?=[\w-]+:\n)/)) {
        if (!job.includes('env.MION_LANES')) continue;
        checked += 1;
        const name = job.slice(0, job.indexOf(':'));
        if (IN_JOB_WAITERS.some(([owner, owned]) => owner === file && owned === name)) {
          expect(job).toContain('      MION_LANES: ${{ needs.lanes.outputs.lanes }}\n');
          continue;
        }
        const waiter = owners.find(([owned]) => owned === name)?.[1];
        expect(waiter, `${file}: ${name} reads MION_LANES with no waiter`).toBeDefined();
        expect(job).toContain(`      MION_LANES: \${{ needs.${waiter}.outputs.lanes || needs.lanes.outputs.lanes }}\n`);
        expect(/^ {4}needs: \[(.+)\]$/m.exec(job)?.[1].split(', ')).toContain(waiter);
      }
    }
    // go-fuzz, js-lint, smoke, pre-publish-e2e.
    expect(checked).toBe(4);
  });

  // GitHub skips a job when anything up its needs chain was skipped, so these check their direct need instead.
  it('runs the jobs below a guarded job on that job succeeding, not on success()', () => {
    for (const [file, job, direct] of [
      ['pr-heavy.yml', 'bench-green', 'bench'],
      ['pr-heavy.yml', 'pre-publish-e2e', 'pre-publish-build'],
      ['drizzle-e2e.yml', 'drizzle-e2e', 'build'],
      ['drizzle-e2e.yml', 'record-green', 'drizzle-e2e'],
    ] as const) {
      expect(jobOf(read(`.github/workflows/${file}`), job), `${file}: ${job}`).toContain(
        `    if: \${{ !cancelled() && needs.${direct}.result == 'success' }}`
      );
    }
  });

  // The gate decides which lanes an older run is really running from these, so each must match its own job `if:`.
  it("mirrors each job's label condition in its lanes' gate", () => {
    for (const [file, jobs] of Object.entries(WAITERS)) {
      const workflow = read(`.github/workflows/${file}`);
      for (const [job, lanes] of Object.entries(jobs)) {
        const condition = /^ {4}if: (.+)$/m.exec(jobOf(workflow, job))?.[1] ?? '';
        for (const lane of lanes) {
          const {gate} = gates[lane];
          // drizzle's label is read by its `decide` job, which the build waits on, together with the prod base.
          const required = gate.base ? [] : gate.label ? [gate.label] : [];
          expect(labelsIn(condition, false), `${file}: ${job} for ${lane}`).toEqual(required);
          expect(labelsIn(condition, true), `${file}: ${job} for ${lane}`).toEqual(gate.unless ? [gate.unless] : []);
          if (gate.base) {
            expect(condition).toContain("needs.decide.outputs.run == 'true'");
            expect(jobOf(workflow, 'decide')).toContain(`contains(fromJSON(needs.lanes.outputs.labels), '${gate.label}')`);
            expect(read('scripts/release/drizzle-e2e.mjs')).toContain(`!== '${gate.base}'`);
          }
        }
      }
    }
    expect(laneLive('website', {labels: [], baseRef: ''})).toBe(false);
    expect(laneLive('go', {labels: ['skip-defaults'], baseRef: ''})).toBe(false);
  });

  // Saved at the job's end, a late cancel would lose them.
  it('saves each go-fuzz lane and the website smoke right after their own last step', () => {
    const ci = read('.github/workflows/ci.yml');
    const next = (after: string) => ci.slice(ci.indexOf(after)).split('\n      - ')[1] ?? '';
    expect(next('- name: Go test suite (fuzz sweeps at quick budgets)')).toMatch(/^name: Record the Go suite as green\n/);
    expect(next('- name: Time-boxed fuzz lanes at quick budgets')).toMatch(/^name: Record the JS fuzz sweep as green\n/);
    expect(next('- name: Website serves-a-page smoke')).toMatch(/^name: Record the website smoke as green\n/);
  });
});

// ci-lanes reads the verdict from --out and writes `lanes=` once itself, so lanes.mjs must never write it.
describe('lanes --out', () => {
  const decideInto = (extra: string[]) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'lanes-out-'));
    const env = {...process.env};
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const name of ['output', 'summary', 'verdict.json']) writeFileSync(path.join(dir, name), '');
      process.env.GITHUB_OUTPUT = path.join(dir, 'output');
      process.env.GITHUB_STEP_SUMMARY = path.join(dir, 'summary');
      lanesMain(['--decide', 'js', ...extra.map((arg) => arg.replace('<dir>', dir))]);
      const contents = (name: string) => readFileSync(path.join(dir, name), 'utf8');
      // note() logs through console.log too, so count only the JSON verdict.
      const printed = log.mock.calls.filter(([first]) => String(first).startsWith('{')).length;
      return {printed, verdict: contents('verdict.json'), output: contents('output'), summary: contents('summary')};
    } finally {
      process.env = env;
      log.mockRestore();
      err.mockRestore();
      rmSync(dir, {recursive: true, force: true});
    }
  };

  it('writes the verdict to the file instead of printing it', () => {
    const result = decideInto(['--out', '<dir>/verdict.json']);
    expect(Object.keys(JSON.parse(result.verdict))).toEqual(['js']);
    expect(result.printed).toBe(0);
  });

  it('with --github, adds only the summary table and never a `lanes=` output', () => {
    const result = decideInto(['--out', '<dir>/verdict.json', '--github']);
    expect(result.summary).toContain('### CI lanes');
    expect(result.output).toBe('');
  });

  it('prints the verdict when there is no --out', () => {
    expect(decideInto([]).printed).toBe(1);
  });
});

// The gate's keep-or-cancel script with a fake gh; each case once failed open or failed the gate.
describe('the gate keeps or cancels older runs', () => {
  const action = read('.github/actions/ci-lanes/action.yml');
  const scriptOf = (name: string) =>
    (/run: \|\n((?: {8}.*\n?)+)/.exec(action.slice(action.indexOf(`- name: ${name}`)))?.[1] ?? '').replace(/^ {8}/gm, '');
  const decision = {lanes: {go: {run: true, hash: 'g'}}, labels: [], baseRef: 'main'};
  const run = (gh: string, files: Record<string, string> = {}) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'supersede-gate-'));
    try {
      mkdirSync(path.join(dir, '.lane-decision'));
      writeFileSync(path.join(dir, '.lane-decision/decision.json'), JSON.stringify(decision));
      for (const [name, content] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(dir, name)), {recursive: true});
        writeFileSync(path.join(dir, name), content);
      }
      symlinkSync(path.join(REPO_ROOT, 'scripts'), path.join(dir, 'scripts'));
      const env = {
        PATH: process.env.PATH,
        GITHUB_OUTPUT: path.join(dir, 'output'),
        GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
        GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/ci.yml@refs/pull/1/merge',
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_RUN_ID: '50',
        GITHUB_HEAD_REF: 'feat',
        GITHUB_EVENT_NAME: 'pull_request',
        MION_PR_NUMBER: '1',
      };
      writeFileSync(env.GITHUB_OUTPUT, '');
      const result = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-eo', 'pipefail', '-c', `gh() { ${gh}; }\n${scriptOf('Keep or cancel the older runs')}`],
        {cwd: dir, env, encoding: 'utf8'}
      );
      const older = JSON.parse(readFileSync(path.join(dir, '.lane-decision/older.json'), 'utf8') || '[]');
      return {status: result.status, stdout: result.stdout, output: readFileSync(env.GITHUB_OUTPUT, 'utf8'), older};
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  };
  // `gh api` lists runs 41 and 42; `gh run download` succeeds only where a file was planted.
  const listing = `case "$1" in api) echo 41; echo 42;; run) [ "$2" = download ] && [ -f ".lane-decision/older/$3/decision.json" ];; esac`;

  it('keeps an unchanged run, and cancels one whose decision cannot be downloaded', () => {
    const result = run(listing, {'.lane-decision/older/41/decision.json': JSON.stringify(decision)});
    expect(result.status).toBe(0);
    expect(result.older).toEqual([
      {runId: 41, decision},
      {runId: 42, decision: null},
    ]);
    expect(result.output).toBe('cancel=42\n');
  });

  it('counts an unreadable decision as none instead of failing the gate', () => {
    const result = run(listing, {
      '.lane-decision/older/41/decision.json': '{not json',
      '.lane-decision/older/42/decision.json': '{}',
    });
    expect(result.status).toBe(0);
    expect(result.older).toEqual([
      {runId: 41, decision: null},
      {runId: 42, decision: null},
    ]);
    expect(result.output).toBe('cancel=41 42\n');
  });

  it('warns and cancels nothing when the runs cannot be listed', () => {
    const result = run('return 1');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::warning::could not list the older runs');
    expect(result.output).toBe('cancel=\n');
  });

  it('lists only older runs of this pull request, from this repository, through the API', () => {
    const script = scriptOf('Keep or cancel the older runs');
    expect(script).toContain('-f branch="${GITHUB_HEAD_REF:-$GITHUB_REF_NAME}"');
    expect(script).toContain('.id < $GITHUB_RUN_ID');
    expect(script).toContain('.head_repository.full_name == \\"$GITHUB_REPOSITORY\\"');
    expect(script).toContain('[.pull_requests[].number | tostring] | index(\\"$MION_PR_NUMBER\\")');
    expect(action).not.toMatch(/run: \|[\s\S]*\$\{\{ github\.head_ref/);
  });

  it('warns on a run that cannot be cancelled, and still succeeds', () => {
    const script = scriptOf('Cancel the older runs this commit makes stale').replace(
      '${{ steps.supersede.outputs.cancel }}',
      '41'
    );
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', `gh() { return 1; }\n${script}`], {
      encoding: 'utf8',
      env: {PATH: process.env.PATH, GITHUB_REPOSITORY: 'o/r'},
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::warning::could not cancel run 41');
  });

  // skip-defaults cancels through the labels this run records; without them the gate would never see the label.
  it('records the live labels in the decision it compares with', () => {
    expect(action).toContain("MION_PR_LABELS: ${{ steps.labels.outputs.labels || '[]' }}");
    expect(scriptOf('Decide the lanes from their input hashes')).toContain('--argjson labels "$MION_PR_LABELS"');
    expect(scriptOf('Decide the lanes from their input hashes')).toContain(
      "'{lanes: $lanes[0], labels: $labels, baseRef: $baseRef}'"
    );
  });
});

describe('lane markers claim only what their job proved', () => {
  it('never lets one drizzle dialect or one bench competitor save the whole lane', () => {
    expect(jobOf(read('.github/workflows/drizzle-e2e.yml'), 'drizzle-e2e')).not.toContain('lane: drizzle\n');
    expect(jobOf(read('.github/workflows/pr-heavy.yml'), 'bench')).not.toContain('lane: bench\n');
  });

  it('records each bench competitor on its own, and the lane only after every competitor that ran passed', () => {
    const workflow = read('.github/workflows/pr-heavy.yml');
    expect(jobOf(workflow, 'bench')).toMatch(
      /lane: bench\.\$\{\{ matrix\.competitor \}\}\n\s+hash: \$\{\{ fromJSON\(needs\.lanes\.outputs\.lanes\)\.bench\.items\[matrix\.competitor\]\.hash \}\}/
    );
    const green = jobOf(workflow, 'bench-green');
    expect(green).toContain('needs: [lanes, bench]');
    expect(green).toContain("if: ${{ !cancelled() && needs.bench.result == 'success' }}");
    expect(green).toContain('lane: bench\n');
  });
});

describe('the Go toolchain setup', () => {
  const action = read('.github/actions/resolver/action.yml');

  // website-deploy runs on arm64; its build objects must never restore on x64.
  it('keys the Go build cache on the runner arch, in the key and the restore key', () => {
    expect(action).toMatch(/key: \$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-gocache-/);
    expect(action).toMatch(/restore-keys: \|\n\s+\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-gocache-/);
  });

  // `submodules: recursive` also pulls typescript-go's ~620 MB TypeScript corpus, which no build reads.
  it('never fetches the submodules recursively, and inits only tsgolint and its typescript-go', () => {
    const files = globSync('.github/{workflows,actions}/**/*.yml', {cwd: REPO_ROOT});
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(read(file), file).not.toMatch(/^\s*submodules:\s*(recursive|true)/m);
    expect(action).toContain('git submodule update --init --depth 1 ts-go-runtypes/third_party/tsgolint\n');
    expect(action).toContain('git -C ts-go-runtypes/third_party/tsgolint submodule update --init --depth 1 typescript-go\n');
    expect(action).not.toContain('--recursive');
  });

  // The step runs from the repo root, so a patch glob written relative to another directory matches nothing.
  it('hands git apply every patch file, not the unexpanded glob', () => {
    const applyLine = action.split('\n').find((line) => line.includes('patches/*.patch'));
    expect(applyLine).toBeDefined();
    const root = mkdtempSync(path.join(os.tmpdir(), 'resolver-patches-'));
    try {
      const tsgolint = path.join(root, 'ts-go-runtypes/third_party/tsgolint');
      mkdirSync(path.join(tsgolint, 'typescript-go'), {recursive: true});
      mkdirSync(path.join(tsgolint, 'patches'));
      for (const name of ['0001-a.patch', '0002-b.patch']) writeFileSync(path.join(tsgolint, 'patches', name), '');
      const script = `git() { printf '%s\\n' "$@"; }\n${applyLine}`;
      const run = spawnSync('bash', ['-e', '-c', script], {cwd: root, encoding: 'utf8'});
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout.trim().split('\n')).toEqual(['apply', '--3way', '../patches/0001-a.patch', '../patches/0002-b.patch']);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });
});

// build-gate.test.ts runs real `go build`s, so only the Go runner may run it, exactly once.
describe('the build-gate tests run on the Go runner and nowhere else', () => {
  const ci = read('.github/workflows/ci.yml');

  it('runs in go-fuzz under the go-tools lane', () => {
    expect(jobOf(ci, 'go-fuzz')).toMatch(
      /if: fromJSON\(env\.MION_LANES\)\['go-tools'\]\.run\n\s+run: pnpm test packages\/devtools\/test\/build-gate\.test\.ts/
    );
  });

  it('is excluded from both js-lint suite commands', () => {
    const suite = jobOf(ci, 'js-lint');
    const commands = suite.split('\n').filter((line) => /core test-pr|core test-skip/.test(line));
    expect(commands).toHaveLength(2);
    for (const command of commands) expect(command).toContain("--exclude '**/build-gate.test.ts'");
  });
});

describe('the converted-suites refusal count runs per PR', () => {
  const ci = read('.github/workflows/ci.yml');

  it('runs the count in go-fuzz under the go-tools lane', () => {
    expect(jobOf(ci, 'go-fuzz')).toMatch(
      /if: fromJSON\(env\.MION_LANES\)\['go-tools'\]\.run\n\s+run: pnpm miondevx core converted-suites --refusals-only\n/
    );
  });

  it('feeds the go-tools lane every input that moves the count', () => {
    for (const input of [
      'packages/run-types/test/suites/strict-validation/Strict.ts',
      'packages/run-types/src/index.ts',
      'packages/run-types/test/features/unsupported-conversion.test.ts',
      'ts-go-runtypes/internal/convert/print.go',
      'scripts/core/converted-suites.mjs',
    ])
      expect(matches(input, LANES['go-tools'].paths), input).toBe(true);
  });
});

// `opened` and `labeled` fire together and either run may outlive the other; the `opened` payload has no labels.
describe('label gates read the live labels, never the event payload', () => {
  const LIVE_LABELS = 'fromJSON(needs.lanes.outputs.labels)';
  const action = read('.github/actions/ci-lanes/action.yml');
  const step = action.slice(action.indexOf('id: labels'));
  const labelScript = (/run: \|\n((?: {8}.*\n?)+)/.exec(step)?.[1] ?? '').replace(/^ {8}/gm, '');
  // A real file for GITHUB_OUTPUT: on Linux node hands bash a socket, which /dev/stdout cannot reopen.
  const runLabelScript = (prNumber: string, gh: string) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'label-gate-'));
    try {
      const output = path.join(dir, 'output');
      writeFileSync(output, '');
      const env = {PATH: process.env.PATH, MION_PR_NUMBER: prNumber, GITHUB_OUTPUT: output};
      const script = `gh() { ${gh}; }\n${labelScript}`;
      const run = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {env, encoding: 'utf8'});
      return {status: run.status, output: readFileSync(output, 'utf8')};
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  };

  it('no workflow or action reads labels from the event payload', () => {
    const files = globSync('.github/{workflows,actions}/**/*.yml', {cwd: REPO_ROOT});
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(read(file), file).not.toContain('github.event.pull_request.labels');
  });

  it('every job reading the labels needs the lanes job', () => {
    let checked = 0;
    for (const file of Object.keys(WORKFLOWS)) {
      for (const job of read(`.github/workflows/${file}`).split(/\n  (?=[\w-]+:\n)/)) {
        if (!job.includes(LIVE_LABELS)) continue;
        checked += 1;
        expect(/^ {4}needs: (.+)$/m.exec(job)?.[1], `${file}: ${job.slice(0, job.indexOf(':'))}`).toMatch(
          /^(lanes|\[.*\blanes\b.*\])$/
        );
      }
    }
    // website, bench, pre-publish-build, go-fuzz, js-lint, smoke, decide.
    expect(checked).toBe(7);
  });

  it('drizzle-e2e decides on its own label', () => {
    expect(jobOf(read('.github/workflows/drizzle-e2e.yml'), 'decide')).toContain(
      `LABELLED: \${{ contains(${LIVE_LABELS}, 'drizzle-e2e') }}`
    );
  });

  it('ci-lanes exposes the labels it reads for this pull request', () => {
    expect(action).toMatch(/\n {2}labels:\n.*\n {4}value: \$\{\{ steps\.labels\.outputs\.labels \|\| '\[\]' \}\}\n/);
    expect(action).toContain('MION_PR_NUMBER: ${{ github.event.pull_request.number }}');
    expect(labelScript).toContain('gh pr view "$MION_PR_NUMBER" --json labels');
  });

  it('emits the label names the API returns', () => {
    expect(runLabelScript('436', `echo '["bench","website"]'`)).toEqual({status: 0, output: 'labels=["bench","website"]\n'});
  });

  it('emits [] off a pull request, without calling the API', () => {
    expect(step).toMatch(/^ {6}if: inputs\.supersede == 'true' && github\.event\.pull_request\.number$/m);
    expect(action).toContain("value: ${{ steps.labels.outputs.labels || '[]' }}");
  });

  it('fails the gate when the API read fails, never emitting a guess', () => {
    const run = runLabelScript('436', 'echo boom >&2; return 1');
    expect(run.status).not.toBe(0);
    expect(run.output).toBe('');
  });
});
