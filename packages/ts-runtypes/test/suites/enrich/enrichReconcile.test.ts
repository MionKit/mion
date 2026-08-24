// Reconcile lane of the AI-enrichment suite: drives `gen --update` / `gen
// --prune` over throwaway temp projects on disk and asserts the full reconcile
// behaviour — property merge preserves authored values, renames carry values
// under the new key, dropped fields become @rtOrphanChild carcasses, a re-run is
// a byte-identical no-op, and --prune strips the carcasses. Each family owns its
// own mirror subtree (<genDir>/enriched/friendly/ vs mock/), so assertions are
// per-family. The Go binary MUST be rebuilt before this runs (the suite spawns
// bin/ts-runtypes).

import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect, afterAll} from 'vitest';
import {
  makeFixture,
  setSource,
  editMirror,
  readMirror,
  readMirrors,
  runGen,
  runPrune,
  cleanupReconcileLane,
} from '../../util/enrichReconcile.ts';

afterAll(cleanupReconcileLane);

const BIN_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../bin/ts-runtypes');

describe('enrichment reconcile — gen --update', () => {
  it('property merge preserves other fields when a field type changes', () => {
    const fixture = makeFixture('merge-keep', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    // Author values into friendlyUser + mockUser (each in its own family file).
    editMirror(fixture, 'friendly', (text) => text.replace("name: {rt$label: '',", "name: {rt$label: 'Full name',"));
    editMirror(fixture, 'mock', (text) => text.replace('name: {pool: []}', "name: {pool: ['Alice', 'Bob']}"));
    // Change age's type (string), add a field; the structural id changes.
    setSource(fixture, 'export interface User { name: string; age: string; isActive: boolean }\n');
    runGen(fixture, 'User', ['--update']);

    const friendly = readMirror(fixture, 'friendly');
    const mock = readMirror(fixture, 'mock');
    expect(friendly, 'authored friendly value preserved').toContain("name: {rt$label: 'Full name',");
    expect(mock, 'authored mock pool preserved').toContain("name: {pool: ['Alice', 'Bob']}");
    expect(friendly, 'new field added in friendly').toContain("isActive: {rt$label: '', rt$errors: {type: ''}}");
    expect(mock, 'new field added in mock').toContain('isActive: {pool: []}');
    expect(friendly, 'friendly file holds no mock const').not.toContain('mockUser');
    expect(mock, 'mock file holds no friendly const').not.toContain('friendlyUser');
  });

  it('is a byte-identical no-op on an unchanged re-run', () => {
    const fixture = makeFixture('idempotent', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    editMirror(fixture, 'friendly', (text) => text.replace("name: {rt$label: '',", "name: {rt$label: 'Full name',"));
    runGen(fixture, 'User', ['--update']);
    const first = readMirrors(fixture);
    runGen(fixture, 'User', ['--update']);
    const second = readMirrors(fixture);
    expect(second, 'second --update must be byte-identical').toBe(first);
  });

  it('carries an authored value under a renamed field (Tier-2 primitive)', () => {
    const fixture = makeFixture('rename-primitive', 'export interface User { fullName: string }\n');
    runGen(fixture, 'User');
    editMirror(fixture, 'friendly', (text) => text.replace("fullName: {rt$label: '',", "fullName: {rt$label: 'Full name',"));
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);

    const out = readMirror(fixture, 'friendly');
    expect(out, 'value carried under new key').toContain("name: {rt$label: 'Full name',");
    expect(out, 'old key gone').not.toContain('fullName');
    expect(out, 'rename must not orphan').not.toContain('@rtOrphanChild');
  });

  it('carries a named-type reference under a renamed field (Tier-1)', () => {
    const fixture = makeFixture(
      'rename-named',
      'export interface Address { street: string }\nexport interface User { home: Address }\n'
    );
    runGen(fixture, 'User');
    setSource(fixture, 'export interface Address { street: string }\nexport interface User { residence: Address }\n');
    runGen(fixture, 'User', ['--update']);

    const out = readMirror(fixture, 'friendly');
    expect(out, 'reference carried under new key').toContain('residence: friendlyAddress');
    expect(out, 'old key gone').not.toContain('home:');
    expect(out, 'rename must not orphan').not.toContain('@rtOrphanChild');
  });

  it('comments out a removed field as @rtOrphanChild, preserving its value', () => {
    const fixture = makeFixture('orphan-child', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    editMirror(fixture, 'friendly', (text) => text.replace("age: {rt$label: '',", "age: {rt$label: 'Age in years',"));
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);

    const out = readMirror(fixture, 'friendly');
    expect(out, 'dropped field carcass present').toContain('@rtOrphanChild');
    expect(out, 'dropped value preserved').toContain("age: {rt$label: 'Age in years',");
  });
});

describe('enrichment reconcile — family split', () => {
  it('gen writes one mirror file per family, each importing only its own DSL type', () => {
    const fixture = makeFixture('family-split', 'export interface User { name: string }\n');
    runGen(fixture, 'User');

    const friendly = readMirror(fixture, 'friendly');
    const mock = readMirror(fixture, 'mock');
    expect(friendly).toContain('export const friendlyUser: FriendlyText<User>');
    expect(friendly).toContain("import type { FriendlyText } from '@ts-runtypes/core'");
    expect(friendly).not.toContain('MockData');
    expect(mock).toContain('export const mockUser: MockData<User>');
    expect(mock).toContain("import type { MockData } from '@ts-runtypes/core'");
    expect(mock).not.toContain('FriendlyText');
  });

  it('migrates a pre-split combined mirror in place, carrying authored values (idempotently)', () => {
    const fixture = makeFixture('family-migrate', 'export interface User { name: string }\n');
    // Hand-write a LEGACY combined mirror at the old (no-family) path.
    const legacyPath = resolve(fixture.enrichDir, 'models.ts');
    mkdirSync(dirname(legacyPath), {recursive: true});
    writeFileSync(
      legacyPath,
      "import type { User } from '../../models';\n" +
        "import type { FriendlyText, MockData } from '@ts-runtypes/core';\n\n" +
        'export const friendlyUser: FriendlyText<User> = {\n' +
        "  rt$label: 'The user',\n" +
        "  rt$errors: {type: ''},\n" +
        "  name: {rt$label: 'Full name', rt$errors: {type: ''}},\n" +
        '};\n\n' +
        'export const mockUser: MockData<User> = {\n' +
        "  name: {pool: ['Alice']},\n" +
        '};\n'
    );

    runGen(fixture, 'User', ['--update']);

    expect(existsSync(legacyPath), 'legacy combined file deleted').toBe(false);
    const friendly = readMirror(fixture, 'friendly');
    const mock = readMirror(fixture, 'mock');
    expect(friendly, 'authored friendly label carried').toContain("rt$label: 'Full name'");
    expect(mock, 'authored mock pool carried').toContain("pool: ['Alice']");
    expect(friendly, 'breadcrumb recomputed one level deeper').toContain("from '../../../models'");

    // A second --update over the migrated state is a byte-identical no-op.
    const first = readMirrors(fixture);
    runGen(fixture, 'User', ['--update']);
    expect(readMirrors(fixture), 'post-migration re-run is byte-identical').toBe(first);
  });
});

describe('enrichment reconcile — @todo lifecycle', () => {
  // The new-const flag is a PLAIN `@todo` line comment, deliberately OUTSIDE the
  // `@rt` namespace (which is reserved for compiler-owned machinery). The compiler
  // only emits it; the user/LLM fills the data and deletes the line.

  it('stamps exactly one plain @todo on each newly-generated const', () => {
    const fixture = makeFixture('todo-fresh', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    const friendly = readMirror(fixture, 'friendly');
    const mock = readMirror(fixture, 'mock');
    // friendlyUser and mockUser each carry exactly one @todo line, in their own file.
    expect(friendly.match(/@todo/g)?.length, 'one @todo on the friendly const').toBe(1);
    expect(mock.match(/@todo/g)?.length, 'one @todo on the mock const').toBe(1);
    // It is a PLAIN @todo, never the @rt-namespaced @rtTodo.
    expect(friendly, 'the flag is a plain @todo, not @rtTodo').not.toContain('@rtTodo');
    // It sits on its OWN `//` line, after the @rtType marker, before the export.
    expect(friendly, '@todo follows the marker on a separate line').toMatch(
      /@rtType[^\n]*\*\/\n\/\/ @todo:[^\n]*\nexport const friendly/
    );
  });

  it('does not re-add @todo to an existing const on --update', () => {
    const fixture = makeFixture('todo-existing', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    // Add a field: existing consts are property-merged, never re-stamped.
    setSource(fixture, 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User', ['--update']);
    expect(readMirror(fixture, 'friendly').match(/@todo/g)?.length, 'no @todo added on update (friendly)').toBe(1);
    expect(readMirror(fixture, 'mock').match(/@todo/g)?.length, 'no @todo added on update (mock)').toBe(1);
  });

  it('keeps a user-cleared @todo cleared across --update', () => {
    const fixture = makeFixture('todo-cleared', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    // User fills in real data and deletes the @todo line from friendlyUser.
    editMirror(fixture, 'friendly', (text) => text.replace(/\/\/ @todo:[^\n]*\n(export const friendlyUser)/, '$1'));
    expect(readMirror(fixture, 'friendly').match(/@todo/g) ?? [], 'friendly @todo cleared').toHaveLength(0);
    // A reconcile must not regrow the cleared one.
    setSource(fixture, 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User', ['--update']);
    const friendly = readMirror(fixture, 'friendly');
    expect(friendly.match(/@todo/g) ?? [], 'cleared @todo stays cleared').toHaveLength(0);
    expect(friendly, 'friendlyUser stays @todo-free').toMatch(/\*\/\nexport const friendlyUser/);
    expect(readMirror(fixture, 'mock').match(/@todo/g)?.length, 'mockUser keeps its own @todo').toBe(1);
  });

  it('stamps @todo on a const newly ADDED during --update', () => {
    const fixture = makeFixture('todo-added', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    // Introduce a referenced named type → new friendlyAddress/mockAddress consts.
    setSource(fixture, 'export interface Address { street: string }\nexport interface User { name: string; home: Address }\n');
    runGen(fixture, 'User', ['--update']);
    const friendly = readMirror(fixture, 'friendly');
    // One original + one new = two @todo per family; the new Address const is stamped.
    expect(friendly.match(/@todo/g)?.length, 'new friendly const gets a @todo').toBe(2);
    expect(readMirror(fixture, 'mock').match(/@todo/g)?.length, 'new mock const gets a @todo').toBe(2);
    expect(friendly, 'new friendlyAddress carries @todo').toMatch(/\/\/ @todo:[^\n]*\nexport const friendlyAddress/);
  });

  it('--prune leaves @todo intact', () => {
    const fixture = makeFixture('todo-prune', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    // Create an @rtOrphanChild carcass so prune has something to strip.
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);
    expect(readMirror(fixture, 'friendly')).toContain('@rtOrphanChild');

    const before = readMirrors(fixture).match(/@todo/g)?.length ?? 0;
    expect(before, 'precondition: @todo present').toBeGreaterThan(0);
    runPrune(fixture);
    const out = readMirrors(fixture);
    expect(out, '@rtOrphan carcasses gone').not.toContain('@rtOrphan');
    expect(out.match(/@todo/g)?.length, '@todo untouched by prune').toBe(before);
  });

  it('is a byte-identical no-op re-run with @todo present (no duplication)', () => {
    const fixture = makeFixture('todo-idempotent', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    runGen(fixture, 'User', ['--update']);
    const first = readMirrors(fixture);
    runGen(fixture, 'User', ['--update']);
    const second = readMirrors(fixture);
    expect(second, 'update re-run is byte-identical').toBe(first);
    expect(second.match(/@todo/g)?.length, 'no @todo duplication on re-run').toBe(2);
  });
});

describe('enrichment reconcile — gen --prune', () => {
  it('strips @rtOrphanChild carcasses in BOTH family files, leaving live fields', () => {
    const fixture = makeFixture('prune', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    editMirror(fixture, 'friendly', (text) => text.replace("age: {rt$label: ''}", "age: {rt$label: 'Age'}"));
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);
    expect(readMirror(fixture, 'friendly')).toContain('@rtOrphanChild');
    expect(readMirror(fixture, 'mock')).toContain('@rtOrphanChild');

    runPrune(fixture);
    const both = readMirrors(fixture);
    expect(both, 'orphan tags gone after prune (both families)').not.toContain('@rtOrphan');
    expect(both, 'live field survives').toContain('name:');
  });
});

describe('the rt$ reserved meta prefix', () => {
  // The rt$ prefix is RESERVED for enrichment meta keys (rt$label, rt$errors, …):
  // a source-type property named rt$… cannot be enriched, while a plain
  // $-prefixed property is an ordinary field (fixed by construction — before the
  // rt$ rename, a `$label` property produced a broken duplicate-key scaffold).

  it('a plain $label property is an ordinary field: scaffolded, addressable, idempotent', () => {
    const fixture = makeFixture('rc-dollar-field', 'export interface Weird { $label: string; $errors: number; name: string }\n');
    runGen(fixture, 'Weird');

    const friendly = readMirror(fixture, 'friendly');
    expect(friendly, 'meta keys carry the rt$ prefix').toContain('rt$label:');
    expect(friendly, 'the $label property is a normal child node').toMatch(/'?\$label'?: \{rt\$label: ''/);
    expect(friendly, 'the $errors property is a normal child node').toMatch(/'?\$errors'?: \{rt\$label: ''/);

    // The reconcile round-trips: an update over the untouched file is a no-op.
    runGen(fixture, 'Weird', ['--update']);
    expect(readMirror(fixture, 'friendly'), 'update is byte-identical').toBe(friendly);

    // And the field is value-preserving like any other.
    editMirror(fixture, 'friendly', (text) => text.replace(/'?\$label'?: \{rt\$label: ''/, "'$label': {rt$label: 'Dollar'"));
    runGen(fixture, 'Weird', ['--update']);
    expect(readMirror(fixture, 'friendly'), 'authored value on the $label field survives').toContain("rt$label: 'Dollar'");
  });

  it('gen refuses a type with an rt$-prefixed property, naming it', () => {
    const fixture = makeFixture('rc-reserved-prop', "export interface Bad { 'rt$label': string; name: string }\n");
    const result = spawnSync(BIN_PATH, ['enrich', 'src/models.ts', 'Bad'], {cwd: fixture.dir, encoding: 'utf8'});
    expect(result.status, 'gen must fail on a reserved-prefix property').not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toContain('reserved enrichment meta prefix');
    expect(existsSync(fixture.friendlyPath), 'no mirror file is written').toBe(false);
  });
});
