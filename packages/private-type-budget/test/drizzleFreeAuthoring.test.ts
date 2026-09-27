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

// Every dialect makes the same promise.
interface Dialect {
  dialect: 'pg' | 'mysql' | 'sqlite';
  table: string;
  tableType: string;
  view: string;
  creator: string;
  text: string;
  textType: string;
  int: string;
  intType: string;
  /** A notNull date column: its builder and its call. */
  date: string;
  createdAt: string;
  /** What only this dialect has: enums, schemas, row level security. */
  extras: string;
  /** Ambient types the program needs besides drizzle's. */
  types: string[];
}
const DIALECTS: Dialect[] = [
  {
    dialect: 'pg',
    table: 'pgTable',
    tableType: 'PgTable',
    view: 'pgView',
    creator: 'pgTableCreator',
    text: 'varchar',
    textType: 'Varchar',
    int: 'integer',
    intType: 'Integer',
    date: 'timestamp',
    createdAt: `timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`,
    extras: `import {pgEnum, pgPolicy, pgRole, pgSchema} from '@mionjs/drizzle-orm-pg-core';
const roleEnum = pgEnum('role', ['admin', 'user']);
export const withEnum = pgTable('with_enum', {role: roleEnum('role', {notNull: true})});
export const audit = pgSchema('audit').table('events', {id: integer('id', {primaryKey: true})});
export const rlsUsers = pgTable('rls_users', {name: varchar('name', {length: 10})}).enableRLS();
export const reader = pgRole('reader').existing();
export const readPolicy = pgPolicy('read_all', {for: 'select', to: reader}).link(rlsUsers);`,
    types: [],
  },
  {
    dialect: 'mysql',
    table: 'mysqlTable',
    tableType: 'MysqlTable',
    view: 'mysqlView',
    creator: 'mysqlTableCreator',
    text: 'varchar',
    textType: 'Varchar',
    int: 'int',
    intType: 'Int',
    date: 'timestamp',
    createdAt: `timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`,
    extras: `import {mysqlEnum, mysqlSchema} from '@mionjs/drizzle-orm-mysql-core';
export const withEnum = mysqlTable('with_enum', {role: mysqlEnum('role', ['admin', 'user'], {notNull: true})});
export const audit = mysqlSchema('audit').table('events', {id: int('id', {primaryKey: true})});`,
    types: [],
  },
  {
    dialect: 'sqlite',
    table: 'sqliteTable',
    tableType: 'SqliteTable',
    view: 'sqliteView',
    creator: 'sqliteTableCreator',
    text: 'text',
    textType: 'Text',
    int: 'integer',
    intType: 'Integer',
    date: 'integer',
    createdAt: `integer('created_at', {mode: 'timestamp', notNull: true})`,
    extras: '',
    // drizzle types sqlite's blob buffer mode as Node's Buffer, so that program needs Node's types.
    types: ['node'],
  },
];

const sourceOf = (names: Dialect) => {
  const {dialect, table, tableType, view, creator, text, textType, int, intType, date} = names;
  const builders = [...new Set([table, text, int, view, creator, date])].join(', ');
  return `
import {${builders}, index} from '@mionjs/drizzle-orm-${dialect}-core';
import type {${textType}, ${intType}, ${tableType}} from '@mionjs/drizzle-orm-${dialect}-core';
import {refineTableType, sql} from '@mionjs/drizzle-orm';
import type {InferSelectModel, InferSelectViewModel, InferInsertModel, InferUpdateModel} from '@mionjs/drizzle-orm';

const users = ${table}('users', {
  name: ${text}('name', {length: 100, notNull: true}),
  age: ${int}('age', {notNull: true}),
  createdAt: ${names.createdAt},
}, (t) => [index('users_name_idx').on(t.name)]);
const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
type User = InferSelectModel<typeof apiUsers>;
declare const row: User;
export const rowName: string = row.name;
export const patch: InferUpdateModel<typeof apiUsers> = {age: 30};
export const newUser: InferInsertModel<typeof apiUsers> = {name: 'a-long-name', age: 21, createdAt: new Date()};
const activeUsers = ${view}('active_users', {name: ${text}('name', {length: 100, notNull: true})}).as(sql\`select name from users\`);
export const activeName: string = (undefined as unknown as InferSelectViewModel<typeof activeUsers>).name;
export const prefixed = ${creator}((name) => \`app_\${name}\`)('events', {id: ${int}('id', {primaryKey: true})});
type UsersType = ${tableType}<'users', {name: ${textType}<{length: 100; notNull: true}>; age: ${intType}<{notNull: true}>}>;
export const handWritten: InferSelectModel<UsersType> = {name: row.name, age: 21} as never;
${names.extras}
`;
};

/** Program-wide diagnostics of `source` compiled with every drizzle-orm path hidden. */
function drizzleFreeErrors(source: string, types: string[] = []): string[] {
  const options: ts.CompilerOptions = {...RESOLVING_OPTIONS, noImplicitAny: true, types};
  const base = makeHost(options, new Map([[CASE_FILE, source]]));
  const hidesDrizzle = (fileName: string) => /[\\/]drizzle-orm@|[\\/]node_modules[\\/]drizzle-orm[\\/]/.test(fileName);
  const host: ts.CompilerHost = {
    ...base,
    fileExists: (fileName) => !hidesDrizzle(fileName) && base.fileExists(fileName),
    readFile: (fileName) => (hidesDrizzle(fileName) ? undefined : base.readFile(fileName)),
    getSourceFile: (fileName, ...rest) => (hidesDrizzle(fileName) ? undefined : base.getSourceFile(fileName, ...rest)),
  };
  const program = ts.createProgram([CASE_FILE], options, host);
  return [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].map(
    (d) => `${d.file?.fileName ?? ''} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
  );
}

describe('slim authoring surface with drizzle-orm absent', () => {
  for (const names of DIALECTS) {
    it(`type-checks a ${names.dialect} schema + models module when drizzle-orm cannot resolve`, {timeout: 60_000}, () => {
      // PROGRAM-wide diagnostics: a drizzle import inside the packages' own sources errors THERE (TS2307) while the
      // case file silently degrades to any, so a case-file-only check misses it.
      const errors = drizzleFreeErrors(sourceOf(names), names.types);
      expect(errors, `the ${names.dialect} authoring surface required drizzle-orm:\n  ${errors.join('\n  ')}`).toEqual([]);
    });
  }

  it('the drizzle-hiding host refuses drizzle-orm when a file asks for it directly', {timeout: 60_000}, () => {
    const errors = drizzleFreeErrors(`import {pgTable as dz} from 'drizzle-orm/pg-core';\nexport const x = dz;\n`);
    expect(errors.length, 'the drizzle-hiding host failed to hide drizzle-orm').toBeGreaterThan(0);
  });
});
