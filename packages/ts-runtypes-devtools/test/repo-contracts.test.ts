// Repo-level packaging + env contracts. Both guard hand-maintained mirrors that
// nothing else in CI checks, and both drifted in the past:
//
//   - Published-package READMEs: `files` entries that match nothing are silently
//     ignored by npm, so a package can list "README.md" and publish a blank npm
//     page. @ts-runtypes/core did exactly that.
//   - .env registry mirror: scripts/README.md documents `pnpm run check:env` as
//     enforcing the REGISTRY -> .env.sample mirror. These tests pin the check's
//     drift detection so the documented contract stays real.

import {describe, it, expect} from 'vitest';
import {readFileSync, existsSync} from 'node:fs';
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
