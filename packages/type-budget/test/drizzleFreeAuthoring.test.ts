// The optional-peer promise, pinned at the compiler level: the slim authoring
// surface (tables, models, refinement — everything except the ./drizzle
// subpath) must TYPE-CHECK in a program where drizzle-orm does not resolve at
// all. The host below hides every path containing a drizzle-orm segment, the
// way a project that never installed the optional peer looks, and the snippet
// declares a table, refines it and derives models. Any drizzle type reaching
// the authoring surface turns into a module-resolution error here.

import {describe, it, expect} from 'vitest';
import * as ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {makeHost, RESOLVING_OPTIONS} from './modelPipelineHarness.ts';

const CASE_FILE = fileURLToPath(new URL('./__drizzleFreeCase__.ts', import.meta.url));

const SOURCE = `
import {pgTable, varchar, integer, timestamp, index, pgView, pgPolicy, pgRole} from '@mionjs/drizzle-orm-pg-core';
import {refineTableType, sql} from '@mionjs/drizzle-orm';
import type {InferSelectModel, InferSelectViewModel, InferInsertModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import type {Varchar, Integer, PgTable} from '@mionjs/drizzle-orm-pg-core';

const users = pgTable('users', {
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
}, (t) => [index('users_name_idx').on(t.name), ]);
const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
type User = InferSelectModel<typeof apiUsers>;
type NewUser = InferInsertModel<typeof apiUsers>;
type UserPatch = InferUpdateModel<typeof apiUsers>;
export const templateUsable = sql\`now()\`;
export const newUser: NewUser = {name: 'a-long-name', age: 21};
export const patch: UserPatch = {age: 30};
declare const row: User;
export const rowName: string = row.name;
// Views, policies and roles stand alone too: a view's row model is exactly the
// kind of type the slim surface exists to carry into a drizzle-free app.
const activeUsers = pgView('active_users', {
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
}).as(sql\`select name, age from users\`);
export type ActiveUser = InferSelectViewModel<typeof activeUsers>;
export const activeName: string = (undefined as unknown as ActiveUser).name;
export const rlsUsers = pgTable('rls_users', {name: varchar('name', {length: 10})}).enableRLS();
export const reader = pgRole('reader').existing();
export const readPolicy = pgPolicy('read_all', {for: 'select', to: reader}).link(rlsUsers);
// The pure-types road also stands alone without drizzle installed.
type UsersType = PgTable<'users', {name: Varchar<'name', {length: 100; notNull: true}>; age: Integer<'age', {notNull: true}>}>;
export const handWritten: InferSelectModel<UsersType> = {name: row.name, age: 21} as never;
`;

describe('slim authoring surface with drizzle-orm absent', () => {
  it('type-checks a schema + models module when drizzle-orm cannot resolve', {timeout: 60_000}, () => {
    const options: ts.CompilerOptions = {...RESOLVING_OPTIONS, noImplicitAny: true};
    const base = makeHost(options, new Map([[CASE_FILE, SOURCE]]));
    const hidesDrizzle = (fileName: string) => /[\\/]drizzle-orm@|[\\/]node_modules[\\/]drizzle-orm[\\/]/.test(fileName);
    const host: ts.CompilerHost = {
      ...base,
      fileExists: (fileName) => !hidesDrizzle(fileName) && base.fileExists(fileName),
      readFile: (fileName) => (hidesDrizzle(fileName) ? undefined : base.readFile(fileName)),
      getSourceFile: (fileName, ...rest) => (hidesDrizzle(fileName) ? undefined : base.getSourceFile(fileName, ...rest)),
    };
    const program = ts.createProgram([CASE_FILE], options, host);
    // PROGRAM-wide diagnostics, not just the case file: a drizzle type-import
    // inside the packages' own sources errors THERE (TS2307) while the case
    // file silently degrades to any, so a case-file-only check misses it.
    const errors = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].map(
      (d) => `${d.file?.fileName ?? ''} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
    );
    expect(errors, `the authoring surface required drizzle-orm:\n  ${errors.join('\n  ')}`).toEqual([]);

    // The guard must actually be guarding: the same host refuses to resolve
    // drizzle-orm when a file asks for it directly.
    const badFile = CASE_FILE.replace('__drizzleFreeCase__', '__drizzleFreeBad__');
    const badHost = {...host, fileExists: host.fileExists, readFile: host.readFile};
    const badProgram = ts.createProgram(
      [badFile],
      options,
      makeBadHost(badHost, badFile, `import {pgTable as dz} from 'drizzle-orm/pg-core';\nexport const x = dz;\n`)
    );
    const badErrors = badProgram.getSemanticDiagnostics(badProgram.getSourceFile(badFile));
    expect(badErrors.length, 'the drizzle-hiding host failed to hide drizzle-orm').toBeGreaterThan(0);

    function makeBadHost(hostToWrap: ts.CompilerHost, fileName: string, text: string): ts.CompilerHost {
      return {
        ...hostToWrap,
        fileExists: (candidate) => candidate === fileName || hostToWrap.fileExists(candidate),
        readFile: (candidate) => (candidate === fileName ? text : hostToWrap.readFile(candidate)),
        getSourceFile: (candidate, ...rest) =>
          candidate === fileName
            ? ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true)
            : hostToWrap.getSourceFile(candidate, ...rest),
      };
    }
  });
});
