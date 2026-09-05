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

const HEADER = `
import {pgTable, varchar, integer} from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {pgTable as dzPgTable, varchar as dzVarchar, integer as dzInteger} from 'drizzle-orm/pg-core';
import type {InferSelectModel as DzInferSelectModel} from 'drizzle-orm';
import {refineTableType} from '@mionjs/drizzle-orm';
import {RpcError} from '@mionjs/core';
import {createMionRouter} from '@mionjs/router';
`;

const slimTable = `
const users = pgTable('users', {
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
});`;

const plainTable = `
const plain = dzPgTable('users', {
  name: dzVarchar('name', {length: 100}).notNull(),
  age: dzInteger('age').notNull(),
});`;

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
  const written: string[] = [];
  const program = ts.createProgram(
    [CASE_FILE],
    options,
    makeHost(options, new Map([[CASE_FILE, source]]), (_file, text) => written.push(text))
  );
  const result = program.emit(undefined, undefined, undefined, true);
  const errors = [...program.getSemanticDiagnostics(program.getSourceFile(CASE_FILE)), ...result.diagnostics].map(
    (d) => `TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
  );
  return {emitSkipped: result.emitSkipped, errors, dts: written[0] ?? ''};
}

const CASES = [
  {
    label: 'plain drizzle table + router (the control)',
    source: `${HEADER}${plainTable}\nexport type PlainUser = DzInferSelectModel<typeof plain>;${routerOver('PlainUser')}\n`,
  },
  {
    label: 'slim table + router',
    source: `${HEADER}${slimTable}\nexport type SlimUser = InferSelectModel<typeof users>;${routerOver('SlimUser')}\n`,
  },
  {
    label: 'refined table + router',
    source: `${HEADER}${slimTable}\nconst api = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});\nexport type User = InferSelectModel<typeof api>;${routerOver('User')}\n`,
  },
  {
    label: 'refined table, model types only',
    source: `${HEADER}${slimTable}\nconst api = refineTableType(users, {name: {minLength: 10}});\nexport type User = InferSelectModel<typeof api>;\nexport {};\n`,
  },
  {
    label: 'the slim table and its toDrizzle view exported as consts',
    source: `${HEADER}${slimTable}\nexport const usersTable = users;\nexport const usersDb = toDrizzle(users);\n`,
  },
];

describe('declaration emit over slim drizzle tables', () => {
  for (const {label, source} of CASES) {
    // The first case pays for parsing the whole resolved graph; later ones reuse
    // it. Comfortable on an idle machine, but the default 5s is not enough when
    // the rest of the suite is running alongside.
    it(`${label} emits a .d.ts`, {timeout: 60_000}, () => {
      const outcome = emitDeclarations(source);
      expect(outcome.errors, `declaration diagnostics:\n  ${outcome.errors.join('\n  ')}`).toEqual([]);
      expect(outcome.emitSkipped, 'declaration emit was skipped, so nothing was written').toBe(false);
      expect(outcome.dts.length).toBeGreaterThan(0);
    });
  }

  // A library that exports its slim table ships that table's whole columns
  // record in its .d.ts, and every consumer parses and checks what is there. The
  // factories used to return `PgTable<Name, Cols, [], Cols>` — the columns in
  // slot two AND again in the normalized fast-path slot — so the record was
  // printed TWICE. Counting one column's own emitted type is what pins the fix:
  // a return to the 4-parameter form doubles it and fails here.
  it('the exported table prints its columns once, not twice', {timeout: 60_000}, () => {
    const outcome = emitDeclarations(`${HEADER}${slimTable}\nexport const usersTable = users;\n`);
    expect(outcome.emitSkipped).toBe(false);
    const ageOccurrences = outcome.dts.split('RtPgIntColumn').length - 1;
    expect(ageOccurrences, `emitted declaration:\n${outcome.dts}`).toBe(1);
  });

  // Emit succeeding is not enough: the format metadata has to survive into the
  // declaration, or consumers lose the refined bounds.
  it('the emitted declaration still carries the format brand', {timeout: 60_000}, () => {
    const outcome = emitDeclarations(CASES[2].source);
    expect(outcome.dts).toContain('minLength');
    expect(/FormatBrand|RTString|String</.test(outcome.dts)).toBe(true);
  });
});
