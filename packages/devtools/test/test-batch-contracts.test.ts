// Contract tests for the `test:ci` batches.
//
// `pnpm run test:ci` is the OOM fallback CLAUDE.md points contributors at, and its
// batch list used to be typed by hand into package.json with nothing tying it to
// vitest.config.ts. It drifted: it named the 16 mion projects and none of the 5
// runtypes ones, so it returned green having run 88 of the 397 test files. The 309
// it skipped were every runtypes test, including the ones that drive the Go
// resolver through the plugin.
//
// The batches now live in scripts/core/test-batches.mjs and only GROUP the names
// vitest.config.ts declares. These tests pin the pieces that keep it that way: the
// real grouping covers the real config, each drift shape is actually detected, and
// both `test:ci` and the CI gate still route through the script.

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
// @ts-expect-error — a plain .mjs repo script, no types.
import {BATCHES, batchDrift, projectConfigPaths, projectName, readProjectNames} from '../../../scripts/core/test-batches.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

type Drift = {missing: string[]; unknown: string[]; duplicate: string[]};
type Batch = {name: string; projects: string[]};
const batches = BATCHES as Batch[];
const drift = (projects: string[], groups: Batch[] = batches): Drift => batchDrift(projects, groups) as Drift;

describe('the batches cover every vitest project', () => {
  it('has no drift against the real vitest.config.ts', () => {
    expect(drift(readProjectNames() as string[])).toEqual({missing: [], unknown: [], duplicate: []});
  });

  it('runs every project the root config declares', () => {
    const declared = projectConfigPaths(read('vitest.config.ts')) as string[];
    const batched = batches.flatMap((batch) => batch.projects);
    // The count is the part that rotted: 16 batched against 21 declared.
    expect(batched).toHaveLength(declared.length);
    // The five that were missing, named so a reader sees which coverage this buys.
    expect(batched).toEqual(
      expect.arrayContaining(['runtypes', 'devtools-core', 'playground', '@ts-runtypes/go-be-sidecar', 'mock-format-isolation'])
    );
  });

  it('addresses projects by a name each project config actually declares', () => {
    for (const path of projectConfigPaths(read('vitest.config.ts')) as string[]) {
      expect(projectName(read(path)), `${path} declares no vitest project name`).toBeTruthy();
    }
  });
});

describe('the drift gate catches a batch list going stale', () => {
  // THE regression: a project added to vitest.config.ts and to no batch. Silent
  // before, and the reason test:ci proved nothing about half the repo.
  it('fails when a new project is added to the config but to no batch', () => {
    const withNewProject = [...(readProjectNames() as string[]), 'brand-new-project'];
    expect(drift(withNewProject).missing).toEqual(['brand-new-project']);
  });

  it('fails when a batch names a project the config does not define', () => {
    expect(drift(['runtypes'], [{name: 'one', projects: ['runtypes', 'ghost']}]).unknown).toEqual(['ghost']);
  });

  it('fails when two batches name the same project', () => {
    const twice = [
      {name: 'one', projects: ['runtypes']},
      {name: 'two', projects: ['runtypes']},
    ];
    expect(drift(['runtypes'], twice).duplicate).toEqual(['runtypes']);
  });

  it('passes only on an exact cover', () => {
    expect(drift(['a', 'b'], [{name: 'one', projects: ['b', 'a']}])).toEqual({missing: [], unknown: [], duplicate: []});
  });
});

describe('the wiring still points at the batch script', () => {
  const packageJson = JSON.parse(read('package.json')) as {scripts: Record<string, string>};

  it('test:ci runs the batch script rather than a hand-written vitest line', () => {
    expect(packageJson.scripts['test:ci']).toBe('node scripts/rt.mjs core test-batches');
    expect(packageJson.scripts['check:test-batches']).toBe('node scripts/rt.mjs core test-batches --check');
  });

  it('ci.yml runs the drift gate', () => {
    expect(read('.github/workflows/ci.yml')).toContain('pnpm run check:test-batches');
  });

  it('rtx dispatches core test-batches', () => {
    expect(read('scripts/rt.mjs')).toContain("if (sub === 'test-batches')");
  });
});
