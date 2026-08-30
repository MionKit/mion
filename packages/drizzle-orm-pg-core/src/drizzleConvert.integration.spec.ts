/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// CLI-level round trip of the drizzle convert arm: the REAL `ts-runtypes
// convert` binary over a REAL temp project whose node_modules symlinks this
// package's own install (so the dialect packages resolve through the same
// source condition a consumer build uses). Pins the pair spelling both ways
// and the canonical type-form fixpoint; random corpus rides the Go sweep
// (TestFuzz_DrizzleRoundTrip) and the reflected-graph equality rides
// drizzleTypeSource.integration.spec.ts.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {BIN, hasBinary} from '../../ts-runtypes-devtools/test/helpers/inline.ts';

const register = hasBinary() ? describe : describe.skip;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "customConditions": ["source"], "rootDir": "src", "strict": true
  },
  "include": ["src"]
}
`;

const BUILDERS_SOURCE =
  "import * as DB from '@mionjs/drizzle-orm-pg-core';\n" +
  "export const users = DB.pgTable('users', {\n" +
  "  id: DB.uuid('id').primaryKey().defaultRandom(),\n" +
  "  name: DB.varchar('name', {length: 100}).notNull(),\n" +
  "  age: DB.integer('age').notNull().default(21),\n" +
  '});\n' +
  'export type UsersTable = typeof users;\n';

let projectDir = '';
let mainPath = '';

function convertTo(source: string, target: 'type' | 'builders'): string {
  fs.writeFileSync(mainPath, source);
  const result = spawnSync(
    BIN,
    ['convert', '--tsconfig', path.join(projectDir, 'tsconfig.json'), '--to', target, path.join(projectDir, 'src')],
    {
      encoding: 'utf8',
      cwd: projectDir,
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  expect(result.status, `convert --to ${target} stderr:\n${result.stderr}\n--- input ---\n${source}`).toBe(0);
  return fs.readFileSync(mainPath, 'utf8');
}

register('drizzle convert CLI round trip', () => {
  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-drizzle-convert-'));
    fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), TSCONFIG);
    fs.mkdirSync(path.join(projectDir, 'src'));
    // A consumer-shaped node_modules: the three workspace packages linked in
    // by name (the source export condition then resolves their real src).
    const packages: Array<[string, string]> = [
      ['@mionjs/drizzle-orm-pg-core', path.resolve(__dirname, '..')],
      ['@mionjs/drizzle-orm', path.resolve(__dirname, '../../drizzle-orm')],
      ['@ts-runtypes/core', path.resolve(__dirname, '../../ts-runtypes')],
    ];
    for (const [name, target] of packages) {
      const linkPath = path.join(projectDir, 'node_modules', name);
      fs.mkdirSync(path.dirname(linkPath), {recursive: true});
      fs.symlinkSync(target, linkPath, 'junction');
    }
    mainPath = path.join(projectDir, 'src', 'main.ts');
  });
  afterAll(() => {
    fs.rmSync(projectDir, {recursive: true, force: true});
  });

  it('runtime-callback modifiers ride options.runtime through the round trip', () => {
    const runtimeSource =
      "import * as DB from '@mionjs/drizzle-orm-pg-core';\n" +
      "export const jobs = DB.pgTable('jobs', {\n" +
      "  id: DB.uuid('id').primaryKey(),\n" +
      "  slug: DB.varchar('slug', {length: 80}).notNull().$defaultFn(() => 'slug-1'),\n" +
      '});\n' +
      'export type JobsTable = typeof jobs;\n';
    const typeForm = convertTo(runtimeSource, 'type');
    expect(typeForm).toContain("  slug: DB.Varchar<'slug', {length: 80; notNull: true; $defaultFn: true}>;");
    expect(typeForm).toContain(
      "export const jobs = DB.tableFromType<JobsTable>({runtime: {slug: {$defaultFn: () => 'slug-1'}}});"
    );
    const buildersForm = convertTo(typeForm, 'builders');
    expect(buildersForm).toContain(".notNull().$defaultFn(() => 'slug-1'),");
    expect(convertTo(buildersForm, 'type')).toBe(typeForm);
  });

  it('builders → type emits the canonical pair, and back, landing on a byte fixpoint', () => {
    const typeForm = convertTo(BUILDERS_SOURCE, 'type');
    expect(typeForm).toContain("export type UsersTable = DB.PgTable<'users', {");
    expect(typeForm).toContain("  name: DB.Varchar<'name', {length: 100; notNull: true}>;");
    // The marker form: no repeated type name, no getRunType call.
    expect(typeForm).toContain('export const users = DB.tableFromType<UsersTable>();');
    expect(typeForm).not.toContain('getRunType');
    const buildersForm = convertTo(typeForm, 'builders');
    expect(buildersForm).toContain("export const users = DB.pgTable('users', {");
    expect(buildersForm).toContain('export type UsersTable = typeof users;');
    const typeAgain = convertTo(buildersForm, 'type');
    expect(typeAgain).toBe(typeForm);
    expect(convertTo(typeForm, 'type')).toBe(typeForm);
  });
});
