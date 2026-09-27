// Column formats over the REAL packages: each shape declared as a hand-written table type and with the builders,
// read through the same models, in every dialect. Both lines carry budgets (one-way downward). The chained columns
// these replaced cost what TYPE-COST.md records.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMeasurer} from '../../run-types/test/types/compileHarness.ts';
import {RESOLVING_OPTIONS} from './modelPipelineHarness.ts';
import {writeColumnFormatsReport, type ColumnFormatsRow} from './report.ts';

const drizzleVersion: string = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  .dependencies['drizzle-orm'];

const SNIPPET_FILE = fileURLToPath(new URL('./__columnFormatsCase__.ts', import.meta.url));

const importHeader = (dialect: string, db: string) => `
import * as n from '@mionjs/drizzle-orm-${dialect}-core';
import {toDrizzle as nToDrizzle} from '@mionjs/drizzle-orm-${dialect}-core/drizzle';
import type {InferSelectModel as NSelect, InferInsertModel as NInsert, TableRef as NTableRef} from '@mionjs/drizzle-orm';
import {refineTableType as nRefine, tableRef as nTableRef, $type as n$type} from '@mionjs/drizzle-orm';
${db}
export {};
`;

type Line = 'types' | 'builders';
const LINES: Line[] = ['types', 'builders'];

// ── Column spellings per line ────────────────────────────────────────────────

interface ColSpec {
  key: string;
  /** The explicit db name; unset for a nameless column. */
  db?: string;
  /** The column type and the builder call. */
  newT: string;
  newB: string;
}
const col = (key: string, db: string | undefined, newT: string, newB: string): ColSpec => ({key, db, newT, newB});

const PG_MIXED: ColSpec[] = [
  col('id', 'id', `n.Uuid<{primaryKey: true}>`, `n.uuid('id', {primaryKey: true})`),
  col('name', 'name', `n.Varchar<{length: 100; notNull: true}>`, `n.varchar('name', {length: 100, notNull: true})`),
  col('age', 'age', `n.Integer<{notNull: true}>`, `n.integer('age', {notNull: true})`),
  col(
    'role',
    'role',
    `n.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `n.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `n.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const PG_WIDE: ColSpec[] = [
  col('id', 'id', `n.Serial<{primaryKey: true}>`, `n.serial('id', {primaryKey: true})`),
  col(
    'role',
    'role',
    `n.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `n.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col('seq', 'seq', `n.Integer<{generatedAlwaysAsIdentity: true}>`, `n.integer('seq', {generatedAlwaysAsIdentity: true})`),
  col('tags', 'tags', `n.Text<{array: true; notNull: true}>`, `n.text('tags', {array: true, notNull: true})`),
  col('payload', 'payload', `n.Jsonb<{$type: [{kind: string}]}>`, `n.jsonb('payload', {$type: n$type<{kind: string}>()})`),
  col('email', 'email', `n.Text<{unique: ['uq_email']}>`, `n.text('email', {unique: ['uq_email']})`),
  col(
    'createdAt',
    'created_at',
    `n.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const MYSQL_MIXED: ColSpec[] = [
  col('id', 'id', `n.Serial<{primaryKey: true}>`, `n.serial('id', {primaryKey: true})`),
  col('name', 'name', `n.Varchar<{length: 100; notNull: true}>`, `n.varchar('name', {length: 100, notNull: true})`),
  col('age', 'age', `n.Int<{notNull: true}>`, `n.int('age', {notNull: true})`),
  col(
    'role',
    'role',
    `n.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `n.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `n.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const MYSQL_WIDE: ColSpec[] = [
  col('id', 'id', `n.Serial<{primaryKey: true}>`, `n.serial('id', {primaryKey: true})`),
  MYSQL_MIXED[3],
  col(
    'seq',
    'seq',
    `n.Int<{unsigned: true; notNull: true; autoincrement: true}>`,
    `n.int('seq', {unsigned: true, notNull: true, autoincrement: true})`
  ),
  col('payload', 'payload', `n.Json<{$type: [{kind: string}]}>`, `n.json('payload', {$type: n$type<{kind: string}>()})`),
  col(
    'email',
    'email',
    `n.Varchar<{length: 200; unique: ['uq_email']}>`,
    `n.varchar('email', {length: 200, unique: ['uq_email']})`
  ),
  col(
    'updatedAt',
    'updated_at',
    `n.Timestamp<{mode: 'date'; notNull: true; defaultNow: true; onUpdateNow: true}>`,
    `n.timestamp('updated_at', {mode: 'date', notNull: true, defaultNow: true, onUpdateNow: true})`
  ),
  col('big', 'big', `n.Bigint<{mode: 'bigint'; unsigned: true}>`, `n.bigint('big', {mode: 'bigint', unsigned: true})`),
];
const SQLITE_MIXED: ColSpec[] = [
  col('id', 'id', `n.Integer<{primaryKey: true}>`, `n.integer('id', {primaryKey: true})`),
  col('name', 'name', `n.Text<{length: 100; notNull: true}>`, `n.text('name', {length: 100, notNull: true})`),
  col('age', 'age', `n.Integer<{notNull: true}>`, `n.integer('age', {notNull: true})`),
  col(
    'role',
    'role',
    `n.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `n.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `n.Integer<{mode: 'timestamp'; notNull: true}>`,
    `n.integer('created_at', {mode: 'timestamp', notNull: true})`
  ),
];
const SQLITE_WIDE: ColSpec[] = [
  col('id', 'id', `n.Integer<{primaryKey: [{autoIncrement: true}]}>`, `n.integer('id', {primaryKey: [{autoIncrement: true}]})`),
  SQLITE_MIXED[3],
  col(
    'flag',
    'flag',
    `n.Integer<{mode: 'boolean'; notNull: true; default: [false]}>`,
    `n.integer('flag', {mode: 'boolean', notNull: true, default: [false]})`
  ),
  col(
    'payload',
    'payload',
    `n.Text<{mode: 'json'; $type: [{kind: string}]}>`,
    `n.text('payload', {mode: 'json', $type: n$type<{kind: string}>()})`
  ),
  col('email', 'email', `n.Text<{unique: ['uq_email']}>`, `n.text('email', {unique: ['uq_email']})`),
  col('amount', 'amount', `n.Real<{notNull: true}>`, `n.real('amount', {notNull: true})`),
  col('big', 'big', `n.Blob<{mode: 'bigint'}>`, `n.blob('big', {mode: 'bigint'})`),
];

/** Everything a dialect spells differently; the shapes below are the same for all three. */
interface Dialect {
  dialect: 'pg' | 'mysql' | 'sqlite';
  measure: ReturnType<typeof makeMeasurer>;
  tableFn: string;
  tableType: string;
  mixed: ColSpec[];
  mixedReads: Array<[string, string]>;
  wide: ColSpec[];
  wideReads: Array<[string, string]>;
  /** The plain nullable int column. */
  int: {fn: string; type: string};
  /** The referenced table's primary key: its column type and builder call. */
  refId: {newT: string; newB: string};
  /** A row the insert model of the mixed table accepts. */
  insertRow: string;
  /** The queries over `${p}D`, the toDrizzle of the mixed table. */
  queries: (p: string) => string;
  budgets: Record<ShapeLabel, Budget>;
}

const plain = (int: Dialect['int'], count: number, named: boolean): ColSpec[] =>
  Array.from({length: count}, (_, i) => {
    const key = `c${i}`;
    return named
      ? col(key, key, `n.${int.type}`, `n.${int.fn}('${key}')`)
      : col(key, undefined, `n.${int.type}`, `n.${int.fn}()`);
  });

/** A table declaration on one line, as `${prefix}T` (the table type). */
function declare(names: Dialect, line: Line, prefix: string, table: string, cols: ColSpec[]): string {
  const {tableFn, tableType} = names;
  if (line === 'builders')
    return `const ${prefix}V = n.${tableFn}('${table}', {${cols.map((x) => `${x.key}: ${x.newB},`).join(' ')}});\ntype ${prefix}T = typeof ${prefix}V;`;
  const names_ = cols.filter((x) => x.db !== undefined && x.db !== x.key).map((x) => `${x.key}: '${x.db}'`);
  return `type ${prefix}T = n.${tableType}<'${table}', {${cols.map((x) => `${x.key}: ${x.newT};`).join(' ')}}${names_.length ? `, [], {${names_.join('; ')}}` : ''}>;`;
}
const select = (t: string) => `NSelect<${t}>`;
const insert = (t: string) => `NInsert<${t}>`;

// Reading the row into annotated consts is what forces the work: a bare alias measures almost nothing.
const readRow = (p: string, reads: Array<[string, string]>) =>
  `declare const ${p}row: ${p}Row;\n` +
  reads.map(([key, type], i) => `export const ${p}${i}: ${type} = ${p}row.${key};`).join('\n');
const readPlain = (p: string, count: number) =>
  `declare const ${p}row: ${p}Row;\n` +
  Array.from({length: count}, (_, i) => `export const ${p}${i}: number | null = ${p}row.c${i};`).join('\n');

interface Budget {
  types: number;
  builders: number;
}
const SHAPE_LABELS = [
  '5 mixed, select',
  '5 mixed, select + insert',
  '10 plain, db name per column',
  '20 plain, db name per column',
  '40 plain, db name per column',
  '20 plain, nameless',
  'wide vocabulary, select',
  'two tables, one reference',
  'refineTableType, select',
  'toDrizzle + select / insert / update query',
] as const;
type ShapeLabel = (typeof SHAPE_LABELS)[number];

/** Each shape's snippet for one line of one dialect. */
function shapeBody(names: Dialect, label: ShapeLabel, line: Line, p: string): string {
  const {mixed, mixedReads, wide, wideReads, int, refId, tableFn, tableType} = names;
  const plainShape = (count: number, named: boolean) =>
    `${declare(names, line, p, 't', plain(int, count, named))}\ntype ${p}Row = ${select(`${p}T`)};\n${readPlain(p, count)}`;
  switch (label) {
    case '5 mixed, select':
      return `${declare(names, line, p, 'users', mixed)}\ntype ${p}Row = ${select(`${p}T`)};\n${readRow(p, mixedReads)}`;
    case '5 mixed, select + insert':
      return `${declare(names, line, p, 'users', mixed)}\ntype ${p}Row = ${select(`${p}T`)};\ntype ${p}New = ${insert(`${p}T`)};\n${readRow(p, mixedReads)}
export const ${p}NewUser: ${p}New = ${names.insertRow};`;
    case '10 plain, db name per column':
      return plainShape(10, true);
    case '20 plain, db name per column':
      return plainShape(20, true);
    case '40 plain, db name per column':
      return plainShape(40, true);
    case '20 plain, nameless':
      return plainShape(20, false);
    case 'wide vocabulary, select':
      return `${declare(names, line, p, 'w', wide)}\ntype ${p}Row = ${select(`${p}T`)};\n${readRow(p, wideReads)}`;
    case 'two tables, one reference': {
      const read = (model: string) => `declare const ${p}row: ${model}; export const ${p}t: number | null = ${p}row.teamId;`;
      if (line === 'builders')
        return `const ${p}A = n.${tableFn}('teams', {id: ${refId.newB}});
const ${p}B = n.${tableFn}('members', {id: ${refId.newB}, teamId: n.${int.fn}('team_id', {references: [() => nTableRef(${p}A, 'id')]})});
${read(`NSelect<typeof ${p}B>`)}`;
      return `type ${p}A = n.${tableType}<'teams', {id: ${refId.newT}}>;
type ${p}B = n.${tableType}<'members', {id: ${refId.newT}; teamId: n.${int.type}<{references: [NTableRef<${p}A, 'id'>]}>}, [], {teamId: 'team_id'}>;
${read(`NSelect<${p}B>`)}`;
    }
    case 'refineTableType, select': {
      const source = line === 'builders' ? `${p}V` : `({} as ${p}T)`;
      return `${declare(names, line, p, 'users', mixed)}
const ${p}R = nRefine(${source}, {name: {maxLength: 50}});
type ${p}Row = ${select(`typeof ${p}R`)};\n${readRow(p, mixedReads)}`;
    }
    case 'toDrizzle + select / insert / update query': {
      const source = line === 'builders' ? `${p}V` : `({} as ${p}T)`;
      return `${declare(names, line, p, 'users', mixed)}\nconst ${p}D = nToDrizzle(${source});\n${names.queries(p)}`;
    }
  }
}

const measurerFor = (dialect: string, db: string) =>
  makeMeasurer(importHeader(dialect, db), {options: RESOLVING_OPTIONS, snippetFile: SNIPPET_FILE, diagnosticsScope: 'snippet'});
const MIXED_READS: Array<[string, string]> = [
  ['name', 'string'],
  ['age', 'number'],
  ['role', 'string'],
  ['createdAt', 'Date'],
];
const QUERY_READS = (p: string) => `const ${p}Q = db.select().from(${p}D);
declare const ${p}rows: Awaited<typeof ${p}Q>;
export const ${p}n: string = ${p}rows[0]!.name;
export const ${p}w: Date = ${p}rows[0]!.createdAt;`;

const DIALECTS: Dialect[] = [
  {
    dialect: 'pg',
    measure: measurerFor(
      'pg',
      `import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';\ndeclare const db: PgDatabase<PgQueryResultHKT>;`
    ),
    tableFn: 'pgTable',
    tableType: 'PgTable',
    mixed: PG_MIXED,
    mixedReads: [['id', 'string'], ...MIXED_READS],
    wide: PG_WIDE,
    wideReads: [
      ['id', 'number'],
      ['role', 'string'],
      ['seq', 'number'],
      ['tags', 'string[]'],
      ['payload', '{kind: string} | null'],
      ['email', 'string | null'],
      ['createdAt', 'Date'],
    ],
    int: {fn: 'integer', type: 'Integer'},
    refId: {
      newT: `n.Serial<{primaryKey: true}>`,
      newB: `n.serial('id', {primaryKey: true})`,
    },
    insertRow: `{id: 'x' as never, name: 'a', age: 1, role: 'admin'}`,
    queries: (p) => `${QUERY_READS(p)}
export const ${p}i = db.insert(${p}D).values({id: 'x', name: 'a', age: 21, role: 'user'});
export const ${p}u = db.update(${p}D).set({age: 31});`,
    budgets: {
      // 539 -> 683 and 971 -> 1160: a REVIEWED EXCEPTION, props reject stray modifier keys (Only<P, Allowed>, about 30 per configured column).
      '5 mixed, select': {types: 683, builders: 1160},
      // 1132 -> 1276 and 1638 -> 1827: a REVIEWED EXCEPTION, props reject stray modifier keys.
      // 1827 -> 1828: a REVIEWED EXCEPTION, Writable leaves a $type tuple alone so a nominal brand survives.
      '5 mixed, select + insert': {types: 1276, builders: 1828},
      '10 plain, db name per column': {types: 210, builders: 363},
      '20 plain, db name per column': {types: 300, builders: 573},
      '40 plain, db name per column': {types: 480, builders: 993},
      '20 plain, nameless': {types: 300, builders: 532},
      // 702 -> 873 and 1293 -> 1516: a REVIEWED EXCEPTION, props reject stray modifier keys.
      // 1516 -> 1461: lowered, a $type tuple left unmapped is cheaper.
      'wide vocabulary, select': {types: 873, builders: 1461},
      // 160 -> 212: a REVIEWED EXCEPTION, TableRef checks the column key and takes a name for self-references.
      // 212 -> 266 and 423 -> 494: a REVIEWED EXCEPTION, props reject stray modifier keys.
      'two tables, one reference': {types: 266, builders: 494},
      // 1277 -> 1421 and 1729 -> 1918: a REVIEWED EXCEPTION, props reject stray modifier keys.
      'refineTableType, select': {types: 1421, builders: 1918},
      // 8812 -> 8956 and 9915 -> 10104: a REVIEWED EXCEPTION, props reject stray modifier keys.
      // 10104 -> 10105: a REVIEWED EXCEPTION, Writable leaves a $type tuple alone so a nominal brand survives.
      'toDrizzle + select / insert / update query': {types: 8956, builders: 10105},
    },
  },
  {
    dialect: 'mysql',
    measure: measurerFor(
      'mysql',
      `import type {MySqlDatabase, MySqlQueryResultHKT, PreparedQueryHKTBase} from 'drizzle-orm/mysql-core';\ndeclare const db: MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase>;`
    ),
    tableFn: 'mysqlTable',
    tableType: 'MysqlTable',
    mixed: MYSQL_MIXED,
    mixedReads: [['id', 'number'], ...MIXED_READS],
    wide: MYSQL_WIDE,
    wideReads: [
      ['id', 'number'],
      ['role', 'string'],
      ['seq', 'number'],
      ['payload', '{kind: string} | null'],
      ['email', 'string | null'],
      ['updatedAt', 'Date'],
      ['big', 'bigint | null'],
    ],
    int: {fn: 'int', type: 'Int'},
    refId: {
      newT: `n.Serial<{primaryKey: true}>`,
      newB: `n.serial('id', {primaryKey: true})`,
    },
    insertRow: `{name: 'a', age: 1, role: 'admin'}`,
    queries: (p) => `${QUERY_READS(p)}
const ${p}I = db.insert(${p}D).values({name: 'a', age: 21, role: 'user'}).$returningId();
declare const ${p}ids: Awaited<typeof ${p}I>;
export const ${p}id: number = ${p}ids[0]!.id;
export const ${p}u = db.update(${p}D).set({age: 31});`,
    budgets: {
      '5 mixed, select': {types: 712, builders: 1184},
      '5 mixed, select + insert': {types: 1268, builders: 1801},
      '10 plain, db name per column': {types: 228, builders: 382},
      '20 plain, db name per column': {types: 318, builders: 592},
      '40 plain, db name per column': {types: 498, builders: 1012},
      '20 plain, nameless': {types: 318, builders: 551},
      // 1773 -> 1718: lowered, a $type tuple left unmapped is cheaper.
      'wide vocabulary, select': {types: 1040, builders: 1718},
      'two tables, one reference': {types: 290, builders: 525},
      'refineTableType, select': {types: 1447, builders: 1939},
      'toDrizzle + select / insert / update query': {types: 8583, builders: 9786},
    },
  },
  {
    dialect: 'sqlite',
    measure: measurerFor(
      'sqlite',
      `import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';\ndeclare const db: BaseSQLiteDatabase<'sync', unknown>;`
    ),
    tableFn: 'sqliteTable',
    tableType: 'SqliteTable',
    mixed: SQLITE_MIXED,
    mixedReads: [['id', 'number'], ...MIXED_READS],
    wide: SQLITE_WIDE,
    wideReads: [
      ['id', 'number'],
      ['role', 'string'],
      ['flag', 'boolean'],
      ['payload', '{kind: string} | null'],
      ['email', 'string | null'],
      ['amount', 'number'],
      ['big', 'bigint | null'],
    ],
    int: {fn: 'integer', type: 'Integer'},
    refId: {
      newT: `n.Integer<{primaryKey: true}>`,
      newB: `n.integer('id', {primaryKey: true})`,
    },
    insertRow: `{name: 'a', age: 1, role: 'admin', createdAt: new Date()}`,
    queries: (p) => `${QUERY_READS(p)}
export const ${p}i = db.insert(${p}D).values({name: 'a', age: 21, role: 'user', createdAt: new Date()});
export const ${p}u = db.update(${p}D).set({age: 31});`,
    budgets: {
      '5 mixed, select': {types: 658, builders: 1058},
      '5 mixed, select + insert': {types: 1252, builders: 1716},
      '10 plain, db name per column': {types: 231, builders: 385},
      '20 plain, db name per column': {types: 321, builders: 595},
      '40 plain, db name per column': {types: 501, builders: 1015},
      '20 plain, nameless': {types: 321, builders: 554},
      // 1631 -> 1576: lowered, a $type tuple left unmapped is cheaper.
      'wide vocabulary, select': {types: 977, builders: 1576},
      'two tables, one reference': {types: 298, builders: 518},
      'refineTableType, select': {types: 1393, builders: 1813},
      // 8695 -> 8696: a REVIEWED EXCEPTION, Writable leaves a $type tuple alone so a nominal brand survives.
      'toDrizzle + select / insert / update query': {types: 7672, builders: 8696},
    },
  },
];

const PREFIX: Record<Line, string> = {types: 'nt', builders: 'nb'};
const measured = new Map<string, Record<Line, number>>();

// Without these, a broken import collapses every type to `any` and the counts drop.
const shapePins = (names: Dialect) => `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
${declare(names, 'types', 'pb', 'users', names.mixed)}
${declare(names, 'builders', 'pc', 'users', names.mixed)}
${declare(names, 'types', 'wb', 'w', names.wide)}
${declare(names, 'builders', 'wc', 'w', names.wide)}
export type _Pins = [Expect<Equal<pcT, pbT>>, Expect<Equal<wcT, wbT>>];
`;

describe('column formats: hand-written types and builders, type-instantiation cost', () => {
  beforeAll(() => {
    for (const names of DIALECTS) {
      for (const label of SHAPE_LABELS) {
        const row = {} as Record<Line, number>;
        for (const line of LINES) {
          const result = names.measure(shapeBody(names, label, line, PREFIX[line]));
          expect(
            result.errors,
            `${names.dialect} "${label}" / ${line} should type-check cleanly:\n  ${result.errors.join('\n  ')}`
          ).toEqual([]);
          row[line] = result.netInstantiations;
        }
        measured.set(`${names.dialect}: ${label}`, row);
      }
    }
  });

  afterAll(() => {
    writeColumnFormatsReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      rows: DIALECTS.flatMap(({dialect, budgets}) =>
        SHAPE_LABELS.map(
          (label): ColumnFormatsRow => ({dialect, label, ...measured.get(`${dialect}: ${label}`)!, budget: budgets[label]})
        )
      ),
    });
  });

  for (const names of DIALECTS) {
    for (const label of SHAPE_LABELS) {
      it(`${names.dialect}: ${label}: both lines stay within their budgets`, () => {
        const row = measured.get(`${names.dialect}: ${label}`)!;
        const budget = names.budgets[label];
        expect(row.types, `types cost ${row.types}, over ${budget.types}`).toBeLessThanOrEqual(budget.types);
        expect(row.builders, `builders cost ${row.builders}, over ${budget.builders}`).toBeLessThanOrEqual(budget.builders);
      });
    }

    it(`${names.dialect}: the builder table is its hand-written twin`, () => {
      const result = names.measure(shapePins(names));
      expect(result.errors, `shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
    });
  }
});
