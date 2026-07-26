// Repo-level packaging + env + docs-pipeline contracts. Each guards a
// hand-maintained mirror that nothing else in CI checks, and each drifted in the
// past:
//
//   - Published-package READMEs: `files` entries that match nothing are silently
//     ignored by npm, so a package can list "README.md" and publish a blank npm
//     page. @ts-runtypes/core did exactly that.
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
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
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

  it('rejects an unknown flag, which also used to fall through', () => {
    const {status, stderr} = rtx(['release', '--oops']);
    expect(status).toBe(2);
    expect(stderr).toContain("unknown release flag '--oops'");
  });

  it('still plans the umbrella for the bare invocation (--dry-run)', () => {
    const {status, stdout} = rtx(['release', '--dry-run']);
    expect(status).toBe(0);
    expect(stdout).toContain('preflight.mjs');
    expect(stdout).toContain('publish.mjs');
  });

  it('keeps `rtx --help` and `rtx release --help` in sync (one source)', () => {
    expect(rtx(['--help']).stdout).toContain(rtx(['release', '--help']).stdout.trim());
  });
});
