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
// @ts-expect-error — a plain .mjs repo script, no types.
import {readProjects} from '../../../scripts/core/test-batches.mjs';

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
    for (const dir of ['docs/', '.agents/', '.claude/', '.codex/', 'AGENTS.md', 'CLAUDE.md'])
      expect(FEEDS_NOTHING).toContain(dir);
    for (const lane of Object.values(LANES) as {paths: string[]}[]) {
      for (const ignored of FEEDS_NOTHING) expect(lane.paths, `${ignored} must feed no lane`).not.toContain(ignored);
    }
  });

  // A docs-only PR must still run check-code-imports: it alone fails a dangling <code-import> instead of rendering it.
  it('feeds the docs content and the examples into the js-static lane that checks them', () => {
    for (const fed of ['container/', 'packages/']) expect(LANES['js-static'].paths).toContain(fed);
  });

  it('skips instruction changes in tokens lanes while raw lanes keep checking scoped Markdown', () => {
    const source = {objectname: 'source', path: 'packages/run-types/src/a.ts'};
    const scopes = [
      '',
      'packages/run-types/src/builders/',
      'packages/devtools/',
      'ts-go-runtypes/',
      'container/website/',
      'new-scope/',
    ];
    const instructions = scopes.map((scope) => ({objectname: 'old', path: `${scope}CLAUDE.md`}));
    const renamed = scopes.map((scope) => ({objectname: 'new', path: `${scope}AGENTS.md`}));
    const config = ['.agents/skills/a/SKILL.md', '.claude/settings.json', '.codex/config.toml'].map((path) => ({
      objectname: 'agent',
      path,
    }));
    for (const mode of ['t', 'r']) {
      const digests = {mode, byKey: new Map()};
      const base = laneHashes(undefined, {entries: [source], digests});
      for (const entries of [
        [source, ...instructions],
        [source, ...renamed, ...config],
      ]) {
        const head = laneHashes(undefined, {entries, digests});
        expect(head.unknown).toEqual([]);
        const tokenLanes = Object.entries(LANES)
          .filter(([, lane]) => (lane as {hash: string}).hash === 'tokens')
          .map(([name]) => name);
        for (const name of tokenLanes) {
          expect(head.hashes[name]).toBe(base.hashes[name]);
          for (const item of Object.keys(LANES[name].items ?? {}))
            expect(head.hashes[`${name}.${item}`]).toBe(base.hashes[`${name}.${item}`]);
        }
        expect(head.hashes['js-static']).not.toBe(base.hashes['js-static']);
        expect(head.hashes['go-static']).not.toBe(base.hashes['go-static']);
        expect(head.hashes['go-tools']).not.toBe(base.hashes['go-tools']);
        for (const verdict of Object.values(decide(tokenLanes, {hashes: head.hashes, baseHashes: base.hashes}))) {
          expect((verdict as {run: boolean}).run).toBe(false);
        }
      }
      // Instruction names must not hide actual configuration, fixtures or an unknown input.
      for (const path of ['package.json', '.gitignore', 'packages/x/testdata/AGENTS.md.txt', 'new-scope/AGENTS.md.js']) {
        const changed = laneHashes(undefined, {entries: [source, {objectname: 'changed', path}], digests});
        expect(changed.hashes.js, path).not.toBe(base.hashes.js);
      }
    }
  });

  // The two trees read into each other: derive each direction from its reader, so neither rots into a silent skip.
  it('feeds every tsconfig the root typecheck compiles into the js-static lane', () => {
    const typecheck = JSON.parse(read('package.json')).scripts.typecheck as string;
    const projects = [...typecheck.matchAll(/tsc -p (\S+)/g)].map((match) => match[1]);
    expect(projects.length).toBeGreaterThan(2);
    for (const project of projects) {
      expect(
        matches(project, LANES['js-static'].paths),
        `${project} is typechecked by js-static but feeds no js-static path`
      ).toBe(true);
    }
  });

  // Every repo path a Go test reads goes through testfixtures repoLinks (pinned by its own Go test).
  it('feeds every repo path the Go suites read into the go lane', () => {
    const links =
      /var repoLinks = \[\]string\{\n([\s\S]*?)\n\}/.exec(read('ts-go-runtypes/internal/testfixtures/repo.go'))?.[1] ?? '';
    const linked = [...links.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(linked).toEqual(expect.arrayContaining(['packages/run-types', 'packages/core', 'version.json']));
    for (const path of linked)
      expect(
        matches(`${path}${path.includes('.') ? '' : '/'}`, LANES.go.paths),
        `${path} is read by the Go suites but feeds no go lane path`
      ).toBe(true);
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
    // `website check` builds the playground assets with these scripts.
    expect(feeds('smoke', 'scripts/website/playground-overlay.mjs')).toEqual(['website']);
  });

  // A shard item claims no path: every input of its lane feeds every shard, so each shard hashes the whole lane.
  it('feeds every Go and fuzz shard every input of its lane, and each shard hashes the lane', () => {
    const {hashes} = laneHashes('HEAD');
    for (const lane of ['go', 'js-fuzz']) {
      const items = Object.keys(LANES[lane].items);
      for (const path of ['ts-go-runtypes/internal/reflection/kind.go', 'packages/run-types/src/index.ts', 'pnpm-lock.yaml']) {
        expect(
          items.filter((item) => itemFeeds(LANES[lane], item, path)),
          `${lane} ${path}`
        ).toEqual(items);
      }
      for (const item of items) expect(hashes[`${lane}.${item}`], `${lane}.${item}`).toBe(hashes[lane]);
    }
    // The shard script decides what each Go runner runs, so editing it re-runs the suite.
    expect(matches('scripts/ci/go-shard.mjs', LANES.go.paths)).toBe(true);
  });

  it('runs only the Go shards not yet proven', () => {
    const hashes = {go: 'g', 'go.1': 'g', 'go.2': 'g', 'go.3': 'g'};
    const one = decide(['go'], {hashes, greenKeys: [greenKey('go.1', 'g'), greenKey('go.3', 'g')]}).go;
    expect(one.runItems).toEqual(['2']);
    expect(decide(['go'], {hashes, greenKeys: [greenKey('go', 'g')]}).go.run).toBe(false);
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
    // Still read by js-static, so the code-import check keeps covering the pages.
    for (const path of textAndStyle) expect(matches(path, LANES['js-static'].paths), path).toBe(true);
  });

  // Only js-static's checks read page text (code imports, contracts, the link test), so a page edit runs nothing else.
  it('feeds page text to js-static only, and website code to every JS lane', () => {
    const ciLanes = WORKFLOWS['ci.yml'].filter((lane) => lane !== 'smoke');
    const readersOf = (path: string): string[] => ciLanes.filter((lane) => matches(path, LANES[lane].paths));
    for (const page of ['container/website/content/01.rpc/01.intro.md', 'container/website/content/01.rpc/_dir.yml'])
      expect(readersOf(page), page).toEqual(['js-static']);
    for (const code of ['container/website/app/playground/index.ts', 'container/benchmarks/shared/cases/objects.ts'])
      expect(readersOf(code), code).toEqual(['js-fuzz', 'go-tools', 'js', 'js-static']);
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
    const hashes = {js: 'abc', 'go-static': 'def'};
    expect(candidateKeys(['js', 'go-static'], {hashes})).toEqual([greenKey('js', 'abc'), greenKey('go-static', 'def')]);
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
      writeFileSync(path.join(repo, 'AGENTS.md'), 'b');
      for (const file of ['.agents/skills/example/SKILL.md', '.claude/settings.json', '.codex/config.toml']) {
        mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
        writeFileSync(path.join(repo, file), 'agent configuration');
      }
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

  it('js-green saves the full js marker only for a full run, and js-pr for a partial one', () => {
    const ci = read('.github/workflows/ci.yml');
    for (const [job, step] of [
      ['js-suite', '- name: JS suite (everything except test/fuzz)'],
      ['js-serial', '- name: JS suite (one-worker projects)'],
    ]) {
      const suite = jobOf(ci, job).slice(jobOf(ci, job).indexOf(step));
      expect(suite, job).toMatch(/scope=partial"[^\n]*\n\s+pnpm miondevx core test-pr --base HEAD\^1 --skip-passed /);
      expect(suite, job).toMatch(/scope=full"[^\n]*\n\s+pnpm miondevx core test-skip --audit /);
      expect(jobOf(ci, job), job).toContain('      scope: ${{ steps.suite.outputs.scope }}\n');
    }
    const green = jobOf(ci, 'js-green');
    expect(green).toContain(
      "    if: ${{ !cancelled() && needs.js-suite.result == 'success' && needs.js-serial.result == 'success' && needs.js-suite.outputs.scope == needs.js-serial.outputs.scope }}"
    );
    expect(green).toMatch(
      /if: needs\.js-suite\.outputs\.scope == 'full'\n\s+uses: \.\/\.github\/actions\/save-lane-green\n\s+with:\n\s+lane: js\n/
    );
    expect(green).toMatch(
      /if: needs\.js-suite\.outputs\.scope == 'partial'\n\s+uses: \.\/\.github\/actions\/save-lane-green\n\s+with:\n\s+lane: js-pr\n/
    );
  });
});

// PRs skip what the list proved; main runs everything, so a key missing an input fails there instead of hiding.
// Each suite job keeps its own list, keyed per run so every run saves.
describe('js-suite and js-serial — the passed test lists', () => {
  const ci = read('.github/workflows/ci.yml');
  const step = (job: string, name: string) =>
    jobOf(ci, job)
      .slice(jobOf(ci, job).indexOf(`- name: ${name}`))
      .split(/\n\s+- name: /)[0];

  it.each([
    ['js-suite', 'the passed test list', 'vitest-passed.json', 'mion-vitest-passed-'],
    ['js-serial', 'the passed one-worker test list', 'vitest-serial-passed.json', 'mion-vitest-serial-passed-'],
  ])('%s restores %s before the suite and saves it after, under one per-run key', (job, list, file, prefix) => {
    const restore = step(job, `Restore ${list}`);
    const save = step(job, `Save ${list}`);
    const key = `key: ${prefix}\${{ github.run_id }}-\${{ github.run_attempt }}`;
    expect(restore).toContain('uses: actions/cache/restore@v4');
    expect(restore).toContain(`path: node_modules/.cache/mion/${file}`);
    expect(restore).toContain(key);
    expect(restore).toMatch(new RegExp(`restore-keys: ${prefix}$`, 'm'));
    expect(save).toContain('uses: actions/cache/save@v4');
    expect(save).toContain(`path: node_modules/.cache/mion/${file}`);
    expect(save).toContain(key);
    expect(save).toContain("if: always() && steps.suite.outcome != 'skipped'");
    const body = jobOf(ci, job);
    expect(body.indexOf(`Restore ${list}`)).toBeLessThan(body.indexOf('- name: JS suite'));
    expect(body.indexOf('- name: JS suite')).toBeLessThan(body.indexOf(`Save ${list}`));
    // The default store is the suite's list; the one-worker job names its own.
    if (job === 'js-serial')
      for (const line of commandsOf(body)) expect(line).toContain(`--store node_modules/.cache/mion/${file}`);
  });

  it('keeps a few of each list on main, where every pull request restores from', async () => {
    // @ts-expect-error plain ESM dev script, no types
    const {KEEP_ON_MAIN} = await import('../../../scripts/ci/cache-cleanup.mjs');
    expect(KEEP_ON_MAIN['mion-vitest-passed-']).toBeGreaterThan(0);
    expect(KEEP_ON_MAIN['mion-vitest-serial-passed-']).toBeGreaterThan(0);
  });

  // Vitest runs a `maxWorkers: 1` project one file at a time after every other file, hence js-serial beside the suite.
  it('splits off exactly the projects whose config sets maxWorkers: 1', () => {
    const oneWorker = (readProjects(REPO_ROOT) as {name: string; configPath: string}[])
      .filter((project) => /^\s*maxWorkers: 1,$/m.test(read(project.configPath)))
      .map((project) => project.name)
      .sort();
    expect(oneWorker.length).toBeGreaterThan(0);
    const named = (body: string, flag: string) =>
      commandsOf(body).map((line) => [...line.matchAll(new RegExp(`${flag} (\\S+)`, 'g'))].map((match) => match[1]).sort());
    for (const names of named(jobOf(ci, 'js-suite'), '--skip-project')) expect(names).toEqual(oneWorker);
    for (const names of named(jobOf(ci, 'js-serial'), '--project')) expect(names).toEqual(oneWorker);
    expect(commandsOf(jobOf(ci, 'js-suite'))).toHaveLength(2);
    expect(commandsOf(jobOf(ci, 'js-serial'))).toHaveLength(2);
  });
});

// Whole-tree sweeps must remain in the always-on gate or ignored paths bypass their checks.
// Failed dependencies appear neutral on GitHub; the gate must require no installs (.github/actions/ci-lanes).
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
      // go-build and go-checks-wait decide from the gate whether to start; a deferred lane keeps `run`.
      const withoutStartConditions = workflow
        .split(/\n  (?=[\w-]+:\n)/)
        .map((job) => (/^(go-build|go-checks-wait):/.test(job) ? job.replace(/^ {4}if: .*$/m, '') : job))
        .join('\n  ');
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

  // go-checks runs when either of its lanes is due, so each save re-checks its own lane.
  it('guards each go-checks save on its own lane, not on the job', () => {
    const checks = jobOf(ci, 'go-checks');
    for (const lane of ["['go-static']", "['go-tools']"])
      expect(checks).toContain(`if: success() && fromJSON(env.MION_LANES)${lane}.run`);
  });

  it('records each Go shard on its own, and the lane only after every shard that ran passed', () => {
    const shards = jobOf(ci, 'go-suite');
    expect(shards).toContain(
      'shard: ${{ fromJSON(needs.go-suite-wait.outputs.lanes || needs.lanes.outputs.lanes).go.runItems }}'
    );
    expect(shards).toContain('fail-fast: false');
    expect(shards).toMatch(
      /lane: go\.\$\{\{ matrix\.shard \}\}\n\s+hash: \$\{\{ fromJSON\(needs\.lanes\.outputs\.lanes\)\.go\.items\[matrix\.shard\]\.hash \}\}/
    );
    // The shard count is the number of items, so no item names a shard the script does not have.
    expect(shards).toContain(`run: pnpm miondevx core go-shard \${{ matrix.shard }}/${Object.keys(LANES.go.items).length}\n`);
    const green = jobOf(ci, 'go-green');
    expect(green).toContain('needs: [lanes, go-suite]');
    expect(green).toContain("if: ${{ !cancelled() && needs.go-suite.result == 'success' }}");
    expect(green).toContain('lane: go\n');
  });

  it('records the js-fuzz lane only once each fuzz job passed or had nothing to prove', () => {
    const green = jobOf(ci, 'js-fuzz-green');
    expect(green).toContain('needs: [lanes, js-fuzz-sweep, js-fuzz-timeboxed]');
    for (const job of ['js-fuzz-sweep', 'js-fuzz-timeboxed']) {
      expect(green).toContain(`contains(fromJSON('["success","skipped"]'), needs.${job}.result)`);
      expect(green).toContain(`needs.${job}.result == 'success'`);
    }
    expect(green).toContain('lane: js-fuzz\n');
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
    // Read from the lane table: an item renamed there but not in the workflow would skip its job, which counts as proven.
    for (const [file, lane] of [
      ['ci.yml', 'smoke'],
      ['ci.yml', 'js-fuzz'],
      ['pr-heavy.yml', 'e2e'],
    ] as const) {
      const items = Object.keys(LANES[lane].items);
      const workflow = read(`.github/workflows/${file}`);
      const accessor = (lane.includes('-') ? `['${lane}']` : `.${lane}`).replace(/[.[\]]/g, '\\$&');
      for (const item of items) {
        expect(workflow, `${file} saves ${lane}.${item} unguarded`).toMatch(
          new RegExp(
            `if: success\\(\\) && contains\\(fromJSON\\(env\\.MION_LANES\\)${accessor}\\.runItems, '${item}'\\)\\n\\s+uses: \\./\\.github/actions/save-lane-green\\n\\s+with:\\n\\s+lane: ${lane}\\.${item}\\n`
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
      if (lane.items)
        expect(workflows, `${name} has items nobody runs`).toContain(
          name.includes('-') ? `['${name}'].runItems` : `.${name}.runItems`
        );
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
    // go-checks, go-suite, go-green, js-fuzz-sweep, js-fuzz-timeboxed, js-fuzz-green, js-static, js-green, smoke,
    // website, bench, bench-green, pre-publish-e2e, drizzle-e2e, record-green.
    // The count catches a save step lost to an edit, which the loop cannot.
    expect(checked).toBe(15);
  });
});

const commandsOf = (body: string): string[] => body.split('\n').filter((line) => /core test-pr|core test-skip/.test(line));

const jobOf = (workflow: string, name: string): string => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  const next = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
};

// A job that starts beside go-build misses the cache and builds the binaries itself.
describe('the Go binaries are built once per run, and only for a lane that runs now', () => {
  const ci = read('.github/workflows/ci.yml');
  const restorers = [...ci.matchAll(/^ {2}([\w-]+):\n/gm)]
    .map((match) => match[1])
    .filter((job) => job !== 'go-build' && jobOf(ci, job).includes('uses: ./.github/actions/resolver'));

  // A skipped go-build means every lane waited on an older run; a job its waiter then starts builds the binaries itself.
  it('runs every job that restores the binaries after go-build, unless go-build failed', () => {
    expect(restorers.length).toBeGreaterThan(5);
    for (const job of restorers) {
      const body = jobOf(ci, job);
      expect(/^ {4}needs: \[(.+)\]$/m.exec(body)?.[1].split(', '), job).toContain('go-build');
      expect(/^ {4}if: (.+)$/m.exec(body)?.[1], job).toContain(
        `contains(fromJSON('["success","skipped"]'), needs.go-build.result)`
      );
    }
  });

  it('starts go-build only for a lane that runs without waiting on an older run, installing nothing but Node', () => {
    const build = jobOf(ci, 'go-build');
    for (const lane of WORKFLOWS['ci.yml']) {
      const verdict = `fromJSON(needs.lanes.outputs.lanes)${lane.includes('-') ? `['${lane}']` : `.${lane}`}`;
      expect(build, lane).toContain(`(${verdict}.run && !${verdict}.deferredTo)`);
    }
    expect(build).toContain('uses: ./.github/actions/resolver');
    expect(build).not.toContain('./.github/actions/bootstrap');
  });
});

// Fails silently both ways (scripts/ci/supersede.mjs): GitHub's per-ref cancel back on throws the older run's work
// away, and a heavy job that skips its `-wait` job repeats it.
describe('a new commit cancels only what it changed', () => {
  // The heavy job each waiter guards, and the lanes that job reads.
  const WAITERS = {
    'ci.yml': {
      'go-checks': ['go-static', 'go-tools'],
      'go-suite': ['go'],
      'js-fuzz-sweep': ['js-fuzz'],
      'js-fuzz-timeboxed': ['js-fuzz'],
      'js-static': ['js-static'],
      'js-suite': ['js'],
      'js-serial': ['js'],
      smoke: ['smoke'],
    },
    'pr-heavy.yml': {website: ['website'], bench: ['bench'], 'pre-publish-build': ['e2e']},
    'drizzle-e2e.yml': {build: ['drizzle']},
  } as const;
  const WAITER_NAME: Record<string, string> = {
    'pre-publish-build': 'e2e-wait',
    build: 'drizzle-wait',
    'js-fuzz-sweep': 'js-fuzz-wait',
    'js-fuzz-timeboxed': 'js-fuzz-wait',
    'js-serial': 'js-suite-wait',
  };
  const waiterOf = (job: string) => WAITER_NAME[job] ?? `${job}-wait`;
  // Jobs after the heavy one that also read the waited verdict.
  const READERS: [string, string, string][] = [
    ['pr-heavy.yml', 'pre-publish-e2e', 'e2e-wait'],
    ['drizzle-e2e.yml', 'drizzle-e2e', 'drizzle-wait'],
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
        expect(wait).toContain('      actions: read\n');
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

  // A comment-only JS edit re-runs go-tools but not go-static: a wait on go-static would hold go-tools back.
  it('starts go-checks-wait only when neither of its lanes can run yet', () => {
    const lane = (name: string) => `fromJSON(needs.lanes.outputs.lanes)['${name}']`;
    const idle = (name: string) => `(${lane(name)}.deferredTo || !${lane(name)}.run)`;
    expect(jobOf(read('.github/workflows/ci.yml'), 'go-checks-wait')).toContain(
      `    if: \${{ ${idle('go-static')} && ${idle('go-tools')} && (${lane('go-static')}.deferredTo || ${lane('go-tools')}.deferredTo) }}\n`
    );
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
        const waiter = owners.find(([owned]) => owned === name)?.[1];
        expect(waiter, `${file}: ${name} reads MION_LANES with no waiter`).toBeDefined();
        expect(job).toContain(`      MION_LANES: \${{ needs.${waiter}.outputs.lanes || needs.lanes.outputs.lanes }}\n`);
        expect(/^ {4}needs: \[(.+)\]$/m.exec(job)?.[1].split(', ')).toContain(waiter);
      }
    }
    // go-checks, js-fuzz-sweep, js-fuzz-timeboxed, js-static, js-suite, js-serial, smoke, pre-publish-e2e.
    expect(checked).toBe(8);
  });

  // GitHub skips a job when anything up its needs chain was skipped, so these check their direct need instead.
  it('runs the jobs below a guarded job on that job succeeding, not on success()', () => {
    for (const [file, job, direct] of [
      ['ci.yml', 'go-green', 'go-suite'],
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
  it('saves each go shard, each fuzz item and the website smoke right after their own last step', () => {
    const ci = read('.github/workflows/ci.yml');
    const next = (after: string) => ci.slice(ci.indexOf(after)).split('\n      - ')[1] ?? '';
    expect(next('- name: Go test suite (fuzz sweeps at quick budgets)')).toMatch(/^name: Record the Go shard as green\n/);
    expect(next('- name: Concurrent CLI race fuzz (MION_FUZZ_RACE gate)')).toMatch(/^name: Record the JS fuzz sweep as green\n/);
    expect(next('- name: Time-boxed fuzz lanes at quick budgets')).toMatch(/^name: Record the time-boxed fuzz lanes as green\n/);
    expect(next('- name: Website serves-a-page smoke')).toMatch(/^name: Record the website smoke as green\n/);
    expect(next('- name: Go vet (our code only; never third_party)')).toMatch(/^name: Record gofmt and vet as green\n/);
  });

  // A lane the older run proves needs no answer from decide, which costs a full-history checkout.
  it('starts drizzle decide after the waiter, only when the lane still runs', () => {
    const decide = jobOf(read('.github/workflows/drizzle-e2e.yml'), 'decide');
    expect(decide).toContain('    needs: [lanes, drizzle-wait]\n');
    expect(decide).toContain(
      "    if: ${{ !cancelled() && needs.lanes.result == 'success' && fromJSON(needs.drizzle-wait.outputs.lanes || needs.lanes.outputs.lanes).drizzle.run }}\n"
    );
  });
});

// A kept older run still runs the raw lanes a newer commit re-runs (scripts/ci/supersede.mjs --watch stops them).
describe('a raw-lane step stops once a newer run re-runs its lane', () => {
  const ci = read('.github/workflows/ci.yml');
  const RAW_JOBS = {'go-checks': ['go-static', 'go-tools'], 'js-static': ['js-static']} as const;
  const stepsOf = (job: string) => jobOf(ci, job).split('\n      - ').slice(1);
  const laneOf = (step: string) => /\n {8}if: (?:success\(\) && )?fromJSON\(env\.MION_LANES\)\['([\w-]+)'\]\.run/.exec(step)?.[1];

  for (const [job, lanes] of Object.entries(RAW_JOBS)) {
    it(`${job} can read the newer runs and their decisions`, () => {
      const body = jobOf(ci, job);
      expect(body).toContain('      actions: read\n');
      expect(body).toContain('      MION_WATCH: node ${{ github.workspace }}/scripts/ci/supersede.mjs --watch\n');
      expect(body).toContain('      GH_TOKEN: ${{ github.token }}\n');
    });

    // gofmt is the one multi-line script, and it takes a second.
    it(`${job} runs every one-line command under the watcher for the lane its step gates on`, () => {
      let watched = 0;
      for (const step of stepsOf(job)) {
        const command = /\n {8}run: (?![|>])(.+)/.exec(step)?.[1];
        if (!command) continue;
        const lane = laneOf(step);
        expect(lanes, `${job}: ${command}`).toContain(lane);
        expect(command, `${job}: ${command}`).toMatch(new RegExp(`^\\$MION_WATCH ${lane} -- \\S`));
        watched += 1;
      }
      expect(watched).toBeGreaterThan(lanes.length);
    });

    it(`${job} saves no marker for a lane a newer run took over`, () => {
      for (const lane of lanes)
        expect(jobOf(ci, job)).toContain(
          `if: success() && fromJSON(env.MION_LANES)['${lane}'].run && !contains(env.MION_TAKEN_OVER, '${lane}')\n`
        );
    });
  }

  it('gates the go-tools dists build on go-tools, after the go-static marker', () => {
    const steps = stepsOf('go-checks');
    const build = steps.findIndex((step) => step.startsWith('name: Build the resolver + dists'));
    expect(laneOf(steps[build])).toBe('go-tools');
    expect(steps[build - 1]).toMatch(/^name: Record gofmt and vet as green\n/);
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

  // The listing lives in supersede.mjs, shared with the watcher; a branch name pasted into bash could run code.
  it('lists, downloads and plans in supersede.mjs, with the token and no branch name in the script', () => {
    const step = action.slice(
      action.indexOf('- name: Keep or cancel the older runs'),
      action.indexOf('- name: Cancel the older runs')
    );
    expect(step).toContain(
      'run: node scripts/ci/supersede.mjs --plan --decision .lane-decision/decision.json --older-dir .lane-decision/older --out .lane-decision/final.json --github\n'
    );
    expect(step).toContain('GH_TOKEN: ${{ github.token }}');
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

  it('runs in go-checks under the go-tools lane', () => {
    expect(jobOf(ci, 'go-checks')).toMatch(
      /if: fromJSON\(env\.MION_LANES\)\['go-tools'\]\.run\n\s+run: \$MION_WATCH go-tools -- pnpm test packages\/devtools\/test\/build-gate\.test\.ts/
    );
  });

  it('is excluded from every suite command', () => {
    for (const job of ['js-suite', 'js-serial']) {
      const commands = commandsOf(jobOf(ci, job));
      expect(commands, job).toHaveLength(2);
      for (const command of commands) expect(command).toContain("--exclude '**/build-gate.test.ts'");
    }
  });

  // The js-static step runs these; the suite running them again only doubled their time.
  it('leaves the contract and link tests to the js-static step', () => {
    expect(ci).toContain('run: $MION_WATCH js-static -- pnpm test contracts website-links\n');
    const commands = [...commandsOf(jobOf(ci, 'js-suite')), ...commandsOf(jobOf(ci, 'js-serial'))];
    expect(commands).toHaveLength(4);
    for (const command of commands) {
      expect(command).toContain("--exclude '**/*contracts*.test.ts'");
      expect(command).toContain("--exclude '**/website-links.test.ts'");
    }
  });
});

// The client size is only measurable once `website check` built the dists, and every client input feeds that item.
describe('the client size is checked per PR', () => {
  const ci = read('.github/workflows/ci.yml');

  it('checks the committed client size right after the website smoke builds the dists', () => {
    const step = ci.slice(ci.indexOf('- name: Website serves-a-page smoke')).split('\n      - ')[0];
    expect(step).toMatch(/pnpm miondevx website check\n\s+pnpm miondevx website client-size --check$/);
  });

  it('re-runs the check on a change to anything the size reads', () => {
    for (const input of [
      'packages/rpc-client/src/client.ts',
      'pnpm-lock.yaml',
      'container/website/app/data/client-size.json',
      'scripts/website/gen-client-size.mjs',
    ]) {
      expect(itemFeeds(LANES.smoke, 'website', input), input).toBe(true);
    }
  });
});

describe('the converted-suites refusal count runs per PR', () => {
  const ci = read('.github/workflows/ci.yml');

  it('runs the count in go-checks under the go-tools lane', () => {
    expect(jobOf(ci, 'go-checks')).toMatch(
      /if: fromJSON\(env\.MION_LANES\)\['go-tools'\]\.run\n\s+run: \$MION_WATCH go-tools -- pnpm miondevx core converted-suites --refusals-only\n/
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
    // website, bench, pre-publish-build, go-build, go-checks, go-suite, js-fuzz-sweep, js-fuzz-timeboxed, js-static,
    // js-suite, js-serial, smoke, decide.
    expect(checked).toBe(13);
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
