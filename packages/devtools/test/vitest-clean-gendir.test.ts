// The shared vitest teardown (scripts/lib/vitest-clean-gendir.ts) every project
// (and the root config) uses to remove `__runtypes` genDirs after a run. Two
// behaviors are worth pinning: it must find genDirs NESTED under the root (the
// per-package cleanup it replaced, mion' test/support/global-cleanup.ts,
// resolved one directory short and silently deleted nothing for its whole life),
// and it must NEVER reach into build outputs — `.dist/**/__runtypes` is shipped
// bundled output, not a leftover.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import type {TestProject} from 'vitest/node';
import cleanRunTypesGenDirs from '../../../scripts/lib/vitest-clean-gendir.ts';

const tempDirs: string[] = [];

function makeTempProjectRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-clean-gendir-'));
  tempDirs.push(dir);
  return dir;
}

function seed(root: string, relative: string): string {
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'marker.js'), 'export const x = 1;\n');
  return dir;
}

function asProject(root: string): TestProject {
  return {config: {root}} as TestProject;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true});
});

describe('vitest-clean-gendir teardown', () => {
  it('removes root-level, nested and per-target genDirs, leaving other files alone', async () => {
    const root = makeTempProjectRoot();
    const topLevel = seed(root, '__runtypes/types');
    const nested = seed(root, 'test-fixtures/ok/__runtypes');
    const perTarget = seed(root, '__runtypes-edge');
    fs.writeFileSync(path.join(root, 'keep.txt'), 'stays\n');

    const teardown = cleanRunTypesGenDirs(asProject(root));
    expect(fs.existsSync(topLevel)).toBe(true); // setup phase deletes nothing
    await teardown();

    expect(fs.existsSync(path.join(root, '__runtypes'))).toBe(false);
    expect(fs.existsSync(nested)).toBe(false);
    expect(fs.existsSync(perTarget)).toBe(false);
    expect(fs.existsSync(path.join(root, 'keep.txt'))).toBe(true);
  });

  it('never reaches into build outputs or dependency trees', async () => {
    const root = makeTempProjectRoot();
    const shippedEsm = seed(root, '.dist/esm/__runtypes/types');
    const shippedBuild = seed(root, 'build/__runtypes');
    const dependency = seed(root, 'node_modules/some-pkg/__runtypes');

    await cleanRunTypesGenDirs(asProject(root))();

    expect(fs.existsSync(shippedEsm)).toBe(true);
    expect(fs.existsSync(shippedBuild)).toBe(true);
    expect(fs.existsSync(dependency)).toBe(true);
  });

  it('is a no-op when nothing was generated', async () => {
    const root = makeTempProjectRoot();
    await expect(cleanRunTypesGenDirs(asProject(root))()).resolves.toBeUndefined();
    expect(fs.existsSync(root)).toBe(true);
  });
});
