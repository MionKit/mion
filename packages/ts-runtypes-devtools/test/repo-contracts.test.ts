// Repo-level packaging + env + docs-pipeline contracts. Each guards a
// hand-maintained mirror that nothing else in CI checks, and each drifted in the
// past:
//
//   - Published-package READMEs: `files` entries that match nothing are silently
//     ignored by npm, so a package can list "README.md" and publish a blank npm
//     page. @mionjs/run-types did exactly that. They also have to stay thin: the
//     option tables and usage walkthroughs they had grown restated the docs site,
//     which is exactly how a public surface goes stale.
//   - .env registry mirror: scripts/README.md documents `pnpm run check:env` as
//     enforcing the REGISTRY -> .env.sample mirror. These tests pin the check's
//     drift detection so the documented contract stays real.
//   - Twoslash VFS package names: the docs site mounts each package's built .d.ts
//     at /node_modules/<npm name>/ so example imports resolve. The mount list kept
//     the PRE-SCOPE name (`ts-runtypes`) after the packages moved onto
//     @ts-runtypes/*, so every example import failed to resolve and the hover
//     endpoint threw. The failure is invisible from this repo's CI (the website is
//     containerized), which is exactly why it needs a contract test.

import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {readFileSync, existsSync, readdirSync, statSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join, posix} from 'node:path';
import {tmpdir} from 'node:os';
// @ts-expect-error — a plain .mjs script, no types
import {sampleKeys, sampleMirrorDrift} from '../../../scripts/env/check.mjs';
// @ts-expect-error — a plain .mjs script, no types
import {REGISTRY} from '../../../scripts/lib/env.mjs';

interface RegistryEntry {
  name: string;
  scope: 'secret' | 'dev' | 'internal';
  task: string;
  desc: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

// The three packages that actually go to npm. The per-platform
// @ts-runtypes/binary-* packages are assembled at publish time by
// scripts/release/build-binaries.mjs, so they have no source directory here.
const PUBLISHED_PACKAGE_DIRS = ['ts-runtypes', 'ts-runtypes-devtools', 'ts-runtypes-bin'];

// Headroom over the longest README today, so a wording tweak is free but a whole
// section coming back is not.
const THIN_README_MAX_LINES = 45;

describe('published packages ship a README', () => {
  for (const dir of PUBLISHED_PACKAGE_DIRS) {
    const packageDir = join(REPO_ROOT, 'packages', dir);
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));

    it(`${manifest.name} lists README.md in "files" and the file exists`, () => {
      expect(manifest.files).toContain('README.md');
      expect(existsSync(join(packageDir, 'README.md'))).toBe(true);
    });

    // A published README cannot use repo-relative links: npm renders it outside
    // the repo, so `../../README.md` and `docs/…` resolve to nothing. Only
    // absolute URLs and in-page anchors are safe.
    it(`${manifest.name} README links are absolute URLs`, () => {
      const readme = readFileSync(join(packageDir, 'README.md'), 'utf8');
      const targets = [...readme.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
      const relative = targets.filter((target) => !/^(https?:\/\/|#)/.test(target));
      expect(relative).toEqual([]);
    });

    // A published README is a shop window, not a manual: what the package is, how
    // it relates to its siblings, and where the real docs live. Anything that
    // restates the docs site (option tables, usage walkthroughs) drifts out of
    // sync, and anything internal (env vars, dev-only knobs) does not belong on a
    // public npm page at all. See the README rule in CLAUDE.md.
    it(`${manifest.name} README stays a description plus links`, () => {
      const readme = readFileSync(join(packageDir, 'README.md'), 'utf8');
      const lines = readme.split('\n');
      expect(lines.length).toBeLessThanOrEqual(THIN_README_MAX_LINES);
      // A separator row is what makes a markdown table a table.
      expect(lines.filter((line) => /^\s*\|\s*:?-{3,}/.test(line))).toEqual([]);
      expect(readme).not.toMatch(/\bRT_[A-Z0-9_]+\b|process\.env/);
      expect(readme).toContain('https://runtypes.pages.dev');
    });
  }
});

describe('.env.sample mirrors the env REGISTRY', () => {
  const sample = readFileSync(join(REPO_ROOT, '.env.sample'), 'utf8');

  it('has no drift today', () => {
    expect(sampleMirrorDrift(sample)).toEqual({missing: [], internal: [], unknown: []});
  });

  it('reads both live rows and commented-out knobs as declarations', () => {
    const keys = sampleKeys('GHCR_PAT=\n# RT_WEBSITE_PORT=3000\n# npm publish: reads it from here\n');
    expect([...keys].sort()).toEqual(['GHCR_PAT', 'RT_WEBSITE_PORT']);
  });

  it('flags a user-settable var that never reached .env.sample', () => {
    const registry = [{name: 'RT_NEW_KNOB', scope: 'dev', task: '-', desc: 'a knob nobody mirrored'}];
    expect(sampleMirrorDrift(sample, registry).missing).toEqual(['RT_NEW_KNOB']);
  });

  it('flags an internal var listed in .env.sample', () => {
    const registry = REGISTRY as RegistryEntry[];
    const internalName = registry.find((entry) => entry.scope === 'internal')!.name;
    const drifted = `${sample}\n# ${internalName}=/some/path\n`;
    expect(sampleMirrorDrift(drifted).internal).toEqual([internalName]);
  });

  it('flags a key in .env.sample that no registry row declares', () => {
    expect(sampleMirrorDrift(`${sample}\n# RT_GHOST_VAR=1\n`).unknown).toEqual(['RT_GHOST_VAR']);
  });
});

describe('twoslash VFS mounts the packages the examples import', () => {
  const TWOSLASH_API = join(REPO_ROOT, 'container/website/server/api/twoslash.post.ts');
  const EXAMPLES_SRC = join(REPO_ROOT, 'packages/examples/src');

  // Every `name:` in twoslash.post.ts's packageConfigs — the npm names it mounts
  // under /node_modules/<name>/ in the virtual file system.
  function mountedPackageNames(): Set<string> {
    const source = readFileSync(TWOSLASH_API, 'utf8');
    const configs = /const packageConfigs = \[(.*?)\]/s.exec(source);
    if (!configs) throw new Error('packageConfigs literal not found in twoslash.post.ts');
    return new Set([...configs[1].matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1]));
  }

  // The first-party package roots the docs examples actually import, e.g.
  // `@mionjs/run-types/formats` counts as the root `@mionjs/run-types`. Covers BOTH
  // scopes: one Nuxt install serves the runtypes site (@ts-runtypes/* examples) and
  // the mion site (@mionjs/* examples) from the same twoslash endpoint.
  function importedPackageRoots(): Set<string> {
    const roots = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts')) {
          const source = readFileSync(full, 'utf8');
          for (const match of source.matchAll(/from\s+'(@(?:ts-runtypes|mionjs)\/[^']+)'/g)) {
            const [scope, name] = match[1].split('/');
            roots.add(`${scope}/${name}`);
          }
        }
      }
    };
    walk(EXAMPLES_SRC);
    return roots;
  }

  it('mounts every first-party package the examples import', () => {
    const mounted = mountedPackageNames();
    const missing = [...importedPackageRoots()].filter((root) => !mounted.has(root)).sort();
    expect(missing).toEqual([]);
  });

  it('mounts them under their scoped npm names, not the pre-scope directory names', () => {
    for (const name of mountedPackageNames()) expect(name).toMatch(/^@(ts-runtypes|mionjs)\//);
  });
});

// The rtx release area is the only one whose no-subcommand default performs an
// IRREVERSIBLE action (preflight -> npm publish -> site build). It used to have
// no help case and no unknown-sub guard, so `pnpm rtx release --help` — the
// thing you type when you are least sure what a command does — started a
// release: it wiped node_modules, reinstalled, and ran the suites before
// anything could stop it. These pin the guards. Nothing in CI calls the bare
// umbrella (workflows always pass a subcommand), so the guards cost it nothing.
describe('rtx release — help and typos never reach the publish umbrella', () => {
  const rtx = (args: string[]): {status: number | null; stdout: string; stderr: string} => {
    const result = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/rt.mjs'), ...args], {encoding: 'utf8'});
    return {status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
  };

  it('`release --help` prints the release usage and runs nothing', () => {
    const {status, stdout} = rtx(['release', '--help']);
    expect(status).toBe(0);
    expect(stdout).toContain('rtx release e2e');
    // The umbrella's first step announces itself; its absence is the proof.
    expect(stdout).not.toContain('Fresh start');
    expect(stdout).not.toContain('preflight.mjs');
  });

  it('rejects a mistyped subcommand instead of running the umbrella', () => {
    const {status, stderr} = rtx(['release', 'pacK']);
    expect(status).toBe(2);
    expect(stderr).toContain("unknown release command 'pacK'");
  });

  it('bare `release` prints help and does NOT start the chain', () => {
    const {status, stdout} = rtx(['release']);
    expect(status).toBe(0);
    expect(stdout).toContain('rtx release all');
    expect(stdout).not.toContain('Fresh start');
  });

  it('the chain answers to `all`, with its flags intact', () => {
    const {status, stdout} = rtx(['release', 'all', '--dry-run']);
    expect(status).toBe(0);
    expect(stdout).toContain('preflight.mjs');
    expect(stdout).toContain('publish.mjs');
  });

  it('points the old bare-with-flags form at `release all`', () => {
    const {status, stderr} = rtx(['release', '--dry-run']);
    expect(status).toBe(2);
    expect(stderr).toContain('rtx release all --dry-run');
  });

  it('rejects an unknown flag on the chain itself', () => {
    const {status, stderr} = rtx(['release', 'all', '--oops']);
    expect(status).toBe(2);
    expect(stderr).toContain("unknown flag '--oops'");
  });

  it('keeps `rtx --help` and `rtx release --help` in sync (one source)', () => {
    expect(rtx(['--help']).stdout).toContain(rtx(['release', '--help']).stdout.trim());
  });
});

// RT_WEBSITE_CA_CERT is documented as "trust these certs in the image", but baking
// only helps an image we BUILD — the normal path pulls a prebuilt one from GHCR,
// which never saw this host's proxy CA. Its containers still reach the network at
// RUN time (verdaccio's uplink to npmjs), so the same certs must be mounted, as a
// FILE: NODE_EXTRA_CA_CERTS cannot take a directory.
describe('container CA plumbing — the run-time twin of the baked certs', () => {
  const caArgs = async (caSrc: string, dir: string): Promise<string[]> => {
    // @ts-expect-error — a plain .mjs script, no types
    const {caRunArgs} = await import('../../../scripts/container/image.mjs');
    return caRunArgs({caSrc, dir, mountOpts: ''}) as string[];
  };

  it('mounts a CA FILE and points Node at it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rt-ca-'));
    const cert = join(dir, 'proxy.crt');
    writeFileSync(cert, '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----\n');
    const args = await caArgs(cert, dir);
    expect(args).toContain('-v');
    expect(args.some((arg) => arg.startsWith(`${cert}:`) && arg.endsWith(':ro'))).toBe(true);
    const mount = args.find((arg) => arg.startsWith(`${cert}:`))!.split(':')[1];
    expect(args).toContain(`NODE_EXTRA_CA_CERTS=${mount}`);
  });

  it('concatenates a CA DIR into one bundle, since Node cannot take a dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rt-ca-'));
    const certsDir = join(dir, 'certs');
    mkdirSync(certsDir, {recursive: true});
    writeFileSync(join(certsDir, 'a.crt'), 'AAA\n');
    writeFileSync(join(certsDir, 'b.crt'), 'BBB\n');
    const args = await caArgs(certsDir, dir);
    const bundle = args[args.indexOf('-v') + 1].split(':')[0];
    expect(bundle.endsWith('.crt')).toBe(true);
    const written = readFileSync(bundle, 'utf8');
    expect(written).toContain('AAA');
    expect(written).toContain('BBB');
  });

  it('adds nothing when there is no CA to add', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rt-ca-'));
    expect(await caArgs(join(dir, 'missing.crt'), dir)).toEqual([]);
  });
});

// The serialization benchmark points the resolver at the MARKER package's own
// tsconfig, but the container mounts that package at
// <competitor>/node_modules/@mionjs/run-types — one path segment deeper than
// packages/ts-runtypes sits in the repo, because the scoped rename split the
// name in two. Its `extends` chain climbs OUT of the package (to the repo-root
// tsconfig), so that link lands on a container path holding nothing and the
// resolver dies with "tsconfig parse failed: Cannot read file
// …/node_modules/tsconfig.json" before scanning a single site. That is how the
// v0.11.0 website deploy failed. Same family as the twoslash mount-name drift
// above, and equally invisible from this repo's CI: the bench is containerized,
// so only a manual deploy run finds it.
describe('the serialization bench mounts the marker tsconfig chain', () => {
  const GEN_SERIALIZATION = join(REPO_ROOT, 'scripts/website/bench-data/gen-serialization.mjs');

  const bench = async (): Promise<{
    SERIALIZATION_TSCONFIG: string;
    serializationRunArgs: (cfg: {engine: string; image: string; mountOpts: string; runNetwork: string}, out: string) => string[];
    // @ts-expect-error — a plain .mjs script, no types
  }> => import('../../../scripts/website/bench-data/bench.mjs');

  // A tsconfig's `extends`, as a list (TS 5 allows an array). These configs are
  // JSONC, so strip comments and trailing commas before parsing. This lives here
  // and not in bench.mjs on purpose: the argv hard-codes the ONE mount the chain
  // needs today, and this is the independent check that the chain still ends
  // there. Production code stays a plain list of `-v` pairs.
  const tsconfigExtends = (file: string): string[] => {
    const text = readFileSync(file, 'utf8')
      .replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) => (match.startsWith('"') ? match : ''))
      .replace(/,(\s*[}\]])/g, '$1');
    const extended = JSON.parse(text).extends;
    if (!extended) return [];
    return Array.isArray(extended) ? extended : [extended];
  };

  const runArgs = async (): Promise<string[]> => {
    const {serializationRunArgs} = await bench();
    return serializationRunArgs({engine: 'podman', image: 'tsrt-website:dev', mountOpts: '', runNetwork: ''}, '/tmp/bench-out');
  };

  // The container filesystem the stage's own argv defines: container path -> host path.
  const containerFs = (args: string[]): Map<string, string> => {
    const mounts = new Map<string, string>();
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== '-v') continue;
      const [hostPath, containerPath] = args[i + 1].split(':');
      mounts.set(containerPath, hostPath);
    }
    return mounts;
  };

  // Longest-prefix translation back to the host — what a resolver running in the
  // container would actually find at `containerPath`.
  const toHost = (mounts: Map<string, string>, containerPath: string): string | undefined => {
    let best: string | undefined;
    for (const mount of mounts.keys()) {
      if (containerPath !== mount && !containerPath.startsWith(`${mount}/`)) continue;
      if (best === undefined || mount.length > best.length) best = mount;
    }
    return best === undefined ? undefined : join(mounts.get(best)!, containerPath.slice(best.length));
  };

  it('every link of the chain resolves to a real file inside the container', async () => {
    const {SERIALIZATION_TSCONFIG} = await bench();
    const args = await runArgs();
    const mounts = containerFs(args);
    // The plugin's cwd, taken from the argv rather than restated here.
    const packageRoot = args.find((arg) => arg.startsWith('RT_BENCH_PACKAGE_ROOT='))?.slice('RT_BENCH_PACKAGE_ROOT='.length);
    expect(packageRoot).toBeTruthy();

    const unresolved: string[] = [];
    const seen = new Set<string>();
    const walk = (containerPath: string): void => {
      if (seen.has(containerPath)) return;
      seen.add(containerPath);
      const hostPath = toHost(mounts, containerPath);
      if (hostPath === undefined || !existsSync(hostPath)) {
        unresolved.push(containerPath);
        return;
      }
      for (const target of tsconfigExtends(hostPath)) {
        if (!target.startsWith('.')) continue; // bare specifier: the container's own node_modules
        // Container paths are always posix, whatever OS the test runs on.
        walk(posix.resolve(posix.dirname(containerPath), target.endsWith('.json') ? target : `${target}.json`));
      }
    };
    walk(`${packageRoot}/${SERIALIZATION_TSCONFIG}`);

    expect(unresolved).toEqual([]);
    // The chain has to actually leave the package — otherwise this passes for the
    // wrong reason and stops guarding anything.
    expect([...seen].some((path) => !path.startsWith(`${packageRoot}/`))).toBe(true);
  });

  it('pins the tsconfig gen-serialization.mjs actually hands the plugin', async () => {
    const {SERIALIZATION_TSCONFIG} = await bench();
    const passed = [...readFileSync(GEN_SERIALIZATION, 'utf8').matchAll(/tsconfig:\s*'([^']+)'/g)].map((match) => match[1]);
    expect(passed).toEqual([SERIALIZATION_TSCONFIG]);
  });

  // The marker package's test program deliberately contains Error-severity types
  // (the alwaysThrow suites), and buildStart scans everything the tsconfig
  // includes — so the strict default refuses to boot the project and the bench
  // dies with "N unsupported-type errors — build halted" before measuring a
  // single case. Its vitest config opts out for exactly this reason; the bench
  // loads the same program through the same plugin and has to as well.
  it('opts out of failOnError, like the vitest config over the same program', () => {
    const call = /runtypesPlugin\(\{([^}]*)\}/.exec(readFileSync(GEN_SERIALIZATION, 'utf8'));
    expect(call).toBeTruthy();
    expect(call![1]).toMatch(/failOnError:\s*false/);
  });
});

// Nuxt Content orders pages by their numeric filename prefix, and it sorts them
// as TEXT: with single-digit prefixes a 10th entry lands second (1 < 10 < 2).
// That is how `10.linting.md` once rendered as the guide's second nav item —
// nothing errors, the diff looks fine, and only the rendered nav is wrong, so
// review cannot catch it. Two digits everywhere makes the trap unreachable, and
// the prefix is stripped from the URL, so padding costs no route changes.
describe('website-content-prefixes', () => {
  // Both sites, discovered rather than listed: one Nuxt install builds them from
  // container/website/sites/<site>/content, and a new site must not slip the check.
  const SITES_DIR = join(REPO_ROOT, 'container/website/sites');
  const CONTENT_DIRS = readdirSync(SITES_DIR)
    .map((site) => ({site, dir: join(SITES_DIR, site, 'content')}))
    .filter((entry) => existsSync(entry.dir));
  const PREFIXED = /^(\d+)\./;

  const entriesIn = (dir: string): string[] => readdirSync(dir);

  it('checks both sites', () => {
    expect(CONTENT_DIRS.length).toBe(2);
  });

  it('every numbered content entry uses a two-digit prefix', () => {
    const offenders: string[] = [];
    const visit = (dir: string, relative: string): void => {
      for (const name of entriesIn(dir)) {
        const prefix = PREFIXED.exec(name)?.[1];
        if (prefix !== undefined && prefix.length !== 2) offenders.push(posix.join(relative, name));
        if (statSync(join(dir, name)).isDirectory()) visit(join(dir, name), posix.join(relative, name));
      }
    };
    for (const {site, dir} of CONTENT_DIRS) visit(dir, site);
    expect(offenders).toEqual([]);
  });

  it('finds the numbered pages it claims to be checking', () => {
    for (const {dir} of CONTENT_DIRS) {
      const sections = entriesIn(dir).filter((name) => PREFIXED.test(name) && statSync(join(dir, name)).isDirectory());
      expect(sections.length).toBeGreaterThan(2);
      for (const section of sections) expect(entriesIn(join(dir, section)).some((name) => PREFIXED.test(name))).toBe(true);
    }
  });
});

// The homepage's test-count tiles are generated (scripts/website/gen-test-counts.mjs)
// because the hand-typed ones drifted by thousands of tests before anyone noticed.
// Nothing else checks the seam between the generated file, the component that reads
// it, and the content that names a count — and each end is in a different language.
describe('website-test-counts', () => {
  const COUNTS_FILE = join(REPO_ROOT, 'container/website/app/data/test-counts.json');
  const STAT_TILES = join(REPO_ROOT, 'container/website/app/components/content/StatTiles.vue');
  // The tiles live on the RUNTYPES home page; the mion home page has none.
  const HOME = join(REPO_ROOT, 'container/website/sites/runtypes/content/index.md');

  it('ships a committed count the component can import', () => {
    expect(existsSync(COUNTS_FILE)).toBe(true);
    const counts = JSON.parse(readFileSync(COUNTS_FILE, 'utf8'));
    // Sanity, not exactness: the numbers move on every PR. A zero or a missing
    // branch means the generator fell back to nothing and the tile would read "0".
    expect(counts.frontEnd.tests).toBeGreaterThan(1000);
    expect(counts.frontEnd.files).toBeGreaterThan(100);
    expect(counts.go.tests).toBeGreaterThan(100);
  });

  it('every `source` the homepage names is one the component can resolve', () => {
    const known = [...readFileSync(STAT_TILES, 'utf8').matchAll(/^\s{2}(\w+): testCounts\./gm)].map((match) => match[1]);
    expect(known.length).toBeGreaterThan(0);
    const used = [...readFileSync(HOME, 'utf8').matchAll(/^\s*-?\s*source: (\w+)$/gm)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((source) => !known.includes(source))).toEqual([]);
  });

  it('the test-count tiles carry no hand-typed number', () => {
    // Guards the regression this replaced: a literal `value:` next to the generated
    // tiles is a number nothing updates. The non-numeric tiles (the "∞" fuzzing one)
    // are still allowed to be literal.
    const tiles = /tiles:\n([\s\S]*?)\n---/.exec(readFileSync(HOME, 'utf8'))?.[1] ?? '';
    const numericLiterals = [...tiles.matchAll(/value: "([\d,]+)"/g)].map((match) => match[1]);
    expect(numericLiterals).toEqual([]);
  });
});

describe('tracked sources carry no raw NUL byte', () => {
  // A literal NUL makes git classify the file as BINARY: no line diffs, no auto-merge.
  // Two files carried one, and the rtUtils.ts one blocked a rebase.
  const SCANNED = ['*.ts', '*.tsx', '*.js', '*.mjs', '*.cjs', '*.go', '*.json', '*.md'];

  it('no tracked source file contains a literal NUL', () => {
    const listed = spawnSync('git', ['ls-files', '-z', '--', ...SCANNED], {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(listed.status).toBe(0);
    const files = listed.stdout
      .toString('utf8')
      .split('\u0000')
      .filter(Boolean)
      .filter((file) => !file.startsWith('ts-go-runtypes/third_party/') && !file.includes('/testdata/'));
    expect(files.length).toBeGreaterThan(500);

    const offenders = files.filter((file) => readFileSync(join(REPO_ROOT, file)).includes(0));
    expect(offenders).toEqual([]);
  });
});

// ── mion server benchmarks (container/mion-bench) ──────────────────────────────
//
// Three hand-maintained mirrors, none of which any other check covers, and each of
// which fails SILENTLY — as a missing table column or a page that renders "not
// generated yet" long after the deploy went green:
//
//   - apps registry <-> app sources <-> _deps manifests <-> Containerfile install
//     layers. The image is deps-only, so an app added to the registry without a
//     manifest AND a COPY+install layer has no node_modules and never runs.
//   - the docs pages name datasets (`bench="servers-<suite>"`) that only exist if
//     the driver runs that suite and the generator emits it.
//   - the chart div id BenchChart mounts is what check-static greps for.
describe('mion server benchmarks stay wired end to end', () => {
  const BENCH_DIR = join(REPO_ROOT, 'container/mion-bench');
  const CONTAINERFILE = readFileSync(join(BENCH_DIR, 'Containerfile'), 'utf8');
  const MION_CONTENT = join(REPO_ROOT, 'container/website/sites/mion/content');

  async function loadApps() {
    return (await import(join(BENCH_DIR, 'shared/apps.mjs'))) as {APPS: AppEntry[]};
  }
  interface AppEntry {
    name: string;
    dir: string;
    entry: string;
    runtime: string;
    family: string;
    versionOf: string;
  }

  it('every app has its source entry, its own _deps manifest and an image install layer', async () => {
    const {APPS} = await loadApps();
    expect(APPS.length).toBeGreaterThan(5);
    for (const app of APPS) {
      // The mion lanes share one project and are BUILT, so their entry is a dist
      // artifact that only exists after a run; the rest ship their entry as source.
      if (app.family !== 'mion') {
        expect(existsSync(join(BENCH_DIR, 'apps', app.dir, app.entry)), `${app.name}: missing apps/${app.dir}/${app.entry}`).toBe(
          true
        );
      }
      expect(
        existsSync(join(BENCH_DIR, '_deps', app.dir, 'package.json')),
        `${app.name}: missing _deps/${app.dir}/package.json`
      ).toBe(true);
      expect(CONTAINERFILE, `${app.name}: Containerfile has no install layer for _deps/${app.dir}`).toContain(
        `_deps/${app.dir}/package.json`
      );
    }
  });

  it('the harness project is baked too (it holds the load generator)', () => {
    expect(existsSync(join(BENCH_DIR, '_deps/harness/package.json'))).toBe(true);
    expect(CONTAINERFILE).toContain('_deps/harness/package.json');
    const manifest = JSON.parse(readFileSync(join(BENCH_DIR, '_deps/harness/package.json'), 'utf8'));
    expect(Object.keys(manifest.dependencies ?? {})).toContain('autocannon');
  });

  it('every dataset the mion pages ask for is one the generator emits', async () => {
    const {SUITE_KEYS} = (await import(join(BENCH_DIR, 'shared/suites.mjs'))) as {SUITE_KEYS: string[]};
    const generator = readFileSync(join(REPO_ROOT, 'scripts/website/bench-data/gen-servers-docs.mjs'), 'utf8');

    // What the content tree fetches, from both components that read a dataset.
    const referenced = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.md')) continue;
        const markdown = readFileSync(full, 'utf8');
        for (const match of markdown.matchAll(/:(?:bench-chart|server-bench-table)\{([^}]*)\}/g)) {
          const bench = /bench=['"]([^'"]+)['"]/.exec(match[1])?.[1];
          if (bench) referenced.add(bench);
        }
      }
    };
    walk(MION_CONTENT);
    expect(referenced.size).toBeGreaterThan(0);

    // Everything the runner can produce: the three suites plus the sweep.
    const emitted = new Set([...SUITE_KEYS, 'payload-sizes'].map((suite) => `servers-${suite}`));
    const unknown = [...referenced].filter((bench) => !emitted.has(bench)).sort();
    expect(unknown, 'the mion pages reference datasets no benchmark suite produces').toEqual([]);
    // And each of those suites has a label in the generator, or the page renders a
    // heading named after a raw key.
    for (const bench of referenced)
      expect(generator, `gen-servers-docs.mjs has no SUITE_META for ${bench}`).toContain(`'${bench.replace('servers-', '')}':`);
  });

  it('the chart div id BenchChart mounts is the one check-static greps for', () => {
    const component = readFileSync(join(REPO_ROOT, 'container/website/app/components/content/BenchChart.vue'), 'utf8');
    const gate = readFileSync(join(REPO_ROOT, 'scripts/website/check-static.mjs'), 'utf8');
    const idExpression = 'benchmark-chart-${props.bench}-${props.metric}';
    expect(component).toContain(idExpression);
    expect(gate).toContain('benchmark-chart-${chart.bench}-${chart.metric}');
  });

  // Both of these guard the payload sweep, where the 4 MB lanes run a p99 near
  // autocannon's own 10s default and every one of the three failed on TIMEOUTS with
  // zero non-2xx: the load generator gave up on requests the servers answered.
  it('the load generator waits longer than its own default before calling a request an error', () => {
    const harness = readFileSync(join(BENCH_DIR, 'harness/run.mjs'), 'utf8');
    expect(harness, 'run.mjs never passes a timeout to autocannon, so its 10s default applies').toMatch(/timeout:\s*TIMEOUT/);
    const fallback = /MION_BENCH_TIMEOUT \|\| (\d+)/.exec(harness);
    expect(fallback, 'MION_BENCH_TIMEOUT has no numeric default in run.mjs').not.toBeNull();
    // Above autocannon's 10s default, or the 4 MB lanes fail on the clock again.
    expect(Number(fallback![1])).toBeGreaterThan(10);
  });

  it('the sweep caps bytes in flight, so only the biggest payload drops connections', async () => {
    const harness = readFileSync(join(BENCH_DIR, 'harness/run.mjs'), 'utf8');
    const {SWEEP_SIZES} = (await import(join(BENCH_DIR, 'shared/payloads.mjs'))) as {SWEEP_SIZES: {key: string; bytes: number}[]};
    const connections = Number(/MION_BENCH_CONNECTIONS \|\| (\d+)/.exec(harness)![1]);
    const budget = Number(
      /MION_BENCH_INFLIGHT_BUDGET \|\| ([\d *]+)\)/
        .exec(harness)![1]
        .split('*')
        .reduce((a, b) => a * Number(b), 1)
    );
    const forSize = (bytes: number) => Math.max(1, Math.min(connections, Math.floor(budget / bytes)));

    // 100 connections x 4 MB was ~400 MB in flight: a few sockets died with `write
    // EPIPE` and p99 hit 9-12s, while req/s matched a quarter of the concurrency.
    const biggest = [...SWEEP_SIZES].sort((a, b) => b.bytes - a.bytes)[0];
    expect(forSize(biggest.bytes), `${biggest.key} should run below the full connection count`).toBeLessThan(connections);
    // Every smaller size is unaffected, so their published numbers do not move.
    for (const size of SWEEP_SIZES.filter((entry) => entry.key !== biggest.key))
      expect(forSize(size.bytes), `${size.key} should keep the full connection count`).toBe(connections);
  });

  it('each sweep section carries its own run metadata', () => {
    // The dataset-level "autocannon -c N" line comes from the FIRST section, so once
    // concurrency varies by size it would misdescribe every other one.
    const generator = readFileSync(join(REPO_ROOT, 'scripts/website/bench-data/gen-servers-docs.mjs'), 'utf8');
    const table = readFileSync(join(REPO_ROOT, 'container/website/app/components/content/ServerBenchTable.vue'), 'utf8');
    expect(generator, 'gen-servers-docs no longer emits per-section meta').toMatch(/meta:\s*metaFrom\(results\)/);
    expect(table, "ServerBenchTable ignores a section's own meta").toMatch(/section\?\.meta/);
  });

  it('one --quick shortens BOTH benchmark families, not just the runtypes half', () => {
    // The two drivers own separate arg spaces and separate knobs, so the flag has to
    // be handed across explicitly. Without it `rtx bench --website --quick` ran the
    // mion half at full 20s windows while claiming to be quick.
    const driver = readFileSync(join(REPO_ROOT, 'scripts/website/bench-data/bench.mjs'), 'utf8');
    const mion = readFileSync(join(REPO_ROOT, 'scripts/website/bench-data/mion-bench.mjs'), 'utf8');
    expect(driver, "website-bench hands the mion family a bare 'website' with no quick flag").toMatch(
      /mionBenchMain\(\['website',[^)]*RT_BENCH_QUICK[^)]*\]\)/
    );
    // And the receiving end still understands the flag it is handed.
    expect(mion, 'mion-bench.mjs no longer parses --quick').toContain("'--quick'");
    expect(mion, 'mion-bench.mjs no longer reads MION_BENCH_QUICK').toContain('MION_BENCH_QUICK');
  });

  it('a lane that fails its own quality gate leaves no record for the site to publish', () => {
    const harness = readFileSync(join(BENCH_DIR, 'harness/run.mjs'), 'utf8');
    const gate = harness.indexOf('during the measured run');
    const write = harness.indexOf('writeFileSync(recordFile');
    expect(gate, 'the non-2xx/errors gate is gone from run.mjs').toBeGreaterThan(-1);
    expect(write, 'run.mjs no longer writes the record through recordFile').toBeGreaterThan(-1);
    // Writing BEFORE the gate is what let a timed-out lane's degraded numbers reach
    // gen-servers-docs, with only the driver's exit code holding them back.
    expect(write, 'the record is written before the gate runs, so a failed lane still publishes').toBeGreaterThan(gate);
    // And a record an earlier good run left behind must go, or it is published as fresh.
    expect(harness, 'a failing lane does not remove a stale record').toMatch(/rmSync\(recordFile/);
  });

  it('the mion benchmark pages carry no hand-written numbers', () => {
    // The whole point of the migration: a results table in markdown is a number that
    // cannot be regenerated, and the previous one claimed mion 0.6.2 for years.
    for (const file of readdirSync(join(MION_CONTENT, '08.benchmarks'))) {
      if (!file.endsWith('.md')) continue;
      const markdown = readFileSync(join(MION_CONTENT, '08.benchmarks', file), 'utf8');
      expect(markdown, `${file}: has a markdown table of results - use :server-bench-table instead`).not.toMatch(
        /\|\s*Req \(R\/s\)/
      );
      expect(markdown, `${file}: names a machine in prose - the run metadata comes from the dataset`).not.toMatch(/__Machine:__/);
    }
  });
});
