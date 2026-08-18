// Contract tests for the fuzz SOAK lanes.
//
// A lane only soaks if its name is spelled correctly in four unrelated places:
// the `FUZZ` registry in scripts/rt.mjs (which owns the budget), the matrix in
// release-gate.yml (the release round), and both the `lane` input options and
// the `pick` step in fuzz-soak.yml (the on-demand round). Nothing in CI compares
// them, and the failure is silent in the worst direction: a lane missing from a
// matrix simply never soaks, and a lane named in a matrix but absent from the
// registry fails only when someone finally runs a release.
//
// Both halves have already happened here. A dead `jsonschema` lane sat in the
// gate's matrix after the suite was removed and broke the first round of the
// v0.12.0 release, and `roundtrip` / `size` / `nondata` had registered soak env
// vars with no registry entry to set them, so those budgets were unreachable for
// months (docs/done/drain-fuzz-soak-backlog.md).

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

const rtx = read('scripts/rt.mjs');
const releaseGate = read('.github/workflows/release-gate.yml');
const fuzzSoak = read('.github/workflows/fuzz-soak.yml');

// The registry entries carrying a `soak` key — the lanes that HAVE a soak budget,
// which is what a soak matrix is allowed to name. Sliced to the FUZZ literal so
// the CODEGEN registry below it cannot leak in.
const registrySoakLanes = ((): string[] => {
  const start = rtx.indexOf('const FUZZ = {');
  const block = rtx.slice(start, rtx.indexOf('\n};', start));
  const lanes = [...block.matchAll(/^ {2}(\w+): \{(.*)$/gm)].filter(([, , body]) => /\bsoak:/.test(body)).map(([, lane]) => lane);
  return lanes.sort();
})();

// A workflow matrix written as a YAML block sequence under `lane:`.
const yamlLaneBlock = (source: string, after: string): string[] => {
  const at = source.indexOf(after);
  const rest = source.slice(at + after.length);
  const lines = rest.split('\n').slice(1);
  const lanes: string[] = [];
  for (const line of lines) {
    const item = /^\s*- ([a-z0-9]+)\s*$/.exec(line);
    if (!item) break;
    lanes.push(item[1]);
  }
  return lanes.sort();
};

const gateLanes = yamlLaneBlock(releaseGate, '\n        lane:');
const dispatchOptions = yamlLaneBlock(fuzzSoak, '\n        options:').filter((lane) => lane !== 'all');
const pickLanes = ((): string[] => {
  const json = /lanes='(\[[^']*\])'/.exec(fuzzSoak);
  if (!json) throw new Error('fuzz-soak.yml: the pick step no longer assigns a JSON lane list');
  return (JSON.parse(json[1]) as string[]).sort();
})();

describe('every lane list agrees with the rtx FUZZ registry', () => {
  it('the registry actually yields soak lanes', () => {
    // Guards the parser itself: a rewritten registry that stops matching would
    // otherwise make every comparison below trivially pass on empty lists.
    expect(registrySoakLanes.length).toBeGreaterThan(5);
    expect(registrySoakLanes).toContain('convert');
  });

  it('release-gate.yml soaks exactly the lanes that have a budget', () => {
    expect(gateLanes).toEqual(registrySoakLanes);
  });

  it('fuzz-soak.yml runs exactly the same lanes on `all`', () => {
    expect(pickLanes).toEqual(registrySoakLanes);
  });

  it('fuzz-soak.yml offers exactly those lanes as dispatch choices', () => {
    expect(dispatchOptions).toEqual(registrySoakLanes);
  });

  it('fuzz-soak.yml offers `all` as the default choice', () => {
    expect(yamlLaneBlock(fuzzSoak, '\n        options:')).toContain('all');
    expect(fuzzSoak).toMatch(/type: choice\n\s*default: all/);
  });
});

describe('a soak run can always be replayed', () => {
  // A finding whose seed was never printed costs a bisect instead of a re-run,
  // so both workflows must set the seed AND echo the command that replays it.
  for (const [name, source] of [
    ['release-gate.yml', releaseGate],
    ['fuzz-soak.yml', fuzzSoak],
  ] as const) {
    it(`${name} sets RT_FUZZ_SEED and echoes the replay command`, () => {
      expect(source).toContain('RT_FUZZ_SEED:');
      expect(source).toContain('replay this run: RT_FUZZ_SEED=$RT_FUZZ_SEED pnpm rtx core fuzz');
    });
  }

  it('fuzz-soak.yml falls back to the run id so an unattended round is fresh', () => {
    expect(fuzzSoak).toContain('RT_FUZZ_SEED: ${{ inputs.seed || github.run_id }}');
  });
});
