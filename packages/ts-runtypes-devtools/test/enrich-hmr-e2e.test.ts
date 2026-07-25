// End-to-end HMR dev-loop test for the enrich-mirror reconciler (Layer 2).
//
// The reconcile is the `ts-runtypes gen --update` op a dev-loop save handler
// invokes on every source change. This test SIMULATES that loop against the
// real binary on a real temp project: it writes a real source `.ts`, runs the
// real reconcile, and repeats over a sequence of consecutive edits — the
// half-typed terrain a save-on-keystroke loop actually produces.
//
// It pins the two properties that matter for the dev loop:
//   1. ONE-DIRECTIONAL — updates flow types -> generated file ONLY. The reconcile
//      writes the mirror and NEVER touches the source.
//   2. NO GARBAGE AFTER CONSECUTIVE CHANGES — after a run of edits the mirror
//      CONVERGES: a further reconcile with no source change is a byte-identical
//      no-op (the file stabilises, it does not churn or accrete), authored data
//      is never lost (it stays live or rides a prunable @rtOrphan carcass), and
//      every reconcile leaves a parseable mirror (a successful exit proves the
//      reconcile re-parsed it).
//
// One source file mirrors into TWO generated files, one per enrichment family:
// <genDir>/enriched/friendly/<rel>.ts (friendly consts) and <genDir>/enriched/mock/<rel>.ts
// (mock consts); whole-output oracles (convergence, orphan absence) read both.
//
// Where Layer 1 (internal/enrichment/mirror property test) drives Reconcile with a
// SYNTHETIC desired set, this layer exercises the REAL compiler -> reconcile ->
// disk pipeline end to end, so the structural ids, closure grouping and atomic
// write are all the production ones.
import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BIN, hasBinary} from './helpers/inline.ts';

type FieldType = 'string' | 'number' | 'boolean';
interface Field {
  key: string;
  type: FieldType;
}

interface Project {
  dir: string;
  src: string;
  genDir: string;
  friendlyMirror: string;
  mockMirror: string;
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {strict: true, module: 'esnext', target: 'esnext', moduleResolution: 'bundler'},
  include: ['src'],
});

function renderSource(fields: Field[], typeName = 'User'): string {
  const body = fields.map((field) => `  ${field.key}: ${field.type};`).join('\n');
  return `export interface ${typeName} {\n${body}\n}\n`;
}

function setupProject(fields: Field[], typeName = 'User'): Project {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-hmr-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  const src = path.join(dir, 'src', 'models.ts');
  fs.writeFileSync(src, renderSource(fields, typeName));
  const genDir = path.join(dir, 'generated');
  // Split mirror layout: one generated file per enrichment family under <genDir>/enriched/<family>/<rel>.
  return {
    dir,
    src,
    genDir,
    friendlyMirror: path.join(genDir, 'enriched', 'friendly', 'src', 'models.ts'),
    mockMirror: path.join(genDir, 'enriched', 'mock', 'src', 'models.ts'),
  };
}

// readMirrors concatenates both family mirrors, for whole-output oracles
// (convergence, orphan absence) that must cover every file the reconcile owns.
function readMirrors(project: Project): string {
  return fs.readFileSync(project.friendlyMirror, 'utf8') + fs.readFileSync(project.mockMirror, 'utf8');
}

// genUpdate runs the real reconcile (the op a dev-loop save handler fires).
// cwd is the fixture root: the CLI discovers the tsconfig exactly as tsc does
// (upward from the working directory), like a user running it from the project.
function genUpdate(project: Project, typeName = 'User'): {status: number; output: string} {
  const result = spawnSync(BIN, ['enrich', project.src, typeName, '--update', '--gen-dir', project.genDir], {
    cwd: path.dirname(project.src),
    encoding: 'utf8',
  });
  return {status: result.status ?? -1, output: (result.stdout ?? '') + (result.stderr ?? '')};
}

// writeSource models one keystroke-burst save: it writes the new source and
// returns the exact bytes written, so the caller can assert the reconcile left
// the source untouched (the one-directional invariant).
function writeSource(project: Project, fields: Field[], typeName = 'User'): string {
  const text = renderSource(fields, typeName);
  fs.writeFileSync(project.src, text);
  return text;
}

// mulberry32: a tiny seeded PRNG so a failing random sequence is reproducible.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// runRandomSequence drives one seeded run of `steps` consecutive edits, asserting
// the invariants after every edit and convergence at the end.
function runRandomSequence(seed: number, steps: number): void {
  const rng = mulberry32(seed);
  let counter = 0;
  const freshKey = (): string => `f${seed}_${counter++}`;
  const types: readonly FieldType[] = ['string', 'number', 'boolean'];
  const randType = (): FieldType => types[Math.floor(rng() * types.length)];

  const fields: Field[] = [
    {key: freshKey(), type: 'string'},
    {key: freshKey(), type: 'number'},
  ];
  const project = setupProject(fields);
  try {
    expect(genUpdate(project).status, `seed ${seed}: seed reconcile`).toBe(0);
    // The scaffold writes one mirror per family.
    expect(fs.existsSync(project.friendlyMirror), `seed ${seed}: friendly mirror missing`).toBe(true);
    expect(fs.existsSync(project.mockMirror), `seed ${seed}: mock mirror missing`).toBe(true);

    // The user authors a value: set the friendly root rt$label (always-live node
    // meta, so it must survive every edit) to a unique sentinel.
    const sentinel = `AUTH_${seed}`;
    let friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
    expect(friendly, `seed ${seed}: unexpected seed mirror shape`).toContain("rt$label: ''");
    fs.writeFileSync(project.friendlyMirror, friendly.replace("rt$label: ''", `rt$label: '${sentinel}'`));

    for (let step = 0; step < steps; step++) {
      const choice = Math.floor(rng() * 4);
      if (choice === 0) {
        fields[Math.floor(rng() * fields.length)].key = freshKey(); // rename a field
      } else if (choice === 1) {
        fields.push({key: freshKey(), type: randType()}); // add a field
      } else if (choice === 2 && fields.length > 1) {
        fields.splice(Math.floor(rng() * fields.length), 1); // delete a field
      } else {
        const i = Math.floor(rng() * fields.length); // change a field's type
        let next = fields[i].type;
        while (next === fields[i].type) next = randType();
        fields[i].type = next;
      }

      const written = writeSource(project, fields);
      const result = genUpdate(project);
      expect(result.status, `seed ${seed} step ${step}: reconcile failed\n${result.output}`).toBe(0);

      // One-directional: the reconcile never writes the source.
      expect(fs.readFileSync(project.src, 'utf8'), `seed ${seed} step ${step}: source was modified`).toBe(written);
      // No data loss: the authored value is still somewhere in the friendly mirror.
      friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
      expect(friendly, `seed ${seed} step ${step}: authored value lost`).toContain(sentinel);
    }

    // Convergence: a further reconcile with no source change is a byte-identical
    // no-op across BOTH mirrors — the files have stabilised, no garbage churn.
    const before = readMirrors(project);
    expect(genUpdate(project).status, `seed ${seed}: convergence reconcile`).toBe(0);
    expect(readMirrors(project), `seed ${seed}: not converged`).toBe(before);
  } finally {
    fs.rmSync(project.dir, {recursive: true, force: true});
  }
}

const describeIfBinary = hasBinary() ? describe : describe.skip;

describeIfBinary('enrich-mirror HMR dev loop (E2E)', () => {
  it('updates flow types -> mirror only, converge, and preserve authored data', () => {
    const project = setupProject([
      {key: 'name', type: 'string'},
      {key: 'age', type: 'number'},
    ]);
    try {
      expect(genUpdate(project).status, 'seed reconcile').toBe(0);
      // The scaffold writes one mirror per family.
      expect(fs.existsSync(project.friendlyMirror), 'friendly mirror missing').toBe(true);
      expect(fs.existsSync(project.mockMirror), 'mock mirror missing').toBe(true);

      // Author the friendly root label AND a field label.
      let friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
      friendly = friendly.replace("rt$label: ''", "rt$label: 'AUTH_ROOT'");
      friendly = friendly.replace("name: {rt$label: ''", "name: {rt$label: 'AUTH_NAME'");
      fs.writeFileSync(project.friendlyMirror, friendly);
      expect(friendly).toContain('AUTH_ROOT');
      expect(friendly).toContain('AUTH_NAME');

      // A run of consecutive edits: rename a field, add a field, change a type.
      const sequence: Field[][] = [
        [
          {key: 'name', type: 'string'},
          {key: 'years', type: 'number'},
        ],
        [
          {key: 'name', type: 'string'},
          {key: 'years', type: 'number'},
          {key: 'email', type: 'string'},
        ],
        [
          {key: 'name', type: 'number'},
          {key: 'years', type: 'number'},
          {key: 'email', type: 'string'},
        ],
      ];
      for (const fields of sequence) {
        const written = writeSource(project, fields);
        expect(genUpdate(project).status).toBe(0);
        expect(fs.readFileSync(project.src, 'utf8'), 'source must be untouched by the reconcile').toBe(written);
        friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
        expect(friendly, 'authored root label lost').toContain('AUTH_ROOT');
        expect(friendly, 'authored field value lost').toContain('AUTH_NAME');
      }

      // Convergence: an extra reconcile with no source change is a no-op on both mirrors.
      const before = readMirrors(project);
      expect(genUpdate(project).status).toBe(0);
      expect(readMirrors(project), 'mirrors must converge (no churn)').toBe(before);
    } finally {
      fs.rmSync(project.dir, {recursive: true, force: true});
    }
  }, 60_000);

  it('produces no garbage after many consecutive random edits (seeded, reproducible)', () => {
    for (const seed of [1, 2]) {
      runRandomSequence(seed, 8);
    }
  }, 120_000);

  it('a field rename typed one keystroke at a time carries the value with no orphan trail', () => {
    // The reconciler tracks a field by its TYPE identity (@rtIds child id), not
    // its name, so renaming a field through its half-typed intermediate states
    // (one reconcile per keystroke) must carry the authored value the whole way
    // and NEVER leave a carcass behind — no "two entries" for one rename. `age`
    // is a number distractor so the string-field rename is always unambiguous.
    const project = setupProject([
      {key: 'title', type: 'string'},
      {key: 'age', type: 'number'},
    ]);
    try {
      expect(genUpdate(project).status).toBe(0);
      let friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
      fs.writeFileSync(project.friendlyMirror, friendly.replace("title: {rt$label: ''", "title: {rt$label: 'AUTH_TITLE'"));

      // Type `title` -> `heading`, one character per save, reconciling each time.
      const keystrokes = ['titl', 'tit', 'ti', 't', 'th', 'the', 'thea', 'head', 'headi', 'headin', 'heading'];
      for (const key of keystrokes) {
        writeSource(project, [
          {key, type: 'string'},
          {key: 'age', type: 'number'},
        ]);
        expect(genUpdate(project).status, `keystroke '${key}': reconcile failed`).toBe(0);
        // The carcass check covers BOTH family mirrors; the carried value lives in the friendly one.
        expect(readMirrors(project), `keystroke '${key}': an in-place rename must not leave an @rtOrphan carcass`).not.toContain(
          '@rtOrphan'
        );
        friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
        expect(
          friendly.split('AUTH_TITLE').length - 1,
          `keystroke '${key}': the authored value must be carried exactly once (no empty twin)`
        ).toBe(1);
      }

      // The value ends up on the renamed field; the old name is gone from both mirrors.
      friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
      expect(friendly).toContain("heading: {rt$label: 'AUTH_TITLE'");
      expect(readMirrors(project)).not.toContain('title:');
    } finally {
      fs.rmSync(project.dir, {recursive: true, force: true});
    }
  }, 60_000);

  it('renaming the whole interface carries the tree and renames in place (no orphan)', () => {
    // A whole-type rename keeps the structural id (shape unchanged), so the
    // reconciler carries the ENTIRE tree and just rewrites the name (var,
    // annotation, marker, breadcrumb) — no big orphan tree, no empty twin, no
    // crash. `age` of a different type is along for the ride.
    const fields: Field[] = [
      {key: 'firstName', type: 'string'},
      {key: 'lastName', type: 'string'},
      {key: 'age', type: 'number'},
    ];
    const project = setupProject(fields, 'User');
    try {
      expect(genUpdate(project, 'User').status).toBe(0);

      // Author a value on the User friendly mirror.
      let friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
      fs.writeFileSync(project.friendlyMirror, friendly.replace("firstName: {rt$label: ''", "firstName: {rt$label: 'AUTH_FN'"));

      // Rename the interface User -> Account (same fields) and reconcile.
      writeSource(project, fields, 'Account');
      expect(genUpdate(project, 'Account').status, 'a whole-type rename must not crash').toBe(0);

      friendly = fs.readFileSync(project.friendlyMirror, 'utf8');
      expect(friendly, 'var renamed').toContain('export const friendlyAccount');
      expect(friendly, 'annotation renamed').toContain('FriendlyText<Account>');
      expect(friendly, 'authored value carried live').toContain('AUTH_FN');
      expect(friendly, 'old const fully gone').not.toContain('friendlyUser');
      // Mock-side parity: the mock mirror renames in place the same way.
      const mock = fs.readFileSync(project.mockMirror, 'utf8');
      expect(mock, 'mock var renamed').toContain('export const mockAccount');
      expect(mock, 'mock annotation renamed').toContain('MockData<Account>');
      expect(mock, 'old mock const fully gone').not.toContain('mockUser');
      expect(readMirrors(project), 'no orphan tree for a rename').not.toContain('@rtOrphan');

      // Converged: a further reconcile is a byte-identical no-op on both mirrors.
      const before = readMirrors(project);
      expect(genUpdate(project, 'Account').status).toBe(0);
      expect(readMirrors(project), 'must converge after rename').toBe(before);
    } finally {
      fs.rmSync(project.dir, {recursive: true, force: true});
    }
  }, 60_000);
});
