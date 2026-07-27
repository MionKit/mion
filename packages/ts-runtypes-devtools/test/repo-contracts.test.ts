// Repo-level packaging + env + docs-pipeline contracts. Each guards a
// hand-maintained mirror that nothing else in CI checks, and each drifted in the
// past:
//
//   - Published-package READMEs: `files` entries that match nothing are silently
//     ignored by npm, so a package can list "README.md" and publish a blank npm
//     page. @ts-runtypes/core did exactly that. They also have to stay thin: the
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
  // `@ts-runtypes/core/formats` counts as the root `@ts-runtypes/core`.
  function importedPackageRoots(): Set<string> {
    const roots = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts')) {
          const source = readFileSync(full, 'utf8');
          for (const match of source.matchAll(/from\s+'(@ts-runtypes\/[^']+)'/g)) {
            const [scope, name] = match[1].split('/');
            roots.add(`${scope}/${name}`);
          }
        }
      }
    };
    walk(EXAMPLES_SRC);
    return roots;
  }

  it('mounts every @ts-runtypes package the examples import', () => {
    const mounted = mountedPackageNames();
    const missing = [...importedPackageRoots()].filter((root) => !mounted.has(root)).sort();
    expect(missing).toEqual([]);
  });

  it('mounts them under their scoped npm names, not the pre-scope directory names', () => {
    for (const name of mountedPackageNames()) expect(name.startsWith('@ts-runtypes/')).toBe(true);
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
// <competitor>/node_modules/@ts-runtypes/core — one path segment deeper than
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
