// What a drizzle query hands back, next to what a mion route declares.
//
// A slim table has TWO typed views of the same runtime object: the table
// itself, and `refineTableType(table, {...})`. `toDrizzle` synthesizes drizzle
// column configs from whichever one it was given, so the view you query
// through decides the format params on every row you get back. These cases pin
// what lines up and what does not, because the answer is not uniform:
//
//   - A refinement that ADDS a param key (minLength on a varchar) leaves the
//     row assignable back to the unrefined model.
//   - A refinement that OVERWRITES a captured key (min on an integer, which
//     already carries Int32's min) does NOT. Format params are compared as
//     literal types, so a tightened bound is a different type in BOTH
//     directions, not a subtype.
//
// Every case is a whole program compiled against the real packages; the
// assertion is on the diagnostics, so "this must not compile" is testable.

import {describe, it, expect} from 'vitest';
import {measurePipeline} from './modelPipelineHarness.ts';

const SETUP = `
declare const db: PgDatabase<PgQueryResultHKT>;
declare const joinOn: any;
const dbUsers = pgTable('users', {
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
// name: ADDS minLength. age: OVERWRITES the min Int32 already captured.
const apiUsers = refineTableType(dbUsers, {name: {minLength: 10}, age: {min: 18}});
// the add-only refinement, for the contrast cases
const nameOnlyUsers = refineTableType(dbUsers, {name: {minLength: 10}});
type ApiUser = InferSelectModel<typeof apiUsers>;
type DbUser = InferSelectModel<typeof dbUsers>;
const dzApi = toDrizzle(apiUsers);
const dzDb = toDrizzle(dbUsers);
`;

function compile(body: string) {
  return measurePipeline(SETUP + body);
}
function mustCompile(body: string) {
  const result = compile(body);
  expect(result.errors, `expected no diagnostics:\n  ${result.errors.join('\n  ')}`).toEqual([]);
}
function mustFail(body: string, code: string) {
  const result = compile(body);
  expect(result.errors.join('\n'), 'expected this to be rejected').toContain(code);
}

describe('rows a query returns carry the queried view formats', () => {
  it('querying the refined view gives rows equal to the API model', () => {
    mustCompile(`
const q = db.select().from(dzApi);
type Row = Awaited<typeof q>[number];
export type P1 = Expect<Equal<Row['name'], RTString<{maxLength: 100; minLength: 10}>>>;
export type P2 = Expect<Equal<Row, ApiUser>>;
`);
  });

  it('querying the unrefined table gives rows equal to the DB model', () => {
    mustCompile(`
const q = db.select().from(dzDb);
type Row = Awaited<typeof q>[number];
export type P1 = Expect<Equal<Row['name'], RTString<{maxLength: 100}>>>;
export type P2 = Expect<Equal<Row, DbUser>>;
`);
  });

  it('a column projection keeps the refined format', () => {
    mustCompile(`
const q = db.select({name: dzApi.name}).from(dzApi);
export type P = Expect<Equal<Awaited<typeof q>[number]['name'], RTString<{maxLength: 100; minLength: 10}>>>;
`);
  });

  it('a join keeps each table refined format under its own key', () => {
    mustCompile(`
const dbPosts = pgTable('posts', {title: varchar('title', {length: 200}).notNull()});
const dzPosts = toDrizzle(refineTableType(dbPosts, {title: {minLength: 5}}));
const q = db.select().from(dzApi).innerJoin(dzPosts, joinOn);
type Row = Awaited<typeof q>[number];
export type P1 = Expect<Equal<Row['users']['name'], RTString<{maxLength: 100; minLength: 10}>>>;
export type P2 = Expect<Equal<Row['posts']['title'], RTString<{maxLength: 200; minLength: 5}>>>;
`);
  });
});

describe('a route fed by a query', () => {
  it('the refined view feeds a route declaring the API model', () => {
    mustCompile(`
const api = await initMionRouter({
  users: {list: route(async (): Promise<ApiUser[]> => await db.select().from(dzApi))},
});
export type P = typeof api;
`);
  });

  it('the UNREFINED view cannot feed a route declaring the API model', () => {
    // The safety property that matters: unvalidated database rows cannot be
    // returned where the stricter API type was promised.
    mustFail(
      `
const api = await initMionRouter({
  users: {list: route(async (): Promise<ApiUser[]> => await db.select().from(dzDb))},
});
export type P = typeof api;
`,
      'TS2322'
    );
  });

  it('an API insert payload goes into the refined view', () => {
    mustCompile(`
declare const payload: InferInsertModel<typeof apiUsers>;
export const w = db.insert(dzApi).values(payload);
`);
  });

  it('a DB insert payload does NOT go into the refined view', () => {
    mustFail(
      `
declare const payload: InferInsertModel<typeof dbUsers>;
export const w = db.insert(dzApi).values(payload);
`,
      'TS2769'
    );
  });
});

describe('going back the other way, refined to unrefined', () => {
  it('an ADD-only refinement round trips: refined rows satisfy the DB model', () => {
    mustCompile(`
const q = db.select().from(toDrizzle(nameOnlyUsers));
declare const rows: Awaited<typeof q>;
export const back: DbUser = rows[0];
`);
  });

  it('an OVERWRITE refinement does NOT round trip, in either direction', () => {
    // age: {min: 18} replaces Int32's own min, and format params compare as
    // literal types, so the two ages are unrelated types. A helper or a write
    // path typed with the DB model rejects an API row even though every API
    // row is a valid DB row.
    mustFail(
      `
const q = db.select().from(dzApi);
declare const rows: Awaited<typeof q>;
export const back: DbUser = rows[0];
`,
      'TS2322'
    );
    mustFail(
      `
declare function audit(row: DbUser): void;
const q = db.select().from(dzApi);
declare const rows: Awaited<typeof q>;
export const r = audit(rows[0]);
`,
      'TS2345'
    );
    mustFail(
      `
declare const validated: InferInsertModel<typeof apiUsers>;
export const w = db.insert(dzDb).values(validated);
`,
      'TS2769'
    );
  });
});
