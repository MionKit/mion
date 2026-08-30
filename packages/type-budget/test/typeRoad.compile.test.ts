// What a table costs depending on HOW it was declared, over the REAL slim
// packages.
//
// The model pipeline suite next door measures one builder-road table through
// six layers. This one holds the layers still and varies the DECLARATION: the
// same columns written with the builders, written as a pure type, and written
// as the branded column types the builders return. That third form is not a
// design anyone authors; it is the floor, and the gap above it is exactly what
// normalizing an authored column record costs.
//
// Why it exists as a suite rather than a note in TYPE-COST.md: the numbers in
// that file went stale, and a stale number sent a whole change down the wrong
// path (it read three quarters of the type road's cost onto the modifier
// intersections, where the real figure is about an eighth). Measured beats
// remembered.
//
// Budgets are ONE-WAY DOWNWARD, the same rule the pipeline suite states: cheapen
// the types, never raise the number.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMeasurer} from '../../ts-runtypes/test/types/compileHarness.ts';
import {RESOLVING_OPTIONS} from './modelPipelineHarness.ts';
import {writeRoadReport, type RoadCaseReport} from './report.ts';

const drizzleVersion: string = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  .dependencies['drizzle-orm'];

/** Virtual snippet file at a REAL path inside this package, so the bare
 *  imports resolve through its node_modules exactly as a consumer's would. */
const SNIPPET_FILE = fileURLToPath(new URL('./__typeRoadCase__.ts', import.meta.url));

/** The preamble, so module resolution never lands in a measurement. */
const IMPORT_HEADER = `
import {pgTable, varchar, integer, timestamp, uuid, text} from '@mionjs/drizzle-orm-pg-core';
import type {PgTable, PgBuilderTable, RtPgIntColumn} from '@mionjs/drizzle-orm-pg-core';
import type {Varchar, Integer, Timestamp, Uuid, Text, NotNull, PrimaryKey, DefaultNow} from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel, InferInsertModel} from '@mionjs/drizzle-orm';
import type {Date as RTDate, String as RTString, Int32} from '@ts-runtypes/core/formats';
export {};
`;

const measure = makeMeasurer(IMPORT_HEADER, {
  options: RESOLVING_OPTIONS,
  snippetFile: SNIPPET_FILE,
  diagnosticsScope: 'snippet',
});

// Reading the row into annotated consts is what forces the work. A bare
// `type Row = InferSelectModel<...>` measures almost nothing, because the
// checker stays lazy and the case looks free.
const readMixed = (prefix: string) => `
declare const ${prefix}row: ${prefix}Row;
export const ${prefix}Id: string = ${prefix}row.id;
export const ${prefix}Name: string = ${prefix}row.name;
export const ${prefix}Age: number = ${prefix}row.age;
export const ${prefix}Role: string = ${prefix}row.role;
export const ${prefix}When: Date = ${prefix}row.createdAt;
`;

const plainKeys = (count: number) => Array.from({length: count}, (_, i) => `c${i}`);
const readPlain = (prefix: string, count: number) =>
  plainKeys(count)
    .map((key, i) => `export const ${prefix}${i}: number | null = ${prefix}row.${key};`)
    .join('\n');

const plainCase = (prefix: string, count: number, columns: string, table: (cols: string) => string) => `
${table(columns)}
type ${prefix}Row = InferSelectModel<${prefix}Src>;
declare const ${prefix}row: ${prefix}Row;
${readPlain(prefix, count)}
`;

interface RoadCase {
  label: string;
  body: string;
  /** Net instantiations this declaration may cost. ONE-WAY DOWNWARD. */
  budget: number;
}

const CASES: RoadCase[] = [
  {
    label: 'builder road, 5 mixed columns',
    budget: 646,
    body: `
const bSrc = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
type bRow = InferSelectModel<typeof bSrc>;
${readMixed('b')}`,
  },
  {
    label: 'type road, 5 mixed columns',
    // 1488 -> 1258. Four changes to the normalization, measured one at a time:
    // the key flags became a lazy member instead of an eager type argument, the
    // spec and mods are extracted once and threaded down, one conditional pulls
    // both out instead of two `keyof C` probes, and the builder's intrinsic
    // flags became a name union instead of a four-member object of falses.
    budget: 1258,
    body: `
type tSrc = PgTable<'users', {
  id: Uuid<'id'> & PrimaryKey;
  name: Varchar<'name', {length: 100}> & NotNull;
  age: Integer<'age'> & NotNull;
  role: Text<'role', {enum: ['admin', 'user']}> & NotNull;
  createdAt: Timestamp<'created_at', {mode: 'date'}> & NotNull & DefaultNow;
}>;
type tRow = InferSelectModel<tSrc>;
${readMixed('t')}`,
  },
  {
    label: 'type road, 5 mixed columns + insert model',
    // 2125 -> 1895, the same four changes.
    budget: 1895,
    body: `
type iSrc = PgTable<'users', {
  id: Uuid<'id'> & PrimaryKey;
  name: Varchar<'name', {length: 100}> & NotNull;
  age: Integer<'age'> & NotNull;
  role: Text<'role', {enum: ['admin', 'user']}> & NotNull;
  createdAt: Timestamp<'created_at', {mode: 'date'}> & NotNull & DefaultNow;
}>;
type iRow = InferSelectModel<iSrc>;
type iNew = InferInsertModel<iSrc>;
${readMixed('i')}
export const iNewUser: iNew = {id: 'x' as never, name: 'a', age: 1, role: 'admin'};
`,
  },
  {
    // Width is the case that matters: this road's cost grows per column, so a
    // wide table is where a regression shows first.
    label: 'type road, 20 plain columns',
    // 2693 -> 2116, the same four changes.
    budget: 2116,
    body: plainCase(
      'p',
      20,
      plainKeys(20)
        .map((key) => `${key}: Integer<'${key}'>;`)
        .join(' '),
      (cols) => `type pSrc = PgTable<'t', {${cols}}>;`
    ),
  },
  {
    label: 'builder road, 20 plain columns',
    budget: 465,
    body: plainCase(
      'r',
      20,
      plainKeys(20)
        .map((key) => `${key}: integer('${key}'),`)
        .join(' '),
      (cols) => `const rSrcTable = pgTable('t', {${cols}});\ntype rSrc = typeof rSrcTable;`
    ),
  },
  {
    // The floor: columns named as the branded types the builders return, so no
    // normalization runs at all.
    label: 'pre-branded, 20 plain columns',
    budget: 436,
    body: plainCase(
      'q',
      20,
      plainKeys(20)
        .map((key) => `${key}: RtPgIntColumn<Int32, false, false, false>;`)
        .join(' '),
      (cols) => `type qSrc = PgBuilderTable<'t', {${cols}}>;`
    ),
  },
];

// Without these the budgets are meaningless: if module resolution breaks, every
// type collapses to `any`, the counts drop, and a downward-only ratchet goes
// green on a measurement of nothing. These only compile when the real formats
// and the real flags came through on BOTH roads.
const SHAPE_PINS = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type _sameRow = Expect<Equal<bRow, tRow>>;
// The branded formats, not the plain types: a column's length and its integer
// range must survive both roads, or the numbers above price the wrong thing.
type _insertDropsDefaulted = Expect<Equal<iNew['createdAt'], RTDate | undefined>>;
type _insertKeepsRequired = Expect<Equal<iNew['name'], RTString<{maxLength: 100}>>>;
type _plainIsNullable = Expect<Equal<pRow['c0'], Int32 | null>>;
export type _Pins = [_sameRow, _insertDropsDefaulted, _insertKeepsRequired, _plainIsNullable];
`;

const measured = new Map<string, number>();

describe('table declaration roads — type-instantiation budget', () => {
  beforeAll(() => {
    for (const roadCase of CASES) {
      const result = measure(roadCase.body);
      expect(result.errors, `"${roadCase.label}" should type-check cleanly:\n  ${result.errors.join('\n  ')}`).toEqual([]);
      measured.set(roadCase.label, result.netInstantiations);
    }
    const rows = CASES.map((c) => `  ${c.label.padEnd(40)}${String(measured.get(c.label)).padStart(7)}`).join('\n');
    // eslint-disable-next-line no-console
    console.log(`net instantiations by table declaration road:\n${rows}`);
  });

  afterAll(() => {
    writeRoadReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      cases: CASES.map((c): RoadCaseReport => ({label: c.label, netInstantiations: measured.get(c.label)!, budget: c.budget})),
    });
  });

  for (const roadCase of CASES) {
    it(`${roadCase.label} stays within its budget`, () => {
      expect(
        measured.get(roadCase.label),
        `"${roadCase.label}" cost ${measured.get(roadCase.label)} net instantiations, over its budget of ${roadCase.budget}`
      ).toBeLessThanOrEqual(roadCase.budget);
    });
  }

  it('both roads still carry the real formats and flags', () => {
    const all = CASES.map((c) => c.body).join('') + SHAPE_PINS;
    const result = measure(all);
    expect(result.errors, `shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
  });
});
