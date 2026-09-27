// What a table costs depending on HOW it was declared, over the REAL slim packages, in every dialect.
//
// The model pipeline suite measures one builder table through six layers. This one holds the layers still
// and varies the DECLARATION: the same columns written with the builders, written as a hand-written table type, and
// written as the bare Column interface the column types alias (the floor nobody authors). A builder table IS its
// hand-written twin, so the two roads differ only in what the builders' props checks and name lifting cost.
//
// Why it exists as a suite rather than a note in TYPE-COST.md: the numbers in that file went stale, and a stale
// number sent a whole change down the wrong path. Measured beats remembered.
//
// Budgets are ONE-WAY DOWNWARD, the same rule the pipeline suite states: cheapen the types, never raise the number.
// Every raise is a reviewed exception commented where the budget lives.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMeasurer} from '../../run-types/test/types/compileHarness.ts';
import {RESOLVING_OPTIONS, type DialectName} from './modelPipelineHarness.ts';
import {writeRoadReport, type RoadCaseReport} from './report.ts';

const drizzleVersion: string = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  .dependencies['drizzle-orm'];

/** Virtual snippet file at a REAL path inside this package, so the bare
 *  imports resolve through its node_modules exactly as a consumer's would. */
const SNIPPET_FILE = fileURLToPath(new URL('./__typeRoadCase__.ts', import.meta.url));

/** One column, spelled as a column type and as a builder call. */
interface Col {
  key: string;
  type: string;
  builder: string;
  /** The db name, only when it differs from the key. */
  db?: string;
}
const col = (key: string, type: string, builder: string, db?: string): Col => ({key, type, builder, db});

/** Everything a dialect spells differently; the cases below are the same for all three. */
interface RoadDialect {
  dialect: DialectName;
  /** The builders and column types the cases name, imported in the preamble. */
  builders: string;
  types: string;
  tableFn: string;
  tableType: string;
  mixed: Col[];
  mixedReads: Array<[string, string]>;
  /** A row the insert model of the mixed table accepts. */
  insertRow: string;
  /** The plain nullable int column: builder, column type, the bare Column it aliases, and its row format. */
  int: {fn: string; type: string; bare: string; format: string};
  wide: Col[];
  wideReads: Array<[string, string]>;
  budgets: Record<CaseLabel, number>;
}

/** The preamble, so module resolution never lands in a measurement. */
const importHeader = (road: RoadDialect) => `
import {${road.builders}} from '@mionjs/drizzle-orm-${road.dialect}-core';
import type {${road.tableType}, ${road.types}} from '@mionjs/drizzle-orm-${road.dialect}-core';
import type {Column, InferSelectModel, InferInsertModel, NoProps} from '@mionjs/drizzle-orm';
import {$type} from '@mionjs/drizzle-orm';
import type {Date as RTDate, String as RTString, Int32, Integer as RTInteger} from '@mionjs/run-types/formats';
export {};
`;

const tableType = (road: RoadDialect, name: string, cols: Col[]) => {
  const dbNames = cols.filter((c) => c.db).map((c) => `${c.key}: '${c.db}'`);
  const record = cols.map((c) => `  ${c.key}: ${c.type};`).join('\n');
  return `${road.tableType}<'${name}', {\n${record}\n}${dbNames.length ? `, [], {${dbNames.join('; ')}}` : ''}>`;
};
const builderTable = (road: RoadDialect, name: string, cols: Col[]) =>
  `${road.tableFn}('${name}', {\n${cols.map((c) => `  ${c.key}: ${c.builder},`).join('\n')}\n})`;

// Reading the row into annotated consts is what forces the work. A bare
// `type Row = InferSelectModel<...>` measures almost nothing, because the
// checker stays lazy and the case looks free.
const readRow = (prefix: string, reads: Array<[string, string]>) =>
  `declare const ${prefix}row: ${prefix}Row;\n` +
  reads.map(([key, type], i) => `export const ${prefix}${i}: ${type} = ${prefix}row.${key};`).join('\n');

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

const CASE_LABELS = [
  'builder road, 5 mixed columns',
  'type road, 5 mixed columns',
  'type road, 5 mixed columns + insert model',
  'type road, 20 plain columns',
  'builder road, 20 plain columns',
  'bare Column interface, 20 plain columns',
  'type road, wide vocabulary',
  'builder road, wide vocabulary',
] as const;
type CaseLabel = (typeof CASE_LABELS)[number];

/** Each case's snippet in one dialect. */
function caseBody(road: RoadDialect, label: CaseLabel): string {
  const {mixed, mixedReads, wide, wideReads, int} = road;
  switch (label) {
    case 'builder road, 5 mixed columns':
      return `
const bSrc = ${builderTable(road, 'users', mixed)};
type bRow = InferSelectModel<typeof bSrc>;
${readRow('b', mixedReads)}`;
    case 'type road, 5 mixed columns':
      return `
type tSrc = ${tableType(road, 'users', mixed)};
type tRow = InferSelectModel<tSrc>;
${readRow('t', mixedReads)}`;
    case 'type road, 5 mixed columns + insert model':
      return `
type iSrc = ${tableType(road, 'users', mixed)};
type iRow = InferSelectModel<iSrc>;
type iNew = InferInsertModel<iSrc>;
${readRow('i', mixedReads)}
export const iNewUser: iNew = ${road.insertRow};
`;
    // Width is the case that matters: a regression that grows per column shows first on a wide table.
    case 'type road, 20 plain columns':
      return plainCase(
        'p',
        20,
        plainKeys(20)
          .map((key) => `${key}: ${int.type};`)
          .join(' '),
        (cols) => `type pSrc = ${road.tableType}<'t', {${cols}}>;`
      );
    case 'builder road, 20 plain columns':
      return plainCase(
        'r',
        20,
        plainKeys(20)
          .map((key) => `${key}: ${int.fn}('${key}'),`)
          .join(' '),
        (cols) => `const rSrcTable = ${road.tableFn}('t', {${cols}});\ntype rSrc = typeof rSrcTable;`
      );
    // The floor: the bare Column interface every column type aliases, so no alias or props check runs at all.
    case 'bare Column interface, 20 plain columns':
      return plainCase(
        'q',
        20,
        plainKeys(20)
          .map((key) => `${key}: ${int.bare};`)
          .join(' '),
        (cols) => `type qSrc = ${road.tableType}<'t', {${cols}}>;`
      );
    // The WIDE vocabulary, both roads. The narrow cases above can flatter a change that only helps one column shape.
    case 'type road, wide vocabulary':
      return `
type wSrc = ${tableType(road, 'w', wide)};
type wRow = InferSelectModel<wSrc>;
${readRow('w', wideReads)}`;
    case 'builder road, wide vocabulary':
      return `
const vSrcTable = ${builderTable(road, 'w', wide)};
type vSrc = typeof vSrcTable;
type vRow = InferSelectModel<vSrc>;
${readRow('v', wideReads)}`;
  }
}

const MIXED_READS: Array<[string, string]> = [
  ['name', 'string'],
  ['age', 'number'],
  ['role', 'string'],
  ['createdAt', 'Date'],
];
const ROLE = col('role', `Text<{enum: ['admin', 'user']; notNull: true}>`, `text({enum: ['admin', 'user'], notNull: true})`);

const DIALECTS: RoadDialect[] = [
  {
    dialect: 'pg',
    builders: 'pgTable, varchar, integer, timestamp, uuid, text, serial, jsonb',
    types: 'Varchar, Integer, Timestamp, Uuid, Text, Serial, Jsonb',
    tableFn: 'pgTable',
    tableType: 'PgTable',
    mixed: [
      col('id', `Uuid<{primaryKey: true}>`, `uuid({primaryKey: true})`),
      col('name', `Varchar<{length: 100; notNull: true}>`, `varchar({length: 100, notNull: true})`),
      col('age', `Integer<{notNull: true}>`, `integer({notNull: true})`),
      ROLE,
      col(
        'createdAt',
        `Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
        `timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`,
        'created_at'
      ),
    ],
    mixedReads: [['id', 'string'], ...MIXED_READS],
    insertRow: `{id: 'x' as never, name: 'a', age: 1, role: 'admin'}`,
    int: {fn: 'integer', type: 'Integer', bare: `Column<'integer', NoProps, Int32>`, format: 'Int32'},
    // Intrinsic base flags (serial), an enum, identity, array, $type, unique and defaultNow.
    wide: [
      col('id', `Serial<{primaryKey: true}>`, `serial({primaryKey: true})`),
      ROLE,
      col('seq', `Integer<{generatedAlwaysAsIdentity: true}>`, `integer({generatedAlwaysAsIdentity: true})`),
      col('tags', `Text<{array: true; notNull: true}>`, `text({array: true, notNull: true})`),
      col('payload', `Jsonb<{$type: [{kind: string}]}>`, `jsonb({$type: $type<{kind: string}>()})`),
      col('email', `Text<{unique: ['uq_email']}>`, `text({unique: ['uq_email']})`),
      col(
        'createdAt',
        `Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
        `timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`,
        'created_at'
      ),
    ],
    wideReads: [
      ['id', 'number'],
      ['role', 'string'],
      ['seq', 'number'],
      ['tags', 'string[]'],
      ['payload', '{kind: string} | null'],
      ['email', 'string | null'],
      ['createdAt', 'Date'],
    ],
    budgets: {
      // 570 -> 1089: a REVIEWED EXCEPTION, single-call builders. The declaration costs 647 (overload choice, the
      // stray-key check, name lifting) and the models derive flags from props where chained builders carried them.
      // Precomputing the flags in the builder cut this to 990 but broke builder = hand-written (TYPE-COST.md, attempt 14).
      'builder road, 5 mixed columns': 1089,
      // 968 -> 678: a column type holds its raw props and no db name, flags derived only where a model reads them.
      'type road, 5 mixed columns': 678,
      // 1434 -> 1271, the same change.
      'type road, 5 mixed columns + insert model': 1271,
      // 1341 -> 299: one shared column type for the twenty columns, the db names on the table.
      'type road, 20 plain columns': 299,
      // 345 -> 573: a REVIEWED EXCEPTION, single-call builders (see the five-column case).
      'builder road, 20 plain columns': 573,
      // The floor, 326 when it was the chained kind.
      'bare Column interface, 20 plain columns': 295,
      // 1170 -> 866, the same change as the narrow type road.
      'type road, wide vocabulary': 866,
      // 676 -> 1352: a REVIEWED EXCEPTION, single-call builders (see the five-column case).
      'builder road, wide vocabulary': 1352,
    },
  },
  {
    dialect: 'mysql',
    builders: 'mysqlTable, varchar, int, timestamp, text, serial, json',
    types: 'Varchar, Int, Timestamp, Text, Serial, Json',
    tableFn: 'mysqlTable',
    tableType: 'MysqlTable',
    // mysql has no uuid column: a serial key.
    mixed: [
      col('id', `Serial<{primaryKey: true}>`, `serial({primaryKey: true})`),
      col('name', `Varchar<{length: 100; notNull: true}>`, `varchar({length: 100, notNull: true})`),
      col('age', `Int<{notNull: true}>`, `int({notNull: true})`),
      ROLE,
      col(
        'createdAt',
        `Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
        `timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`,
        'created_at'
      ),
    ],
    mixedReads: [['id', 'number'], ...MIXED_READS],
    insertRow: `{name: 'a', age: 1, role: 'admin'}`,
    int: {fn: 'int', type: 'Int', bare: `Column<'int', NoProps, Int32>`, format: 'Int32'},
    // mysql has no identity or array columns: autoincrement stands in for identity, and no tags column.
    wide: [
      col('id', `Serial<{primaryKey: true}>`, `serial({primaryKey: true})`),
      ROLE,
      col('seq', `Int<{notNull: true; autoincrement: true}>`, `int({notNull: true, autoincrement: true})`),
      col('payload', `Json<{$type: [{kind: string}]}>`, `json({$type: $type<{kind: string}>()})`),
      col('email', `Varchar<{length: 200; unique: ['uq_email']}>`, `varchar({length: 200, unique: ['uq_email']})`),
      col(
        'createdAt',
        `Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
        `timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`,
        'created_at'
      ),
    ],
    wideReads: [
      ['id', 'number'],
      ['role', 'string'],
      ['seq', 'number'],
      ['payload', '{kind: string} | null'],
      ['email', 'string | null'],
      ['createdAt', 'Date'],
    ],
    budgets: {
      'builder road, 5 mixed columns': 1112,
      'type road, 5 mixed columns': 707,
      'type road, 5 mixed columns + insert model': 1263,
      'type road, 20 plain columns': 317,
      'builder road, 20 plain columns': 592,
      'bare Column interface, 20 plain columns': 295,
      'type road, wide vocabulary': 865,
      'builder road, wide vocabulary': 1351,
    },
  },
  {
    dialect: 'sqlite',
    builders: 'sqliteTable, text, integer',
    types: 'Text, Integer',
    tableFn: 'sqliteTable',
    tableType: 'SqliteTable',
    // sqlite has no uuid, varchar or timestamp: an integer key, a text with a length, an integer in timestamp mode.
    mixed: [
      col('id', `Integer<{primaryKey: true}>`, `integer({primaryKey: true})`),
      col('name', `Text<{length: 100; notNull: true}>`, `text({length: 100, notNull: true})`),
      col('age', `Integer<{notNull: true}>`, `integer({notNull: true})`),
      ROLE,
      col(
        'createdAt',
        `Integer<{mode: 'timestamp'; notNull: true; $defaultFn: true}>`,
        `integer('created_at', {mode: 'timestamp', notNull: true, $defaultFn: [() => new Date()]})`,
        'created_at'
      ),
    ],
    mixedReads: [['id', 'number'], ...MIXED_READS],
    insertRow: `{name: 'a', age: 1, role: 'admin'}`,
    int: {
      fn: 'integer',
      type: 'Integer',
      bare: `Column<'integer', NoProps, RTInteger, 'primaryKeyHasDefault'>`,
      format: 'RTInteger',
    },
    // sqlite has no identity or array columns, so no seq or tags column; json is a text mode.
    wide: [
      col('id', `Integer<{primaryKey: [{autoIncrement: true}]}>`, `integer({primaryKey: [{autoIncrement: true}]})`),
      ROLE,
      col('payload', `Text<{mode: 'json'; $type: [{kind: string}]}>`, `text({mode: 'json', $type: $type<{kind: string}>()})`),
      col('email', `Text<{unique: ['uq_email']}>`, `text({unique: ['uq_email']})`),
      col(
        'createdAt',
        `Integer<{mode: 'timestamp'; notNull: true; $defaultFn: true}>`,
        `integer('created_at', {mode: 'timestamp', notNull: true, $defaultFn: [() => new Date()]})`,
        'created_at'
      ),
    ],
    wideReads: [
      ['id', 'number'],
      ['role', 'string'],
      ['payload', '{kind: string} | null'],
      ['email', 'string | null'],
      ['createdAt', 'Date'],
    ],
    budgets: {
      'builder road, 5 mixed columns': 1025,
      'type road, 5 mixed columns': 667,
      'type road, 5 mixed columns + insert model': 1239,
      'type road, 20 plain columns': 320,
      'builder road, 20 plain columns': 595,
      'bare Column interface, 20 plain columns': 295,
      'type road, wide vocabulary': 767,
      'builder road, wide vocabulary': 1149,
    },
  },
];

// Without these the budgets are meaningless: if module resolution breaks, every
// type collapses to `any`, the counts drop, and a downward-only ratchet goes
// green on a measurement of nothing. These only compile when the real formats
// and the real flags came through on BOTH roads.
const shapePins = (road: RoadDialect) => `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type _sameRow = Expect<Equal<bRow, tRow>>;
// The branded formats, not the plain types: a column's length and its integer
// range must survive both roads, or the numbers above price the wrong thing.
type _insertDropsDefaulted = Expect<Equal<iNew['createdAt'], RTDate | undefined>>;
type _insertKeepsRequired = Expect<Equal<iNew['name'], RTString<{maxLength: 100}>>>;
type _plainIsNullable = Expect<Equal<pRow['c0'], ${road.int.format} | null>>;
// The wide vocabulary agrees too, on the select AND the insert model.
type _sameWideRow = Expect<Equal<vRow, wRow>>;
type _sameWideInsert = Expect<Equal<InferInsertModel<vSrc>, InferInsertModel<wSrc>>>;
// A builder table IS its hand-written twin.
type _sameTable = Expect<Equal<typeof bSrc, tSrc>>;
type _sameWideTable = Expect<Equal<vSrc, wSrc>>;
export type _Pins = [
  _sameRow,
  _insertDropsDefaulted,
  _insertKeepsRequired,
  _plainIsNullable,
  _sameWideRow,
  _sameWideInsert,
  _sameTable,
  _sameWideTable,
];
`;

const measured = new Map<string, number>();

describe('table declaration roads, type-instantiation budget', () => {
  afterAll(() => {
    if (measured.size !== DIALECTS.length * CASE_LABELS.length) return;
    writeRoadReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      cases: DIALECTS.flatMap(({dialect, budgets}) =>
        CASE_LABELS.map(
          (label): RoadCaseReport => ({
            dialect,
            label,
            netInstantiations: measured.get(`${dialect}: ${label}`)!,
            budget: budgets[label],
          })
        )
      ),
    });
  });

  for (const road of DIALECTS) {
    const {dialect, budgets} = road;
    const measure = makeMeasurer(importHeader(road), {
      options: RESOLVING_OPTIONS,
      snippetFile: SNIPPET_FILE,
      diagnosticsScope: 'snippet',
    });

    describe(dialect, () => {
      beforeAll(() => {
        for (const label of CASE_LABELS) {
          const result = measure(caseBody(road, label));
          expect(result.errors, `${dialect} "${label}" should type-check cleanly:\n  ${result.errors.join('\n  ')}`).toEqual([]);
          measured.set(`${dialect}: ${label}`, result.netInstantiations);
        }
        const rows = CASE_LABELS.map(
          (label) => `  ${label.padEnd(42)}${String(measured.get(`${dialect}: ${label}`)).padStart(7)}`
        ).join('\n');
        // eslint-disable-next-line no-console
        console.log(`${dialect}: net instantiations by table declaration road:\n${rows}`);
      });

      for (const label of CASE_LABELS) {
        it(`${dialect}: ${label} stays within its budget`, () => {
          const cost = measured.get(`${dialect}: ${label}`);
          expect(
            cost,
            `${dialect} "${label}" cost ${cost} net instantiations, over its budget of ${budgets[label]}`
          ).toBeLessThanOrEqual(budgets[label]);
        });
      }

      it(`${dialect}: both roads still carry the real formats and flags`, () => {
        const all = CASE_LABELS.map((label) => caseBody(road, label)).join('') + shapePins(road);
        const result = measure(all);
        expect(result.errors, `${dialect} shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
      });
    });
  }
});
