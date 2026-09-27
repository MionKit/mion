// Each column shape over the REAL packages, as a hand-written table type and as builders, in every dialect; both
// carry one-way-downward budgets. TYPE-COST.md records what the chained columns cost.

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
import * as slim from '@mionjs/drizzle-orm-${dialect}-core';
import {toDrizzle} from '@mionjs/drizzle-orm-${dialect}-core/drizzle';
import type {InferSelectModel as Select, InferInsertModel as Insert, TableRef} from '@mionjs/drizzle-orm';
import {refineTableType, tableRef, $type} from '@mionjs/drizzle-orm';
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
  type: string;
  builder: string;
}
const col = (key: string, db: string | undefined, type: string, builder: string): ColSpec => ({key, db, type, builder});

const PG_MIXED: ColSpec[] = [
  col('id', 'id', `slim.Uuid<{primaryKey: true}>`, `slim.uuid('id', {primaryKey: true})`),
  col('name', 'name', `slim.Varchar<{length: 100; notNull: true}>`, `slim.varchar('name', {length: 100, notNull: true})`),
  col('age', 'age', `slim.Integer<{notNull: true}>`, `slim.integer('age', {notNull: true})`),
  col(
    'role',
    'role',
    `slim.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `slim.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `slim.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `slim.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const PG_WIDE: ColSpec[] = [
  col('id', 'id', `slim.Serial<{primaryKey: true}>`, `slim.serial('id', {primaryKey: true})`),
  col(
    'role',
    'role',
    `slim.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `slim.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col('seq', 'seq', `slim.Integer<{generatedAlwaysAsIdentity: true}>`, `slim.integer('seq', {generatedAlwaysAsIdentity: true})`),
  col('tags', 'tags', `slim.Text<{array: true; notNull: true}>`, `slim.text('tags', {array: true, notNull: true})`),
  col('payload', 'payload', `slim.Jsonb<{$type: [{kind: string}]}>`, `slim.jsonb('payload', {$type: $type<{kind: string}>()})`),
  col('email', 'email', `slim.Text<{unique: ['uq_email']}>`, `slim.text('email', {unique: ['uq_email']})`),
  col(
    'createdAt',
    'created_at',
    `slim.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `slim.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const MYSQL_MIXED: ColSpec[] = [
  col('id', 'id', `slim.Serial<{primaryKey: true}>`, `slim.serial('id', {primaryKey: true})`),
  col('name', 'name', `slim.Varchar<{length: 100; notNull: true}>`, `slim.varchar('name', {length: 100, notNull: true})`),
  col('age', 'age', `slim.Int<{notNull: true}>`, `slim.int('age', {notNull: true})`),
  col(
    'role',
    'role',
    `slim.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `slim.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `slim.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `slim.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const MYSQL_WIDE: ColSpec[] = [
  col('id', 'id', `slim.Serial<{primaryKey: true}>`, `slim.serial('id', {primaryKey: true})`),
  MYSQL_MIXED[3],
  col(
    'seq',
    'seq',
    `slim.Int<{unsigned: true; notNull: true; autoincrement: true}>`,
    `slim.int('seq', {unsigned: true, notNull: true, autoincrement: true})`
  ),
  col('payload', 'payload', `slim.Json<{$type: [{kind: string}]}>`, `slim.json('payload', {$type: $type<{kind: string}>()})`),
  col(
    'email',
    'email',
    `slim.Varchar<{length: 200; unique: ['uq_email']}>`,
    `slim.varchar('email', {length: 200, unique: ['uq_email']})`
  ),
  col(
    'updatedAt',
    'updated_at',
    `slim.Timestamp<{mode: 'date'; notNull: true; defaultNow: true; onUpdateNow: true}>`,
    `slim.timestamp('updated_at', {mode: 'date', notNull: true, defaultNow: true, onUpdateNow: true})`
  ),
  col('big', 'big', `slim.Bigint<{mode: 'bigint'; unsigned: true}>`, `slim.bigint('big', {mode: 'bigint', unsigned: true})`),
];
const SQLITE_MIXED: ColSpec[] = [
  col('id', 'id', `slim.Integer<{primaryKey: true}>`, `slim.integer('id', {primaryKey: true})`),
  col('name', 'name', `slim.Text<{length: 100; notNull: true}>`, `slim.text('name', {length: 100, notNull: true})`),
  col('age', 'age', `slim.Integer<{notNull: true}>`, `slim.integer('age', {notNull: true})`),
  col(
    'role',
    'role',
    `slim.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `slim.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `slim.Integer<{mode: 'timestamp'; notNull: true}>`,
    `slim.integer('created_at', {mode: 'timestamp', notNull: true})`
  ),
];
const SQLITE_WIDE: ColSpec[] = [
  col(
    'id',
    'id',
    `slim.Integer<{primaryKey: [{autoIncrement: true}]}>`,
    `slim.integer('id', {primaryKey: [{autoIncrement: true}]})`
  ),
  SQLITE_MIXED[3],
  col(
    'flag',
    'flag',
    `slim.Integer<{mode: 'boolean'; notNull: true; default: [false]}>`,
    `slim.integer('flag', {mode: 'boolean', notNull: true, default: [false]})`
  ),
  col(
    'payload',
    'payload',
    `slim.Text<{mode: 'json'; $type: [{kind: string}]}>`,
    `slim.text('payload', {mode: 'json', $type: $type<{kind: string}>()})`
  ),
  col('email', 'email', `slim.Text<{unique: ['uq_email']}>`, `slim.text('email', {unique: ['uq_email']})`),
  col('amount', 'amount', `slim.Real<{notNull: true}>`, `slim.real('amount', {notNull: true})`),
  col('big', 'big', `slim.Blob<{mode: 'bigint'}>`, `slim.blob('big', {mode: 'bigint'})`),
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
  refId: {type: string; builder: string};
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
      ? col(key, key, `slim.${int.type}`, `slim.${int.fn}('${key}')`)
      : col(key, undefined, `slim.${int.type}`, `slim.${int.fn}()`);
  });

/** A table declaration on one line, as `${prefix}T` (the table type). */
function declare(names: Dialect, line: Line, prefix: string, table: string, cols: ColSpec[]): string {
  const {tableFn, tableType} = names;
  if (line === 'builders')
    return `const ${prefix}V = slim.${tableFn}('${table}', {${cols.map((x) => `${x.key}: ${x.builder},`).join(' ')}});\ntype ${prefix}T = typeof ${prefix}V;`;
  const names_ = cols.filter((x) => x.db !== undefined && x.db !== x.key).map((x) => `${x.key}: '${x.db}'`);
  return `type ${prefix}T = slim.${tableType}<'${table}', {${cols.map((x) => `${x.key}: ${x.type};`).join(' ')}}${names_.length ? `, [], {${names_.join('; ')}}` : ''}>;`;
}
const select = (t: string) => `Select<${t}>`;
const insert = (t: string) => `Insert<${t}>`;

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
        return `const ${p}A = slim.${tableFn}('teams', {id: ${refId.builder}});
const ${p}B = slim.${tableFn}('members', {id: ${refId.builder}, teamId: slim.${int.fn}('team_id', {references: [() => tableRef(${p}A, 'id')]})});
${read(`Select<typeof ${p}B>`)}`;
      return `type ${p}A = slim.${tableType}<'teams', {id: ${refId.type}}>;
type ${p}B = slim.${tableType}<'members', {id: ${refId.type}; teamId: slim.${int.type}<{references: [TableRef<${p}A, 'id'>]}>}, [], {teamId: 'team_id'}>;
${read(`Select<${p}B>`)}`;
    }
    case 'refineTableType, select': {
      const source = line === 'builders' ? `${p}V` : `({} as ${p}T)`;
      return `${declare(names, line, p, 'users', mixed)}
const ${p}R = refineTableType(${source}, {name: {maxLength: 50}});
type ${p}Row = ${select(`typeof ${p}R`)};\n${readRow(p, mixedReads)}`;
    }
    case 'toDrizzle + select / insert / update query': {
      const source = line === 'builders' ? `${p}V` : `({} as ${p}T)`;
      return `${declare(names, line, p, 'users', mixed)}\nconst ${p}D = toDrizzle(${source});\n${names.queries(p)}`;
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
      type: `slim.Serial<{primaryKey: true}>`,
      builder: `slim.serial('id', {primaryKey: true})`,
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
      type: `slim.Serial<{primaryKey: true}>`,
      builder: `slim.serial('id', {primaryKey: true})`,
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
      type: `slim.Integer<{primaryKey: true}>`,
      builder: `slim.integer('id', {primaryKey: true})`,
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
