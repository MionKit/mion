// next/ columns against the shipped ones over the REAL packages: each shape declared four ways, read through the
// same models, in every dialect. Only the two next/ lines carry budgets (one-way downward); the shipped lines are
// the reference.

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
import * as c from '@mionjs/drizzle-orm-${dialect}-core';
import {toDrizzle as cToDrizzle} from '@mionjs/drizzle-orm-${dialect}-core/drizzle';
import type {InferSelectModel as CSelect, InferInsertModel as CInsert} from '@mionjs/drizzle-orm';
import {refineTableType as cRefine, cols as cCols} from '@mionjs/drizzle-orm';
import * as n from '../../drizzle-orm-${dialect}-core/next/index.ts';
import {toDrizzle as nToDrizzle} from '../../drizzle-orm-${dialect}-core/next/drizzle.ts';
import type {InferSelectModel as NSelect, InferInsertModel as NInsert} from '../../drizzle-orm/next/models.ts';
import {refineTableType as nRefine, tableRef as nTableRef, $type as n$type} from '../../drizzle-orm/next/index.ts';
import type {TableRef as NTableRef} from '../../drizzle-orm/next/index.ts';
${db}
export {};
`;

type Line = 'curBuilders' | 'curTypes' | 'newTypes' | 'newBuilders';
const LINES: Line[] = ['curBuilders', 'curTypes', 'newTypes', 'newBuilders'];

// ── Column spellings per line ────────────────────────────────────────────────

interface ColSpec {
  key: string;
  /** The explicit db name; unset for a nameless column. */
  db?: string;
  curB: string;
  curT: string;
  newT: string;
  newB: string;
}
const col = (key: string, db: string | undefined, curB: string, curT: string, newT: string, newB: string): ColSpec => ({
  key,
  db,
  curB,
  curT,
  newT,
  newB,
});

const PG_MIXED: ColSpec[] = [
  col(
    'id',
    'id',
    `c.uuid('id').primaryKey()`,
    `c.Uuid<'id', {primaryKey: true}>`,
    `n.Uuid<{primaryKey: true}>`,
    `n.uuid('id', {primaryKey: true})`
  ),
  col(
    'name',
    'name',
    `c.varchar('name', {length: 100}).notNull()`,
    `c.Varchar<'name', {length: 100; notNull: true}>`,
    `n.Varchar<{length: 100; notNull: true}>`,
    `n.varchar('name', {length: 100, notNull: true})`
  ),
  col(
    'age',
    'age',
    `c.integer('age').notNull()`,
    `c.Integer<'age', {notNull: true}>`,
    `n.Integer<{notNull: true}>`,
    `n.integer('age', {notNull: true})`
  ),
  col(
    'role',
    'role',
    `c.text('role', {enum: ['admin', 'user']}).notNull()`,
    `c.Text<'role', {enum: ['admin', 'user']; notNull: true}>`,
    `n.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `n.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `c.timestamp('created_at', {mode: 'date'}).notNull().defaultNow()`,
    `c.Timestamp<'created_at', {mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const PG_WIDE: ColSpec[] = [
  col(
    'id',
    'id',
    `c.serial('id').primaryKey()`,
    `c.Serial<'id', {primaryKey: true}>`,
    `n.Serial<{primaryKey: true}>`,
    `n.serial('id', {primaryKey: true})`
  ),
  col(
    'role',
    'role',
    `c.text('role', {enum: ['admin', 'user']}).notNull()`,
    `c.Text<'role', {enum: ['admin', 'user']; notNull: true}>`,
    `n.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `n.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'seq',
    'seq',
    `c.integer('seq').generatedAlwaysAsIdentity()`,
    `c.Integer<'seq', {generatedAlwaysAsIdentity: true}>`,
    `n.Integer<{generatedAlwaysAsIdentity: true}>`,
    `n.integer('seq', {generatedAlwaysAsIdentity: true})`
  ),
  col(
    'tags',
    'tags',
    `c.text('tags').array().notNull()`,
    `c.Text<'tags', {array: true; notNull: true}>`,
    `n.Text<{array: true; notNull: true}>`,
    `n.text('tags', {array: true, notNull: true})`
  ),
  col(
    'payload',
    'payload',
    `c.jsonb('payload').$type<{kind: string}>()`,
    `c.Jsonb<'payload', {$type: [{kind: string}]}>`,
    `n.Jsonb<{$type: [{kind: string}]}>`,
    `n.jsonb('payload', {$type: n$type<{kind: string}>()})`
  ),
  col(
    'email',
    'email',
    `c.text('email').unique('uq_email')`,
    `c.Text<'email', {unique: ['uq_email']}>`,
    `n.Text<{unique: ['uq_email']}>`,
    `n.text('email', {unique: ['uq_email']})`
  ),
  col(
    'createdAt',
    'created_at',
    `c.timestamp('created_at', {mode: 'date'}).notNull().defaultNow()`,
    `c.Timestamp<'created_at', {mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const MYSQL_MIXED: ColSpec[] = [
  col(
    'id',
    'id',
    `c.serial('id').primaryKey()`,
    `c.Serial<'id', {primaryKey: true}>`,
    `n.Serial<{primaryKey: true}>`,
    `n.serial('id', {primaryKey: true})`
  ),
  col(
    'name',
    'name',
    `c.varchar('name', {length: 100}).notNull()`,
    `c.Varchar<'name', {length: 100; notNull: true}>`,
    `n.Varchar<{length: 100; notNull: true}>`,
    `n.varchar('name', {length: 100, notNull: true})`
  ),
  col(
    'age',
    'age',
    `c.int('age').notNull()`,
    `c.Int<'age', {notNull: true}>`,
    `n.Int<{notNull: true}>`,
    `n.int('age', {notNull: true})`
  ),
  col(
    'role',
    'role',
    `c.text('role', {enum: ['admin', 'user']}).notNull()`,
    `c.Text<'role', {enum: ['admin', 'user']; notNull: true}>`,
    `n.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `n.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `c.timestamp('created_at', {mode: 'date'}).notNull().defaultNow()`,
    `c.Timestamp<'created_at', {mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>`,
    `n.timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true})`
  ),
];
const MYSQL_WIDE: ColSpec[] = [
  col(
    'id',
    'id',
    `c.serial('id').primaryKey()`,
    `c.Serial<'id', {primaryKey: true}>`,
    `n.Serial<{primaryKey: true}>`,
    `n.serial('id', {primaryKey: true})`
  ),
  MYSQL_MIXED[3],
  col(
    'seq',
    'seq',
    `c.int('seq', {unsigned: true}).notNull().autoincrement()`,
    `c.Int<'seq', {unsigned: true; notNull: true; autoincrement: true}>`,
    `n.Int<{unsigned: true; notNull: true; autoincrement: true}>`,
    `n.int('seq', {unsigned: true, notNull: true, autoincrement: true})`
  ),
  col(
    'payload',
    'payload',
    `c.json('payload').$type<{kind: string}>()`,
    `c.Json<'payload', {$type: [{kind: string}]}>`,
    `n.Json<{$type: [{kind: string}]}>`,
    `n.json('payload', {$type: n$type<{kind: string}>()})`
  ),
  col(
    'email',
    'email',
    `c.varchar('email', {length: 200}).unique('uq_email')`,
    `c.Varchar<'email', {length: 200; unique: ['uq_email']}>`,
    `n.Varchar<{length: 200; unique: ['uq_email']}>`,
    `n.varchar('email', {length: 200, unique: ['uq_email']})`
  ),
  col(
    'updatedAt',
    'updated_at',
    `c.timestamp('updated_at', {mode: 'date'}).notNull().defaultNow().onUpdateNow()`,
    `c.Timestamp<'updated_at', {mode: 'date'; notNull: true; defaultNow: true; onUpdateNow: true}>`,
    `n.Timestamp<{mode: 'date'; notNull: true; defaultNow: true; onUpdateNow: true}>`,
    `n.timestamp('updated_at', {mode: 'date', notNull: true, defaultNow: true, onUpdateNow: true})`
  ),
  col(
    'big',
    'big',
    `c.bigint('big', {mode: 'bigint', unsigned: true})`,
    `c.Bigint<'big', {mode: 'bigint'; unsigned: true}>`,
    `n.Bigint<{mode: 'bigint'; unsigned: true}>`,
    `n.bigint('big', {mode: 'bigint', unsigned: true})`
  ),
];
const SQLITE_MIXED: ColSpec[] = [
  col(
    'id',
    'id',
    `c.integer('id').primaryKey()`,
    `c.Integer<'id', {primaryKey: true}>`,
    `n.Integer<{primaryKey: true}>`,
    `n.integer('id', {primaryKey: true})`
  ),
  col(
    'name',
    'name',
    `c.text('name', {length: 100}).notNull()`,
    `c.Text<'name', {length: 100; notNull: true}>`,
    `n.Text<{length: 100; notNull: true}>`,
    `n.text('name', {length: 100, notNull: true})`
  ),
  col(
    'age',
    'age',
    `c.integer('age').notNull()`,
    `c.Integer<'age', {notNull: true}>`,
    `n.Integer<{notNull: true}>`,
    `n.integer('age', {notNull: true})`
  ),
  col(
    'role',
    'role',
    `c.text('role', {enum: ['admin', 'user']}).notNull()`,
    `c.Text<'role', {enum: ['admin', 'user']; notNull: true}>`,
    `n.Text<{enum: ['admin', 'user']; notNull: true}>`,
    `n.text('role', {enum: ['admin', 'user'], notNull: true})`
  ),
  col(
    'createdAt',
    'created_at',
    `c.integer('created_at', {mode: 'timestamp'}).notNull()`,
    `c.Integer<'created_at', {mode: 'timestamp'; notNull: true}>`,
    `n.Integer<{mode: 'timestamp'; notNull: true}>`,
    `n.integer('created_at', {mode: 'timestamp', notNull: true})`
  ),
];
const SQLITE_WIDE: ColSpec[] = [
  col(
    'id',
    'id',
    `c.integer('id').primaryKey({autoIncrement: true})`,
    `c.Integer<'id', {primaryKey: [{autoIncrement: true}]}>`,
    `n.Integer<{primaryKey: [{autoIncrement: true}]}>`,
    `n.integer('id', {primaryKey: [{autoIncrement: true}]})`
  ),
  SQLITE_MIXED[3],
  col(
    'flag',
    'flag',
    `c.integer('flag', {mode: 'boolean'}).notNull().default(false)`,
    `c.Integer<'flag', {mode: 'boolean'; notNull: true; default: [false]}>`,
    `n.Integer<{mode: 'boolean'; notNull: true; default: [false]}>`,
    `n.integer('flag', {mode: 'boolean', notNull: true, default: [false]})`
  ),
  col(
    'payload',
    'payload',
    `c.text('payload', {mode: 'json'}).$type<{kind: string}>()`,
    `c.Text<'payload', {mode: 'json'; $type: [{kind: string}]}>`,
    `n.Text<{mode: 'json'; $type: [{kind: string}]}>`,
    `n.text('payload', {mode: 'json', $type: n$type<{kind: string}>()})`
  ),
  col(
    'email',
    'email',
    `c.text('email').unique('uq_email')`,
    `c.Text<'email', {unique: ['uq_email']}>`,
    `n.Text<{unique: ['uq_email']}>`,
    `n.text('email', {unique: ['uq_email']})`
  ),
  col(
    'amount',
    'amount',
    `c.real('amount').notNull()`,
    `c.Real<'amount', {notNull: true}>`,
    `n.Real<{notNull: true}>`,
    `n.real('amount', {notNull: true})`
  ),
  col(
    'big',
    'big',
    `c.blob('big', {mode: 'bigint'})`,
    `c.Blob<'big', {mode: 'bigint'}>`,
    `n.Blob<{mode: 'bigint'}>`,
    `n.blob('big', {mode: 'bigint'})`
  ),
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
  /** The referenced table's primary key: builder call, shipped type, new type, new builder call. */
  refId: {curB: string; curT: string; newT: string; newB: string};
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
      ? col(key, key, `c.${int.fn}('${key}')`, `c.${int.type}<'${key}'>`, `n.${int.type}`, `n.${int.fn}('${key}')`)
      : col(key, undefined, `c.${int.fn}()`, `c.${int.type}`, `n.${int.type}`, `n.${int.fn}()`);
  });

/** A table declaration on one line, as `${prefix}T` (the table type). */
function declare(names: Dialect, line: Line, prefix: string, table: string, cols: ColSpec[]): string {
  const {tableFn, tableType} = names;
  if (line === 'curBuilders')
    return `const ${prefix}V = c.${tableFn}('${table}', {${cols.map((x) => `${x.key}: ${x.curB},`).join(' ')}});\ntype ${prefix}T = typeof ${prefix}V;`;
  if (line === 'newBuilders')
    return `const ${prefix}V = n.${tableFn}('${table}', {${cols.map((x) => `${x.key}: ${x.newB},`).join(' ')}});\ntype ${prefix}T = typeof ${prefix}V;`;
  if (line === 'curTypes')
    return `type ${prefix}T = c.${tableType}<'${table}', {${cols.map((x) => `${x.key}: ${x.curT};`).join(' ')}}>;`;
  const names_ = cols.filter((x) => x.db !== undefined && x.db !== x.key).map((x) => `${x.key}: '${x.db}'`);
  return `type ${prefix}T = n.${tableType}<'${table}', {${cols.map((x) => `${x.key}: ${x.newT};`).join(' ')}}${names_.length ? `, [], {${names_.join('; ')}}` : ''}>;`;
}
const isCur = (line: Line) => line === 'curBuilders' || line === 'curTypes';
const select = (line: Line, t: string) => `${isCur(line) ? 'CSelect' : 'NSelect'}<${t}>`;
const insert = (line: Line, t: string) => `${isCur(line) ? 'CInsert' : 'NInsert'}<${t}>`;

// Reading the row into annotated consts is what forces the work: a bare alias measures almost nothing.
const readRow = (p: string, reads: Array<[string, string]>) =>
  `declare const ${p}row: ${p}Row;\n` +
  reads.map(([key, type], i) => `export const ${p}${i}: ${type} = ${p}row.${key};`).join('\n');
const readPlain = (p: string, count: number) =>
  `declare const ${p}row: ${p}Row;\n` +
  Array.from({length: count}, (_, i) => `export const ${p}${i}: number | null = ${p}row.c${i};`).join('\n');

interface Budget {
  newTypes: number;
  newBuilders: number;
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
    `${declare(names, line, p, 't', plain(int, count, named))}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readPlain(p, count)}`;
  switch (label) {
    case '5 mixed, select':
      return `${declare(names, line, p, 'users', mixed)}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readRow(p, mixedReads)}`;
    case '5 mixed, select + insert':
      return `${declare(names, line, p, 'users', mixed)}\ntype ${p}Row = ${select(line, `${p}T`)};\ntype ${p}New = ${insert(line, `${p}T`)};\n${readRow(p, mixedReads)}
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
      return `${declare(names, line, p, 'w', wide)}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readRow(p, wideReads)}`;
    case 'two tables, one reference': {
      const read = (model: string) => `declare const ${p}row: ${model}; export const ${p}t: number | null = ${p}row.teamId;`;
      if (line === 'curBuilders')
        return `const ${p}A = c.${tableFn}('teams', {id: ${refId.curB}});
const ${p}B = c.${tableFn}('members', {id: ${refId.curB}, teamId: c.${int.fn}('team_id').references(() => cCols(${p}A).id)});
${read(`CSelect<typeof ${p}B>`)}`;
      if (line === 'newBuilders')
        return `const ${p}A = n.${tableFn}('teams', {id: ${refId.newB}});
const ${p}B = n.${tableFn}('members', {id: ${refId.newB}, teamId: n.${int.fn}('team_id', {references: [() => nTableRef(${p}A, 'id')]})});
${read(`NSelect<typeof ${p}B>`)}`;
      if (line === 'curTypes')
        return `type ${p}A = c.${tableType}<'teams', {id: ${refId.curT}}>;
type ${p}B = c.${tableType}<'members', {id: ${refId.curT}; teamId: c.${int.type}<'team_id', {references: [{table: 'teams'; column: 'id'}]}>}>;
${read(`CSelect<${p}B>`)}`;
      return `type ${p}A = n.${tableType}<'teams', {id: ${refId.newT}}>;
type ${p}B = n.${tableType}<'members', {id: ${refId.newT}; teamId: n.${int.type}<{references: [NTableRef<${p}A, 'id'>]}>}, [], {teamId: 'team_id'}>;
${read(`NSelect<${p}B>`)}`;
    }
    case 'refineTableType, select': {
      const refine = isCur(line) ? 'cRefine' : 'nRefine';
      const source = line.endsWith('Builders') ? `${p}V` : `({} as ${p}T)`;
      return `${declare(names, line, p, 'users', mixed)}
const ${p}R = ${refine}(${source}, {name: {maxLength: 50}});
type ${p}Row = ${select(line, `typeof ${p}R`)};\n${readRow(p, mixedReads)}`;
    }
    case 'toDrizzle + select / insert / update query': {
      const toDz = isCur(line) ? 'cToDrizzle' : 'nToDrizzle';
      const source = line.endsWith('Builders') ? `${p}V` : `({} as ${p}T)`;
      return `${declare(names, line, p, 'users', mixed)}\nconst ${p}D = ${toDz}(${source});\n${names.queries(p)}`;
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
      curB: `c.serial('id').primaryKey()`,
      curT: `c.Serial<'id', {primaryKey: true}>`,
      newT: `n.Serial<{primaryKey: true}>`,
      newB: `n.serial('id', {primaryKey: true})`,
    },
    insertRow: `{id: 'x' as never, name: 'a', age: 1, role: 'admin'}`,
    queries: (p) => `${QUERY_READS(p)}
export const ${p}i = db.insert(${p}D).values({id: 'x', name: 'a', age: 21, role: 'user'});
export const ${p}u = db.update(${p}D).set({age: 31});`,
    budgets: {
      // 539 -> 683 and 971 -> 1160: a REVIEWED EXCEPTION, props reject stray modifier keys (Only<P, Allowed>, about 30 per configured column).
      '5 mixed, select': {newTypes: 683, newBuilders: 1160},
      // 1132 -> 1276 and 1638 -> 1827: a REVIEWED EXCEPTION, props reject stray modifier keys.
      '5 mixed, select + insert': {newTypes: 1276, newBuilders: 1827},
      '10 plain, db name per column': {newTypes: 210, newBuilders: 363},
      '20 plain, db name per column': {newTypes: 300, newBuilders: 573},
      '40 plain, db name per column': {newTypes: 480, newBuilders: 993},
      '20 plain, nameless': {newTypes: 300, newBuilders: 532},
      // 702 -> 873 and 1293 -> 1516: a REVIEWED EXCEPTION, props reject stray modifier keys.
      'wide vocabulary, select': {newTypes: 873, newBuilders: 1516},
      // 160 -> 212: a REVIEWED EXCEPTION, TableRef checks the column key and takes a name for self-references.
      // 212 -> 266 and 423 -> 494: a REVIEWED EXCEPTION, props reject stray modifier keys.
      'two tables, one reference': {newTypes: 266, newBuilders: 494},
      // 1277 -> 1421 and 1729 -> 1918: a REVIEWED EXCEPTION, props reject stray modifier keys.
      'refineTableType, select': {newTypes: 1421, newBuilders: 1918},
      // 8812 -> 8956 and 9915 -> 10104: a REVIEWED EXCEPTION, props reject stray modifier keys.
      'toDrizzle + select / insert / update query': {newTypes: 8956, newBuilders: 10104},
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
      curB: `c.serial('id').primaryKey()`,
      curT: `c.Serial<'id', {primaryKey: true}>`,
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
      '5 mixed, select': {newTypes: 712, newBuilders: 1184},
      '5 mixed, select + insert': {newTypes: 1268, newBuilders: 1801},
      '10 plain, db name per column': {newTypes: 228, newBuilders: 382},
      '20 plain, db name per column': {newTypes: 318, newBuilders: 592},
      '40 plain, db name per column': {newTypes: 498, newBuilders: 1012},
      '20 plain, nameless': {newTypes: 318, newBuilders: 551},
      'wide vocabulary, select': {newTypes: 1040, newBuilders: 1773},
      'two tables, one reference': {newTypes: 290, newBuilders: 525},
      'refineTableType, select': {newTypes: 1447, newBuilders: 1939},
      'toDrizzle + select / insert / update query': {newTypes: 8583, newBuilders: 9786},
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
      curB: `c.integer('id').primaryKey()`,
      curT: `c.Integer<'id', {primaryKey: true}>`,
      newT: `n.Integer<{primaryKey: true}>`,
      newB: `n.integer('id', {primaryKey: true})`,
    },
    insertRow: `{name: 'a', age: 1, role: 'admin', createdAt: new Date()}`,
    queries: (p) => `${QUERY_READS(p)}
export const ${p}i = db.insert(${p}D).values({name: 'a', age: 21, role: 'user', createdAt: new Date()});
export const ${p}u = db.update(${p}D).set({age: 31});`,
    budgets: {
      '5 mixed, select': {newTypes: 658, newBuilders: 1058},
      '5 mixed, select + insert': {newTypes: 1252, newBuilders: 1716},
      '10 plain, db name per column': {newTypes: 231, newBuilders: 385},
      '20 plain, db name per column': {newTypes: 321, newBuilders: 595},
      '40 plain, db name per column': {newTypes: 501, newBuilders: 1015},
      '20 plain, nameless': {newTypes: 321, newBuilders: 554},
      'wide vocabulary, select': {newTypes: 977, newBuilders: 1631},
      'two tables, one reference': {newTypes: 298, newBuilders: 518},
      'refineTableType, select': {newTypes: 1393, newBuilders: 1813},
      'toDrizzle + select / insert / update query': {newTypes: 7672, newBuilders: 8695},
    },
  },
];

const PREFIX: Record<Line, string> = {curBuilders: 'cb', curTypes: 'ct', newTypes: 'nt', newBuilders: 'nb'};
const measured = new Map<string, Record<Line, number>>();

// Without these, a broken import collapses every type to `any` and the counts drop.
const shapePins = (names: Dialect) => `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
${declare(names, 'curBuilders', 'pa', 'users', names.mixed)}
${declare(names, 'newTypes', 'pb', 'users', names.mixed)}
${declare(names, 'newBuilders', 'pc', 'users', names.mixed)}
${declare(names, 'curBuilders', 'wa', 'w', names.wide)}
${declare(names, 'newTypes', 'wb', 'w', names.wide)}
${declare(names, 'newBuilders', 'wc', 'w', names.wide)}
export type _Pins = [
  Expect<Equal<pcT, pbT>>,
  Expect<Equal<NSelect<pbT>, CSelect<paT>>>,
  Expect<Equal<NInsert<pbT>, CInsert<paT>>>,
  Expect<Equal<wcT, wbT>>,
  Expect<Equal<NSelect<wbT>, CSelect<waT>>>,
  Expect<Equal<NInsert<wbT>, CInsert<waT>>>,
];
`;

describe('column formats: shipped vs side-by-side columns, type-instantiation cost', () => {
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
      it(`${names.dialect}: ${label}: the new lines stay within their budgets`, () => {
        const row = measured.get(`${names.dialect}: ${label}`)!;
        const budget = names.budgets[label];
        expect(row.newTypes, `new types cost ${row.newTypes}, over ${budget.newTypes}`).toBeLessThanOrEqual(budget.newTypes);
        expect(row.newBuilders, `new builders cost ${row.newBuilders}, over ${budget.newBuilders}`).toBeLessThanOrEqual(
          budget.newBuilders
        );
      });
    }

    it(`${names.dialect}: the new builder table is its hand-written twin, and the models are the shipped ones`, () => {
      const result = names.measure(shapePins(names));
      expect(result.errors, `shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
    });
  }
});
