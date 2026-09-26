// Declaration emit must work for a project built on slim drizzle tables.
//
// Under the old drizzle-typed proxy builders it did not: exporting a mion
// router whose handlers touched proxy columns failed the WHOLE emit with
// TS4023 (a format's symbol-keyed sentinel printed structurally). The fix
// named the brand (`FormatBrand` / `NominalBrand` in
// packages/run-types/src/runtypes/typeFormat.ts); the slim architecture
// keeps models on those named brands, and these cases pin that every shape a
// library author exports — models, routers over them, the slim table itself,
// and the toDrizzle view — emits a `.d.ts` cleanly. `emitSkipped` is the
// assertion that matters: a declaration diagnostic aborts the emit silently
// as far as a normal test is concerned.

import {describe, it, expect} from 'vitest';
import * as ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {makeHost, RESOLVING_OPTIONS} from './modelPipelineHarness.ts';

const CASE_FILE = fileURLToPath(new URL('./__declarationEmitCase__.ts', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** The names each dialect spells the same two-column table with. */
interface Dialect {
  dialect: 'pg' | 'mysql' | 'sqlite';
  table: string;
  tableType: string;
  text: string;
  textType: string;
  int: string;
  intType: string;
  /** Printed once per int column in an exported table's declaration. */
  shippedIntKind: string;
}
const DIALECTS: Dialect[] = [
  {
    dialect: 'pg',
    table: 'pgTable',
    tableType: 'PgTable',
    text: 'varchar',
    textType: 'Varchar',
    int: 'integer',
    intType: 'Integer',
    shippedIntKind: 'RtPgIntColumn',
  },
  {
    dialect: 'mysql',
    table: 'mysqlTable',
    tableType: 'MysqlTable',
    text: 'varchar',
    textType: 'Varchar',
    int: 'int',
    intType: 'Int',
    shippedIntKind: 'RtMyIntColumn',
  },
  {
    dialect: 'sqlite',
    table: 'sqliteTable',
    tableType: 'SqliteTable',
    text: 'text',
    textType: 'Text',
    int: 'integer',
    intType: 'Integer',
    shippedIntKind: 'RtSqliteIntColumn',
  },
];

const shippedHeader = ({dialect, table, text, int}: Dialect) => `
import {${table}, ${text}, ${int}} from '@mionjs/drizzle-orm-${dialect}-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-${dialect}-core/drizzle';
import {${table} as dzTable, ${text} as dzText, ${int} as dzInt} from 'drizzle-orm/${dialect}-core';
import type {InferSelectModel as DzInferSelectModel} from 'drizzle-orm';
import {refineTableType} from '@mionjs/drizzle-orm';
import {RpcError} from '@mionjs/core';
import {createMionRouter} from '@mionjs/router';
`;
const shippedTable = ({table, text, int}: Dialect) => `
const users = ${table}('users', {
  name: ${text}('name', {length: 100}).notNull(),
  age: ${int}('age').notNull(),
});`;
const plainTable = `
const plain = dzTable('users', {
  name: dzText('name', {length: 100}).notNull(),
  age: dzInt('age').notNull(),
});`;

// next/ is imported by extensionless path, as a real declaration build resolves it.
// It is no package export, so this imports the helper types an inferred table names; the shipped entry must export them.
const nextHeader = ({dialect, table, tableType, text, textType, int, intType}: Dialect) => `
import type {NoProps, Writable} from '../../drizzle-orm/next/index';
export type {NoProps, Writable};
import {${table}, ${text}, ${int}} from '../../drizzle-orm-${dialect}-core/next/index';
import type {${tableType}, ${textType}, ${intType}} from '../../drizzle-orm-${dialect}-core/next/index';
import {toDrizzle} from '../../drizzle-orm-${dialect}-core/next/drizzle';
import type {InferSelectModel} from '../../drizzle-orm/next/models';
import {refineTableType} from '../../drizzle-orm/next/refine';
import {RpcError} from '@mionjs/core';
import {createMionRouter} from '@mionjs/router';
`;
const nextTable = ({table, text, int}: Dialect) => `
const users = ${table}('users', {
  name: ${text}('user_name', {length: 100, notNull: true}),
  age: ${int}('age', {notNull: true}),
});`;

function casesFor(names: Dialect) {
  const {dialect, tableType, textType, intType} = names;
  const shipped = `${shippedHeader(names)}${shippedTable(names)}`;
  const next = `${nextHeader(names)}${nextTable(names)}`;
  return [
    {
      label: `${dialect}: plain drizzle table + router (the control)`,
      source: `${shippedHeader(names)}${plainTable}\nexport type PlainUser = DzInferSelectModel<typeof plain>;${routerOver('PlainUser')}\n`,
    },
    {
      label: `${dialect}: slim table + router`,
      source: `${shipped}\nexport type SlimUser = InferSelectModel<typeof users>;${routerOver('SlimUser')}\n`,
    },
    {
      label: `${dialect}: refined table + router`,
      source: `${shipped}\nconst api = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});\nexport type User = InferSelectModel<typeof api>;${routerOver('User')}\n`,
    },
    {
      label: `${dialect}: refined table, model types only`,
      source: `${shipped}\nconst api = refineTableType(users, {name: {minLength: 10}});\nexport type User = InferSelectModel<typeof api>;\nexport {};\n`,
    },
    {
      label: `${dialect}: the slim table and its toDrizzle view exported as consts`,
      source: `${shipped}\nexport const usersTable = users;\nexport const usersDb = toDrizzle(users);\n`,
    },
    {
      label: `${dialect} next: builder table + router`,
      source: `${next}\nexport type User = InferSelectModel<typeof users>;${routerOver('User')}\n`,
    },
    {
      label: `${dialect} next: hand-written table + router`,
      source: `${nextHeader(names)}type Users = ${tableType}<'users', {name: ${textType}<{length: 100; notNull: true}>; age: ${intType}<{notNull: true}>}, [], {name: 'user_name'}>;\nexport type User = InferSelectModel<Users>;${routerOver('User')}\n`,
    },
    {
      label: `${dialect} next: refined table + router`,
      source: `${next}\nconst api = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});\nexport type User = InferSelectModel<typeof api>;${routerOver('User')}\n`,
    },
    {
      label: `${dialect} next: the table and its toDrizzle view exported as consts`,
      source: `${next}\nexport const usersTable = users;\nexport const usersDb = toDrizzle(users);\n`,
    },
  ];
}

describe('declaration emit over slim drizzle tables', () => {
  for (const names of DIALECTS) {
    const {dialect, int, shippedIntKind} = names;
    for (const {label, source} of casesFor(names)) {
      // The first case parses the whole resolved graph: the default 5s is too short beside the rest of the suite.
      it(`${label} emits a .d.ts`, {timeout: 60_000}, () => {
        const outcome = emitDeclarations(source);
        expect(outcome.errors, `declaration diagnostics:\n  ${outcome.errors.join('\n  ')}`).toEqual([]);
        expect(outcome.emitSkipped, 'declaration emit was skipped, so nothing was written').toBe(false);
        expect(outcome.dts.length).toBeGreaterThan(0);
      });
    }

    // Every consumer parses the exported columns record; the old `PgTable<Name, Cols, [], Cols>` form printed it twice.
    it(`${dialect}: the exported table prints its columns once, not twice`, {timeout: 60_000}, () => {
      const outcome = emitDeclarations(`${shippedHeader(names)}${shippedTable(names)}\nexport const usersTable = users;\n`);
      expect(outcome.emitSkipped).toBe(false);
      expect(outcome.dts.split(shippedIntKind).length - 1, `emitted declaration:\n${outcome.dts}`).toBe(1);
    });

    // The table builder spells its maps inline, so the declaration prints each resolved column once and no builder.
    it(`${dialect} next: the exported builder table prints its columns once and no builders`, {timeout: 60_000}, () => {
      const outcome = emitDeclarations(`${nextHeader(names)}${nextTable(names)}\nexport const usersTable = users;\n`);
      expect(outcome.emitSkipped).toBe(false);
      expect(outcome.dts, `emitted declaration:\n${outcome.dts}`).not.toContain('ColumnBuilder');
      expect(outcome.dts.split(`Column<"${int}"`).length - 1, `emitted declaration:\n${outcome.dts}`).toBe(1);
    });

    // Emit succeeding is not enough: without the format metadata, consumers lose the refined bounds.
    it(`${dialect}: the emitted declaration still carries the format brand`, {timeout: 60_000}, () => {
      const outcome = emitDeclarations(casesFor(names)[2].source);
      expect(outcome.dts).toContain('minLength');
      expect(/FormatBrand|RTString|String</.test(outcome.dts)).toBe(true);
    });
  }
});

/** A router exporting routes that take and return `Model`. **/
const routerOver = (model: string) => `
const store = new Map<string, ${model}>();
const mion = createMionRouter({});
export const usersApi = mion.initRoutes({
  users: {
    select: mion.route((_ctx, name: string): ${model} | RpcError<'user-not-found'> =>
      store.get(name) ?? new RpcError({publicMessage: 'User not found', type: 'user-not-found'})),
  },
});
export type UsersApi = typeof usersApi;`;

interface EmitOutcome {
  emitSkipped: boolean;
  errors: string[];
  dts: string;
}

function emitDeclarations(source: string): EmitOutcome {
  const options: ts.CompilerOptions = {
    ...RESOLVING_OPTIONS,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    moduleDetection: ts.ModuleDetectionKind.Force,
    // a real declaration build resolves .ts extensions the normal way
    allowImportingTsExtensions: false,
    declaration: true,
    emitDeclarationOnly: true,
    rootDir: REPO_ROOT,
    outDir: '/__declaration_emit_case__',
  };
  // The case file's own declaration: with the next/ sources in the program their .d.ts are written too.
  const written: string[] = [];
  const program = ts.createProgram(
    [CASE_FILE],
    options,
    makeHost(options, new Map([[CASE_FILE, source]]), (file, text) => {
      if (file.includes('__declarationEmitCase__')) written.push(text);
    })
  );
  const result = program.emit(undefined, undefined, undefined, true);
  const errors = [...program.getSemanticDiagnostics(program.getSourceFile(CASE_FILE)), ...result.diagnostics].map(
    (d) => `TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
  );
  return {emitSkipped: result.emitSkipped, errors, dts: written[0] ?? ''};
}
