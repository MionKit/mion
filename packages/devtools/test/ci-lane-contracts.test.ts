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
import {globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  LANES,
  FEEDS_NOTHING,
  candidateKeys,
  decide,
  greenKey,
  itemFeeds,
  laneHashes,
  matches,
  unclassified,
  // @ts-expect-error — a plain .mjs repo script, no types.
} from '../../../scripts/ci/lanes.mjs';
// @ts-expect-error — a plain .mjs repo script, no types.
import {SWEEPS} from '../../../scripts/ci/check-tree.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const WORKFLOWS = {
  'ci.yml': ['go', 'js-fuzz', 'go-tools', 'js', 'smoke'],
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
        expect(matches(path, lane.paths), `${name} reads ${path}`).toBe(name === 'go' || name === 'go-tools');
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
    expect(action).toContain('--github $PR_FLAG $BASE_FLAG');
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
    expect(action).toContain('--github $PR_FLAG');
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
  const gate = ci.slice(ci.indexOf('\n  lanes:'), ci.indexOf('\n  go-fuzz:'));

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
      const reference = lane.startsWith('[')
        ? `fromJSON(needs.lanes.outputs.lanes)${lane}.run`
        : `fromJSON(needs.lanes.outputs.lanes).${lane}.run`;
      expect(ci).toContain(`if: success() && ${reference}`);
    }
  });

  // The lane marker claims all five, so it waits on every dialect job that ran; the rest had their own markers.
  it('records each drizzle dialect on its own, and the lane only after every dialect that ran passed', () => {
    const drizzle = read('.github/workflows/drizzle-e2e.yml');
    const dialects = drizzle.slice(drizzle.indexOf('\n  drizzle-e2e:'), drizzle.indexOf('\n  record-green:'));
    expect(dialects).toContain('dialect: ${{ fromJSON(needs.lanes.outputs.lanes).drizzle.runItems }}');
    expect(dialects).toMatch(
      /lane: drizzle\.\$\{\{ matrix\.dialect \}\}\n\s+hash: \$\{\{ fromJSON\(needs\.lanes\.outputs\.lanes\)\.drizzle\.items\[matrix\.dialect\]\.hash \}\}/
    );
    const record = drizzle.slice(drizzle.indexOf('\n  record-green:'));
    expect(record).toContain('needs: [lanes, drizzle-e2e]');
    expect(record).toContain('if: success()');
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
            `if: success\\(\\) && contains\\(fromJSON\\(needs\\.lanes\\.outputs\\.lanes\\)\\.${lane}\\.runItems, '${item}'\\)\\n\\s+uses: \\./\\.github/actions/save-lane-green\\n\\s+with:\\n\\s+lane: ${lane}\\.${item}\\n`
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
        // The lane-marker jobs (record-green, bench-green) do no work, so only work AFTER the save fails.
        expect(firstSave, `${file}: a run step follows a save-lane-green step`).toBeGreaterThan(
          job.lastIndexOf('\n        run: ')
        );
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
    expect(green).toContain('if: success()');
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
      /if: fromJSON\(needs\.lanes\.outputs\.lanes\)\['go-tools'\]\.run\n\s+run: pnpm test packages\/devtools\/test\/build-gate\.test\.ts/
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
      /if: fromJSON\(needs\.lanes\.outputs\.lanes\)\['go-tools'\]\.run\n\s+run: pnpm miondevx core converted-suites --refusals-only\n/
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

// `opened` and `labeled` fire together and concurrency cancels one; the `opened` payload has no labels.
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
    expect(action).toMatch(/\n {2}labels:\n.*\n {4}value: \$\{\{ steps\.labels\.outputs\.labels \}\}\n/);
    expect(action).toContain('MION_PR_NUMBER: ${{ github.event.pull_request.number }}');
    expect(labelScript).toContain('gh pr view "$MION_PR_NUMBER" --json labels');
  });

  it('emits the label names the API returns', () => {
    expect(runLabelScript('436', `echo '["bench","website"]'`)).toEqual({status: 0, output: 'labels=["bench","website"]\n'});
  });

  it('emits [] off a pull request, without calling the API', () => {
    expect(runLabelScript('', 'return 1')).toEqual({status: 0, output: 'labels=[]\n'});
  });

  it('fails the gate when the API read fails, never emitting a guess', () => {
    const run = runLabelScript('436', 'echo boom >&2; return 1');
    expect(run.status).not.toBe(0);
    expect(run.output).toBe('');
  });
});
