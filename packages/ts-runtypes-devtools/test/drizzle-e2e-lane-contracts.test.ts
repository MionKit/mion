// Contract tests for the drizzle-e2e lanes.
//
// The lane list lives in THREE places that cannot import each other — the run
// script inside the container, the release front door on the host, and the CI
// matrix — so a new lane is easy to half-add: it runs locally and never runs in
// CI, or CI asks for an image nothing builds. These pin the three to each other.
//
// The typecheck-normalization test is a REGRESSION, not a precaution. The lane
// compares tsc over the translated tree against tsc over the control, and the
// two trees live at different paths, so every error is normalized by stripping
// each tree's root. The container passed only the ABSOLUTE roots while tsc,
// which runs from the install one level up, prints file paths RELATIVE to it.
// Nothing noticed until a suite landed that has type errors of its own
// (drizzle's durable-objects worker): all three then read as both ADDED and
// REMOVED, and the lane failed while the two trees were in fact identical.
import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {diffTypeErrors, errorLines} from '../../../container/drizzle-e2e/shared/baseline.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** The lane keys of a `const NAME = {...}` / `const NAME = [...]` declaration. */
function laneKeys(source: string, declaration: string): string[] {
  const at = source.indexOf(declaration);
  expect(at, `${declaration} not found`).toBeGreaterThan(-1);
  const body = source.slice(at, source.indexOf('\n};', at) + 3);
  return [...body.matchAll(/^\s{2}([a-z0-9]+):\s*\{/gm)].map((match) => match[1]);
}

describe('drizzle-e2e lane wiring', () => {
  const runSuite = read('container/drizzle-e2e/shared/run-suite.mjs');
  const frontDoor = read('scripts/release/drizzle-e2e.mjs');
  const workflow = read('.github/workflows/drizzle-e2e.yml');

  const lanes = laneKeys(runSuite, 'const DIALECTS = {');

  it('every lane the container knows is offered by the release script and by CI', () => {
    expect(lanes).toContain('durable'); // the shape most likely to be dropped: not a dialect

    const offered = /const DIALECTS = \[([^\]]*)\]/.exec(frontDoor)?.[1] ?? '';
    const fromFrontDoor = [...offered.matchAll(/'([a-z0-9]+)'/g)].map((match) => match[1]);
    expect(fromFrontDoor.sort()).toEqual([...lanes].sort());

    const matrix = /dialect: \[([^\]]*)\]/.exec(workflow)?.[1] ?? '';
    const fromCi = matrix.split(',').map((name) => name.trim());
    expect(fromCi.sort()).toEqual([...lanes].sort());
  });

  it('every lane resolves to an image the container script can build', () => {
    const images = /const DRIZZLE_DIALECTS = \[([^\]]*)\]/.exec(read('scripts/container/image.mjs'))?.[1] ?? '';
    const buildable = [...images.matchAll(/'([a-z0-9]+)'/g)].map((match) => match[1]);
    const overrides = /const IMAGE_FOR = \{([^}]*)\}/.exec(frontDoor)?.[1] ?? '';
    const mapped = Object.fromEntries([...overrides.matchAll(/(\w+):\s*'([a-z0-9]+)'/g)].map((m) => [m[1], m[2]]));
    for (const lane of lanes) expect(buildable, `lane ${lane}`).toContain(mapped[lane] ?? lane);
  });

  it('a lane that claims no manifest coverage says why', () => {
    // The waiver is meant to be an explicit, printed reason, never a silent skip.
    const at = runSuite.indexOf('const DIALECTS = {');
    const body = runSuite.slice(at, runSuite.indexOf('\n};', at));
    for (const block of body.split(/^\s{2}(?=[a-z0-9]+:\s*\{)/m).slice(1)) {
      if (block.includes('manifests:')) continue;
      expect(block, 'a lane with no manifests must carry a coverageWaiver').toContain('coverageWaiver:');
    }
  });
});

describe('drizzle-e2e typecheck normalization', () => {
  // The exact shape that broke it: tsc names the file relative to its cwd, and
  // names a second path ABSOLUTELY inside the message body.
  const control = [
    "control/tests/sqlite/durable-objects/index.ts(48,24): error TS7016: Could not find a declaration file for module './drizzle/migrations'. '/drizzle-e2e/control/tests/sqlite/durable-objects/drizzle/migrations.js' implicitly has an 'any' type.",
    "control/tests/sqlite/durable-objects/index.ts(197,44): error TS2304: Cannot find name 'Env'.",
  ];
  const translated = [
    "work/tests/sqlite/durable-objects/index.ts(10,24): error TS7016: Could not find a declaration file for module './drizzle/migrations'. '/drizzle-e2e/work/tests/sqlite/durable-objects/drizzle/migrations.js' implicitly has an 'any' type.",
    "work/tests/sqlite/durable-objects/index.ts(174,44): error TS2304: Cannot find name 'Env'.",
  ];
  const HOME = '/drizzle-e2e';
  const tree = `${HOME}/work`;
  const CONTROL = `${HOME}/control`;

  it('sees two identical trees as identical', () => {
    const roots = [`${tree}/`, `${CONTROL}/`, `${path.relative(HOME, tree)}/`, `${path.relative(HOME, CONTROL)}/`];
    const {added, removed} = diffTypeErrors({translated, control, roots});
    expect({added, removed}).toEqual({added: [], removed: []});
  });

  it('stripping only the absolute roots is what made them look different', () => {
    const {added, removed} = diffTypeErrors({translated, control, roots: [`${tree}/`, `${CONTROL}/`]});
    expect(added.length).toBe(2);
    expect(removed.length).toBe(2);
  });

  it('still reports a REAL difference', () => {
    const roots = [`${tree}/`, `${CONTROL}/`, `${path.relative(HOME, tree)}/`, `${path.relative(HOME, CONTROL)}/`];
    const extra = [
      ...translated,
      "work/tests/sqlite/sqlite-common.ts(9,1): error TS2322: Type 'string' is not assignable to type 'number'.",
    ];
    const {added, removed} = diffTypeErrors({translated: extra, control, roots});
    expect(added).toHaveLength(1);
    expect(added[0]).toContain('TS2322');
    expect(removed).toEqual([]);
  });

  it('the container lane builds exactly those roots', () => {
    const runSuite = read('container/drizzle-e2e/shared/run-suite.mjs');
    expect(runSuite).toContain('path.relative(HOME, tree)');
    expect(runSuite).toContain('path.relative(HOME, CONTROL)');
  });
});
