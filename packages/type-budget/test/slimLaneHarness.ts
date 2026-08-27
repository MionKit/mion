// STAGE-1 SPIKE lane for the slim drizzle-free builder core
// (docs/todos/drizzle-slim-builders.md): measures the hand-written prototype in
// test/slimSpike/slimPgCore.ts through the same cumulative-step method as the
// drizzle lane in modelPipelineHarness.ts. Steps 4 and 5 are byte-copies of the
// drizzle lane's route/client steps (the control); steps 1-3 replace the
// drizzle table + proxy stamps + refine surgery with the slim surface; step 6
// is NEW: the first db-query cost through toDrizzle's synthesized drizzle
// typing, the one place drizzle generics are paid.

import {fileURLToPath} from 'node:url';
import {makeMeasurer} from '../../ts-runtypes/test/types/compileHarness.ts';
import {RESOLVING_OPTIONS, type PipelineStep} from './modelPipelineHarness.ts';

const SLIM_HEADER = `
import {pgTable, varchar, integer, timestamp, index, refineTableType, toDrizzle} from './slimSpike/slimPgCore.ts';
import type {InferSelect, InferInsert, InferUpdate} from './slimSpike/slimPgCore.ts';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';
import type {Date as RTDate, Number as RTNumber, String as RTString} from '@ts-runtypes/core/formats';
import {RpcError} from '@mionjs/core';
import {initMionRouter, route} from '@mionjs/router';
import {initClient} from '@mionjs/client';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export {};
`;

export const measureSlimLane = makeMeasurer(SLIM_HEADER, {
  options: RESOLVING_OPTIONS,
  snippetFile: fileURLToPath(new URL('./__slimCase__.ts', import.meta.url)),
  diagnosticsScope: 'snippet',
});

// Budgets seeded from the spike's tuned run (2026-08-27, TS 6.0.3 / drizzle
// 0.45.2); one-way downward, same rule as every budget suite. Control steps 4
// and 5 land near the drizzle lane's 540 / 2335 and the flat lanes' 506-510 /
// 2601-2817, so the lane is measuring the same thing.
export const SLIM_STEPS: PipelineStep[] = [
  {
    label: '1 slim table + row',
    budget: 403,
    body: `
const users = pgTable('users', {
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
}, (t) => [index('users_name_idx').on(t.name)]);
type SlimUser = InferSelect<typeof users>;
declare const slimRow: SlimUser;
export const plainName: string = slimRow.name;
export const plainAge: number = slimRow.age;
export const plainWhen: Date = slimRow.createdAt;
`,
  },
  {
    label: '2 + refineTableType',
    budget: 1039,
    body: `
const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
type RefinedUser = InferSelect<typeof apiUsers>;
declare const refinedRow: RefinedUser;
export const refinedName: string = refinedRow.name;
export const refinedAge: number = refinedRow.age;
`,
  },
  {
    label: '3 + Infer* models',
    budget: 705,
    body: `
type User = InferSelect<typeof apiUsers>;
type NewUser = InferInsert<typeof apiUsers>;
type UserPatch = InferUpdate<typeof apiUsers>;
export const newUser: NewUser = {name: 'a-long-name', age: 21};
export const userPatch: UserPatch = {age: 30};
export const selectedUser: User = {name: 'a-long-name', age: 21, createdAt: new Date()};
`,
  },
  // Steps 4 and 5 are byte-copies of the drizzle lane's steps 5 and 6 — the
  // control: their deltas must land near the drizzle lane's (540 / 2335).
  {
    label: '4 + mion route api',
    budget: 582,
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
    label: '5 + initClient',
    budget: 2541,
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
  {
    label: '6 + db query (toDrizzle)',
    budget: 7680,
    body: `
declare const db: PgDatabase<PgQueryResultHKT>;
const dzUsers = toDrizzle(apiUsers);
const selectQuery = db.select().from(dzUsers);
type SelectedRows = Awaited<typeof selectQuery>;
declare const dbRows: SelectedRows;
export const dbName: string = dbRows[0].name;
export const dbWhen: Date = dbRows[0].createdAt;
export const insertQuery = db.insert(dzUsers).values({name: 'a-long-name', age: 21});
export const updateQuery = db.update(dzUsers).set({age: 31});
`,
  },
];

/** The cumulative snippet up to (and including) `index`. **/
export function slimSnippetUpTo(index: number): string {
  return SLIM_STEPS.slice(0, index + 1)
    .map((step) => step.body)
    .join('');
}

/** Compiled after the six steps: pins the resolved shapes so a stale install
 *  cannot collapse the chain to `any` and pass the ratchet on nothing. Also
 *  pins that toDrizzle's synthesized typing carries the refined formats into
 *  the db rows and enforces insert optionality. */
export const SLIM_SHAPE_PINS = `
type _refinedName = Expect<Equal<User['name'], RTString<{maxLength: 100; minLength: 10}>>>;
type _refinedAge = Expect<Equal<User['age'], RTNumber<{integer: true; max: 2147483647; min: 18}>>>;
type _selectDate = Expect<Equal<User['createdAt'], RTDate>>;
type _insertOptionalDefault = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;
type _patchIsPartial = Expect<Equal<UserPatch['name'], RTString<{maxLength: 100; minLength: 10}> | undefined>>;
type _clientValueSlot = Expect<Equal<typeof inserted, User | undefined>>;
type _clientErrorSlot = Expect<RpcError<'bad-insert'> extends NonNullable<typeof insertError> ? true : false>;
type _dbRowName = Expect<Equal<SelectedRows[number]['name'], RTString<{maxLength: 100; minLength: 10}>>>;
type _dbRowDate = Expect<Equal<SelectedRows[number]['createdAt'], RTDate>>;
export type _SlimPins = [
  _refinedName,
  _refinedAge,
  _selectDate,
  _insertOptionalDefault,
  _patchIsPartial,
  _clientValueSlot,
  _clientErrorSlot,
  _dbRowName,
  _dbRowDate,
];
`;
