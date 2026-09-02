// Contract tests for the per-platform resolver binary build.
//
// `release binaries` stages the @mionjs/binary-<os>-<arch> packages and the
// launcher that names them. Two workflows call it with opposite needs: the release
// gate must build ALL seven (it publishes them and exec-tests the Linux side-arches
// under QEMU), while the drizzle-e2e lanes install the packed set on the very
// platform that built it, so there `--host-only` skips six cross-builds that cost
// ~18 minutes and are never installed. These pin each workflow to its form, the
// flag to the CLI table that renders the help, and the guard that keeps a
// host-only set out of a release.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
// Plain ESM dev scripts, no types: one directive per import line, so the formatter
// can never wrap the import away from the line the error lands on.
// @ts-expect-error untyped .mjs
import {PLATFORMS, platformKey} from '../../../scripts/lib/binary-platforms.mjs';
// @ts-expect-error untyped .mjs
import {hostPlatform, missingPlatformTarballs, selectPlatforms} from '../../../scripts/lib/binary-platforms.mjs';
// @ts-expect-error untyped .mjs
import {lookup} from '../../../scripts/lib/devx-registry.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

type Platform = {os: string; cpu: string; goos: string; goarch: string; goarm?: string};
const platforms = PLATFORMS as Platform[];
const keyOf = platformKey as (platform: Platform) => string;

/** Every `run:` line of a workflow that invokes `release binaries`, trimmed. */
function binariesSteps(workflow: string): string[] {
  return [...workflow.matchAll(/^\s+run:\s*(pnpm miondevx release binaries[^\n]*)$/gm)].map((match) => match[1].trim());
}

describe('release binaries — which platforms each workflow builds', () => {
  it('the drizzle-e2e build job builds the host platform only', () => {
    expect(binariesSteps(read('.github/workflows/drizzle-e2e.yml'))).toEqual(['pnpm miondevx release binaries --host-only']);
  });

  it('the release gate still builds every platform', () => {
    expect(binariesSteps(read('.github/workflows/release-gate.yml'))).toEqual(['pnpm miondevx release binaries']);
  });

  it('the flag is on the CLI table, so `release --help` shows it', () => {
    const row = lookup('release', 'binaries') as {flags?: [string, string][]};
    expect(row.flags?.map(([spec]) => spec)).toContain('--host-only');
  });

  it('build-binaries.mjs reads the flag and the shared platform list', () => {
    const script = read('scripts/release/build-binaries.mjs');
    expect(script).toContain("'--host-only'");
    expect(script).toContain("from '../lib/binary-platforms.mjs'");
    expect(script).not.toMatch(/^const PLATFORMS = \[/m);
  });
});

describe('binary platform selection', () => {
  it('seven publish platforms, each with a unique os-cpu key', () => {
    expect(platforms).toHaveLength(7);
    expect(new Set(platforms.map(keyOf)).size).toBe(7);
    expect(platforms.map(keyOf)).toContain('linux-x64'); // the one the drizzle-e2e lanes install
  });

  it('without the flag every platform is built', () => {
    expect(selectPlatforms({})).toEqual(platforms);
    expect(selectPlatforms({hostOnly: false})).toEqual(platforms);
  });

  it('--host-only builds exactly the host platform', () => {
    expect(selectPlatforms({hostOnly: true, os: 'linux', cpu: 'x64'}).map(keyOf)).toEqual(['linux-x64']);
    expect(selectPlatforms({hostOnly: true, os: 'darwin', cpu: 'arm64'}).map(keyOf)).toEqual(['darwin-arm64']);
  });

  it('--host-only on a platform that is not published fails instead of staging nothing', () => {
    expect(() => hostPlatform({os: 'freebsd', cpu: 'x64'})).toThrow(/freebsd-x64 is not a publish platform/);
  });

  it('this test host is a publish platform (the workflows run the flag on ubuntu)', () => {
    expect(platforms.map(keyOf)).toContain(keyOf(hostPlatform()));
  });
});

describe('the publish guard against a host-only set', () => {
  const version = '0.12.2';
  const full = platforms.map((platform) => `mionjs-binary-${keyOf(platform)}-${version}.tgz`);

  it('a full set is accepted', () => {
    expect(missingPlatformTarballs([...full, `mionjs-bin-${version}.tgz`])).toEqual([]);
  });

  it('a host-only set names the six platforms that are missing', () => {
    const hostOnly = [`mionjs-binary-linux-x64-${version}.tgz`, `mionjs-bin-${version}.tgz`];
    expect(missingPlatformTarballs(hostOnly)).toEqual(platforms.map(keyOf).filter((key) => key !== 'linux-x64'));
  });

  it('publish-tarballs.mjs refuses to stage such a set to the public registry', () => {
    const script = read('scripts/release/publish-tarballs.mjs');
    expect(script).toContain("from '../lib/binary-platforms.mjs'");
    expect(script).toMatch(/const missing = staged \? missingPlatformTarballs\(packed\) : \[\];/);
    expect(script).toContain('refusing to publish — tarballs/ has no @mionjs/binary package for');
  });
});
