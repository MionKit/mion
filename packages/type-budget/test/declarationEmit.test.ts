// Declaration emit must work for a project built on proxy-built drizzle columns.
//
// It did not. Exporting a mion router whose handlers touch proxy columns failed
// the WHOLE emit with TS4023 ("has or is using name '__rtFormatName' … but
// cannot be named"), so nothing was written at all. Any consumer publishing a
// library, or using composite project references, was blocked.
//
// The cause: a format's sentinel members are symbol-keyed, and a symbol-keyed
// member can only be printed into a `.d.ts` when the emitting file can name the
// symbol — TypeScript will not invent an import for one. Formats normally print
// by alias (`import("@ts-runtypes/core/formats").String<{maxLength: 100}>`), but
// the router's public API maps the handler types and loses that alias, so the
// brand got printed structurally and hit the bare `[__rtFormatName]` key.
//
// The fix names the brand: `FormatBrand` / `NominalBrand` in
// packages/ts-runtypes/src/runtypes/typeFormat.ts, exported from the package
// root and the `formats` subpath. Structurally identical, but now the expansion
// prints a reference the emitter can always write.
//
// These cases are the shape of the original failure. `emitSkipped` is the
// assertion that matters: a declaration diagnostic aborts the emit silently as
// far as a normal test is concerned.

import {describe, it, expect} from 'vitest';
import * as ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {makeHost, RESOLVING_OPTIONS} from './modelPipelineHarness.ts';

const CASE_FILE = fileURLToPath(new URL('./__declarationEmitCase__.ts', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const HEADER = `
import {pgTable, varchar, integer} from '@mionjs/drizzle-orm-pg-core';
import type {InferSelect} from '@mionjs/drizzle-orm-pg-core';
import {pgTable as dzPgTable, varchar as dzVarchar, integer as dzInteger} from 'drizzle-orm/pg-core';
import type {InferSelectModel} from 'drizzle-orm';
import {refineTableType} from '@mionjs/drizzle-orm-pg-core';
import {RpcError} from '@mionjs/core';
import {initMionRouter, route} from '@mionjs/router';
`;

const proxyTable = `
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
export const usersApi = await initMionRouter({
  users: {
    select: route((_ctx, name: string): ${model} | RpcError<'user-not-found'> =>
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
    label: 'plain drizzle table + router (the control, never broke)',
    source: `${HEADER}${plainTable}\nexport type PlainUser = InferSelectModel<typeof plain>;${routerOver('PlainUser')}\n`,
  },
  {
    label: 'proxy-built table + router',
    source: `${HEADER}${proxyTable}\nexport type ProxyUser = InferSelectModel<typeof users>;${routerOver('ProxyUser')}\n`,
  },
  {
    label: 'refined table + router',
    source: `${HEADER}${proxyTable}\nconst api = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});\nexport type User = InferSelect<typeof api>;${routerOver('User')}\n`,
  },
  {
    label: 'refined table, model types only',
    source: `${HEADER}${proxyTable}\nconst api = refineTableType(users, {name: {minLength: 10}});\nexport type User = InferSelect<typeof api>;\nexport {};\n`,
  },
];

describe('declaration emit over proxy-built drizzle columns', () => {
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

  // The point of the fix is not just that emit succeeds: the format metadata has
  // to survive into the declaration, or consumers lose the refined bounds.
  it('the emitted declaration still carries the format brand', {timeout: 60_000}, () => {
    const outcome = emitDeclarations(CASES[2].source);
    expect(outcome.dts).toContain('FormatBrand');
    expect(outcome.dts).toContain('minLength');
  });
});
