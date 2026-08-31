// What a table costs depending on HOW it was declared, over the REAL slim
// packages.
//
// The model pipeline suite next door measures one builder-road table through
// six layers. This one holds the layers still and varies the DECLARATION: the
// same columns written with the builders, written as a pure type, and written
// as the branded column types the builders return. That third form is not a
// design anyone authors; it is the floor. What stands between the type road and
// that floor is not a conversion pass any more (a column type IS the branded
// column now) but the price of being reflectable: the db name and config ride
// in the type, so twenty columns are twenty distinct types where the builder
// road's twenty are twenty references to one.
//
// Why it exists as a suite rather than a note in TYPE-COST.md: the numbers in
// that file went stale, and a stale number sent a whole change down the wrong
// path (it read three quarters of the type road's cost onto the modifier
// intersections, where the real figure is about an eighth). Measured beats
// remembered.
//
// Budgets are ONE-WAY DOWNWARD, the same rule the pipeline suite states: cheapen
// the types, never raise the number.
//
// ONE reviewed exception, and it is the whole of this suite's current numbers.
// When the table type became its own metadata, ONE type per dialect replaced the
// PgTable / PgBuilderTable pair, so the builder road now runs its columns record
// through TypedCols (a wholesale pass-through) where it used to skip it. That is
// about 2 a table, 10 on the twenty-column case, and the type road got a little
// cheaper in exchange. It was taken deliberately: two shapes for the same table,
// one per road, cost more in complexity than the instantiations are worth, and
// nothing downstream now has to know which road declared a table.

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
import {pgTable, varchar, integer, timestamp, uuid, text, serial, jsonb} from '@mionjs/drizzle-orm-pg-core';
import type {PgTable, RtPgIntColumn} from '@mionjs/drizzle-orm-pg-core';
import type {Varchar, Integer, Timestamp, Uuid, Text, Serial, Jsonb} from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel, InferInsertModel} from '@mionjs/drizzle-orm';
import type {Date as RTDate, String as RTString, Int32} from '@mionjs/run-types/formats';
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

const readWide = (prefix: string) => `
declare const ${prefix}row: ${prefix}Row;
export const ${prefix}0: number = ${prefix}row.id;
export const ${prefix}1: string = ${prefix}row.role;
export const ${prefix}2: number = ${prefix}row.seq;
export const ${prefix}3: string[] = ${prefix}row.tags;
export const ${prefix}4: {kind: string} | null = ${prefix}row.payload;
export const ${prefix}5: string | null = ${prefix}row.email;
export const ${prefix}6: Date = ${prefix}row.createdAt;
`;

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
    // 646 -> 568: the flat models read the column brand payload once per
    // column instead of probing it once per flag, which helps BOTH roads.
    budget: 570,
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
    // 1488 -> 1258 by cheapening the normalization, then -> 1045 by deleting
    // it: a column type expands straight to the branded column, so the record
    // takes TypedCols's wholesale branch and nothing is normalized per column.
    // Then -> 967 with the brand payload read once per column.
    budget: 968,
    body: `
type tSrc = PgTable<'users', {
  id: Uuid<'id', {primaryKey: true}>;
  name: Varchar<'name', {length: 100; notNull: true}>;
  age: Integer<'age', {notNull: true}>;
  role: Text<'role', {enum: ['admin', 'user']; notNull: true}>;
  createdAt: Timestamp<'created_at', {mode: 'date'; notNull: true; defaultNow: true}>;
}>;
type tRow = InferSelectModel<tSrc>;
${readMixed('t')}`,
  },
  {
    label: 'type road, 5 mixed columns + insert model',
    // 2125 -> 1895 -> 1673, the same two rounds.
    budget: 1434,
    body: `
type iSrc = PgTable<'users', {
  id: Uuid<'id', {primaryKey: true}>;
  name: Varchar<'name', {length: 100; notNull: true}>;
  age: Integer<'age', {notNull: true}>;
  role: Text<'role', {enum: ['admin', 'user']; notNull: true}>;
  createdAt: Timestamp<'created_at', {mode: 'date'; notNull: true; defaultNow: true}>;
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
    // 2693 -> 2116 -> 1595, the same two rounds. Width is where deleting the
    // normalization pays most: it ran once per column.
    budget: 1341,
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
    budget: 345,
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
    budget: 326,
    body: plainCase(
      'q',
      20,
      plainKeys(20)
        .map((key) => `${key}: RtPgIntColumn<Int32, false, false, false>;`)
        .join(' '),
      (cols) => `type qSrc = PgTable<'t', {${cols}}>;`
    ),
  },
  {
    // The WIDE vocabulary, both roads: intrinsic base flags (serial), an enum,
    // identity, array, $type, unique and defaultNow. The narrow cases above can
    // flatter a change that only helps one column shape.
    label: 'type road, wide vocabulary',
    // 1560 with the intersected markers, measured on the same shapes.
    budget: 1170,
    body: `
type wSrc = PgTable<'w', {
  id: Serial<'id', {primaryKey: true}>;
  role: Text<'role', {enum: ['admin', 'user']; notNull: true}>;
  seq: Integer<'seq', {generatedAlwaysAsIdentity: true}>;
  tags: Text<'tags', {array: true; notNull: true}>;
  payload: Jsonb<'payload', {$type: [{kind: string}]}>;
  email: Text<'email', {unique: ['uq_email']}>;
  createdAt: Timestamp<'created_at', {mode: 'date'; notNull: true; defaultNow: true}>;
}>;
type wRow = InferSelectModel<wSrc>;
${readWide('w')}`,
  },
  {
    label: 'builder road, wide vocabulary',
    budget: 688,
    body: `
const vSrcTable = pgTable('w', {
  id: serial('id').primaryKey(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  seq: integer('seq').generatedAlwaysAsIdentity(),
  tags: text('tags').array().notNull(),
  payload: jsonb('payload').$type<{kind: string}>(),
  email: text('email').unique('uq_email'),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
type vSrc = typeof vSrcTable;
type vRow = InferSelectModel<vSrc>;
${readWide('v')}`,
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
// The wide vocabulary agrees too, on the select AND the insert model: base
// flags, identity, array, $type and enum all have to land the same way.
type _sameWideRow = Expect<Equal<vRow, wRow>>;
type _sameWideInsert = Expect<Equal<InferInsertModel<vSrc>, InferInsertModel<wSrc>>>;
export type _Pins = [_sameRow, _insertDropsDefaulted, _insertKeepsRequired, _plainIsNullable, _sameWideRow, _sameWideInsert];
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
