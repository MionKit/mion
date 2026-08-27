// Measurement core for the model-pipeline type-cost budgets.
//
// Reuses `makeMeasurer` from the runtypes compile-budget harness
// (packages/ts-runtypes/test/types/compileHarness.ts) rather than copying it, so
// the counting, the empty-snippet baseline subtraction and the snippet-relative
// error line numbers stay identical across every budget suite in the repo. The
// one thing this measurer does differently is REAL module resolution: the chain
// under measurement spans drizzle-orm, the pg dialect package, @ts-runtypes/core,
// @mionjs/router and @mionjs/client, so a sliced lib-only preamble cannot stand
// in for it. That is what `MeasurerConfig.snippetFile` + `diagnosticsScope` are
// for: the snippet is a virtual file at a real path inside THIS package, so its
// bare imports resolve through this package's node_modules exactly as a
// consumer's would, and diagnostics stay scoped to the snippet instead of
// type-checking every resolved source file in the graph.
//
// The import header is the measurer's PREAMBLE, so it is present in all seven
// programs (baseline + six steps) and module resolution never lands in a delta:
// every delta is type-level work and nothing else.

import * as ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {makeMeasurer, type MeasureResult} from '../../ts-runtypes/test/types/compileHarness.ts';

export type {MeasureResult};

/** Virtual snippet file. Never written to disk (the measurer's host serves it
 *  from memory) but the PATH is real, which is what makes `@mionjs/*` and
 *  `drizzle-orm` resolve from this package's node_modules. **/
const SNIPPET_FILE = fileURLToPath(new URL('./__modelPipelineCase__.ts', import.meta.url));

/** Every module the chain needs, imported once. Being the preamble, this is the
 *  baseline: resolving these costs 0 instantiations on its own, so a step's net
 *  is the type work its own body triggered. **/
const IMPORT_HEADER = `
import {pgTable, varchar, integer, timestamp, refineTableType} from '@mionjs/drizzle-orm-pg-core';
import type {InferSelect, InferInsert, InferUpdate} from '@mionjs/drizzle-orm-pg-core';
import {pgTable as dzPgTable, varchar as dzVarchar, integer as dzInteger, timestamp as dzTimestamp} from 'drizzle-orm/pg-core';
import type {InferSelectModel} from 'drizzle-orm';
import type {Date as RTDate, Number as RTNumber, String as RTString} from '@ts-runtypes/core/formats';
import {RpcError} from '@mionjs/core';
import {initMionRouter, route} from '@mionjs/router';
import {initClient} from '@mionjs/client';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export {};
`;

/** A resolving program, configured the way a mion consumer's is: the client's
 *  own lib set (es2023 + DOM), bundler resolution, and the `source` condition
 *  the workspace packages export so imports land on src instead of a stale
 *  build. `skipLibCheck` keeps drizzle's shipped .d.ts out of the error list
 *  without hiding any of its instantiation cost. **/
const RESOLVING_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  customConditions: ['source'],
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
  types: [],
  allowImportingTsExtensions: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noImplicitAny: false,
};

/** Compile `IMPORT_HEADER + snippet` against the real module graph; report
 *  snippet errors + raw/net instantiations. **/
export const measurePipeline = makeMeasurer(IMPORT_HEADER, {
  options: RESOLVING_OPTIONS,
  snippetFile: SNIPPET_FILE,
  diagnosticsScope: 'snippet',
});

export interface PipelineStep {
  /** Printed on failure — names the layer that regressed. **/
  label: string;
  /** Appended to every previous body: the snippets are CUMULATIVE, and the
   *  metric is this step's delta over the one before it. **/
  body: string;
  /** Net instantiations this step may add. ONE-WAY DOWNWARD (see the test). **/
  budget: number;
}

// Each body USES what it builds. Declaring a type measures nothing: the checker
// is lazy, so an unused `type User = InferSelect<…>` costs close to zero and the
// step looks free. Reading fields into annotated consts, building real payload
// literals, returning a real row from a handler and destructuring the client's
// Result tuple are what force the instantiations a consumer actually pays for.
export const PIPELINE_STEPS: PipelineStep[] = [
  {
    label: '1 plain drizzle table',
    budget: 5025,
    body: `
const plainUsers = dzPgTable('users', {
  name: dzVarchar('name', {length: 100}).notNull(),
  age: dzInteger('age').notNull(),
  createdAt: dzTimestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
type PlainUser = InferSelectModel<typeof plainUsers>;
declare const plainRow: PlainUser;
export const plainName: string = plainRow.name;
export const plainAge: number = plainRow.age;
export const plainWhen: Date = plainRow.createdAt;
`,
  },
  {
    label: '2 + proxy-built table',
    budget: 2108,
    body: `
const users = pgTable('users', {
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
type ProxyUser = InferSelectModel<typeof users>;
declare const proxyRow: ProxyUser;
export const proxyName: string = proxyRow.name;
export const proxyAge: number = proxyRow.age;
export const proxyWhen: Date = proxyRow.createdAt;
`,
  },
  {
    label: '3 + refineTableType',
    budget: 4430,
    body: `
const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
type RefinedUser = InferSelectModel<typeof apiUsers>;
declare const refinedRow: RefinedUser;
export const refinedName: string = refinedRow.name;
export const refinedAge: number = refinedRow.age;
`,
  },
  {
    label: '4 + Infer* models',
    budget: 682,
    body: `
type User = InferSelect<typeof apiUsers>;
type NewUser = InferInsert<typeof apiUsers>;
type UserPatch = InferUpdate<typeof apiUsers>;
export const newUser: NewUser = {name: 'a-long-name', age: 21};
export const userPatch: UserPatch = {age: 30};
export const selectedUser: User = {name: 'a-long-name', age: 21, createdAt: new Date()};
`,
  },
  {
    label: '5 + mion route api',
    budget: 540,
    body: `
const store = new Map<string, User>();
const usersApi = await initMionRouter({
  users: {
    insert: route((_ctx, user: NewUser): User | RpcError<'bad-insert'> => {
      const row: User = {name: user.name, age: user.age, createdAt: user.createdAt ?? new Date()};
      store.set(row.name, row);
      return row;
    }),
    select: route((_ctx, name: string): User | RpcError<'user-not-found'> =>
      store.get(name) ?? new RpcError({publicMessage: 'User not found', type: 'user-not-found'})),
    update: route((_ctx, name: string, patch: UserPatch): User | RpcError<'user-not-found'> => {
      const existing = store.get(name);
      if (!existing) return new RpcError({publicMessage: 'User not found', type: 'user-not-found'});
      const next: User = {...existing, ...patch};
      store.set(name, next);
      return next;
    }),
  },
});
type UsersApi = typeof usersApi;
`,
  },
  {
    label: '6 + initClient',
    budget: 2319,
    body: `
const {routes} = initClient<UsersApi>({baseURL: 'http://localhost:3000'});
const [inserted, insertError] = await routes.users.insert({name: 'a-long-name', age: 21}).call();
const [found] = await routes.users.select('a-long-name').call();
const [updated, updateError] = await routes.users.update('a-long-name', {age: 31}).call();
export const insertedName: string | undefined = inserted?.name;
export const insertedWhen: Date | undefined = inserted?.createdAt;
export const foundAge: number | undefined = found?.age;
export const updatedName: string | undefined = updated?.name;
export const errorName: string | undefined = insertError?.name ?? updateError?.name;
`,
  },
];

/** The cumulative snippet up to (and including) `index`. **/
export function snippetUpTo(index: number): string {
  return PIPELINE_STEPS.slice(0, index + 1)
    .map((step) => step.body)
    .join('');
}

/** Compiled after the six steps: pins the SHAPES the chain resolves to.
 *
 *  Load-bearing, not decoration. If module resolution breaks (a stale workspace
 *  install is the way it happens in practice) the whole chain silently collapses
 *  to `any`, every step gets cheaper, and a downward-only ratchet goes green on a
 *  measurement of nothing. These assertions fail to compile in that world. **/
export const SHAPE_PINS = `
type _refinedName = Expect<Equal<User['name'], RTString<{maxLength: 100; minLength: 10}>>>;
type _refinedAge = Expect<Equal<User['age'], RTNumber<{integer: true; max: 2147483647; min: 18}>>>;
type _selectDate = Expect<Equal<User['createdAt'], RTDate>>;
type _insertOptionalDefault = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;
type _patchIsPartial = Expect<Equal<UserPatch['name'], RTString<{maxLength: 100; minLength: 10}> | undefined>>;
type _clientValueSlot = Expect<Equal<typeof inserted, User | undefined>>;
type _clientErrorSlot = Expect<RpcError<'bad-insert'> extends NonNullable<typeof insertError> ? true : false>;
export type _Pins = [_refinedName, _refinedAge, _selectDate, _insertOptionalDefault, _patchIsPartial, _clientValueSlot, _clientErrorSlot];
`;
