// next/ columns against the shipped ones over the REAL packages: each shape declared four ways, read through the
// same models. Only the two next/ lines carry budgets (one-way downward); the shipped lines are the reference.

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

const IMPORT_HEADER = `
import * as c from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle as cToDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import type {InferSelectModel as CSelect, InferInsertModel as CInsert} from '@mionjs/drizzle-orm';
import {refineTableType as cRefine, cols as cCols} from '@mionjs/drizzle-orm';
import * as n from '../../drizzle-orm-pg-core/next/index.ts';
import {toDrizzle as nToDrizzle} from '../../drizzle-orm-pg-core/next/drizzle.ts';
import type {InferSelectModel as NSelect, InferInsertModel as NInsert} from '../../drizzle-orm/next/models.ts';
import {refineTableType as nRefine, tableRef as nTableRef, $type as n$type} from '../../drizzle-orm/next/index.ts';
import type {TableRef as NTableRef} from '../../drizzle-orm/next/index.ts';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';
declare const db: PgDatabase<PgQueryResultHKT>;
export {};
`;

const measure = makeMeasurer(IMPORT_HEADER, {options: RESOLVING_OPTIONS, snippetFile: SNIPPET_FILE, diagnosticsScope: 'snippet'});

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

const MIXED: ColSpec[] = [
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
const WIDE: ColSpec[] = [
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
const plain = (count: number, named: boolean): ColSpec[] =>
  Array.from({length: count}, (_, i) => {
    const key = `c${i}`;
    return named
      ? col(key, key, `c.integer('${key}')`, `c.Integer<'${key}'>`, `n.Integer`, `n.integer('${key}')`)
      : col(key, undefined, `c.integer()`, `c.Integer`, `n.Integer`, `n.integer()`);
  });

/** A table declaration on one line, as `${prefix}T` (the table type). */
function declare(line: Line, prefix: string, table: string, cols: ColSpec[], tableFn = 'pgTable', tableType = 'PgTable'): string {
  if (line === 'curBuilders')
    return `const ${prefix}V = c.${tableFn}('${table}', {${cols.map((x) => `${x.key}: ${x.curB},`).join(' ')}});\ntype ${prefix}T = typeof ${prefix}V;`;
  if (line === 'newBuilders')
    return `const ${prefix}V = n.${tableFn}('${table}', {${cols.map((x) => `${x.key}: ${x.newB},`).join(' ')}});\ntype ${prefix}T = typeof ${prefix}V;`;
  if (line === 'curTypes')
    return `type ${prefix}T = c.${tableType}<'${table}', {${cols.map((x) => `${x.key}: ${x.curT};`).join(' ')}}>;`;
  const names = cols.filter((x) => x.db !== undefined && x.db !== x.key).map((x) => `${x.key}: '${x.db}'`);
  return `type ${prefix}T = n.${tableType}<'${table}', {${cols.map((x) => `${x.key}: ${x.newT};`).join(' ')}}${names.length ? `, [], {${names.join('; ')}}` : ''}>;`;
}
const isCur = (line: Line) => line === 'curBuilders' || line === 'curTypes';
const select = (line: Line, t: string) => `${isCur(line) ? 'CSelect' : 'NSelect'}<${t}>`;
const insert = (line: Line, t: string) => `${isCur(line) ? 'CInsert' : 'NInsert'}<${t}>`;

// Reading the row into annotated consts is what forces the work: a bare alias measures almost nothing.
const readMixed = (p: string) => `declare const ${p}row: ${p}Row;
export const ${p}Id: string = ${p}row.id;
export const ${p}Name: string = ${p}row.name;
export const ${p}Age: number = ${p}row.age;
export const ${p}Role: string = ${p}row.role;
export const ${p}When: Date = ${p}row.createdAt;`;
const readPlain = (p: string, count: number) =>
  `declare const ${p}row: ${p}Row;\n` +
  Array.from({length: count}, (_, i) => `export const ${p}${i}: number | null = ${p}row.c${i};`).join('\n');
const readWide = (p: string) => `declare const ${p}row: ${p}Row;
export const ${p}0: number = ${p}row.id;
export const ${p}1: string = ${p}row.role;
export const ${p}2: number = ${p}row.seq;
export const ${p}3: string[] = ${p}row.tags;
export const ${p}4: {kind: string} | null = ${p}row.payload;
export const ${p}5: string | null = ${p}row.email;
export const ${p}6: Date = ${p}row.createdAt;`;

interface Shape {
  label: string;
  body: (line: Line, p: string) => string;
  /** Budgets for the two new lines. ONE-WAY DOWNWARD. */
  budget: {newTypes: number; newBuilders: number};
}

const SHAPES: Shape[] = [
  {
    label: '5 mixed, select',
    // 539 -> 683 and 971 -> 1160: a REVIEWED EXCEPTION, props reject stray modifier keys (Only<P, Allowed>, about 30 per configured column).
    budget: {newTypes: 683, newBuilders: 1160},
    body: (line, p) => `${declare(line, p, 'users', MIXED)}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readMixed(p)}`,
  },
  {
    label: '5 mixed, select + insert',
    // 1132 -> 1276 and 1638 -> 1827: a REVIEWED EXCEPTION, props reject stray modifier keys.
    budget: {newTypes: 1276, newBuilders: 1827},
    body: (line, p) =>
      `${declare(line, p, 'users', MIXED)}\ntype ${p}Row = ${select(line, `${p}T`)};\ntype ${p}New = ${insert(line, `${p}T`)};\n${readMixed(p)}
export const ${p}NewUser: ${p}New = {id: 'x' as never, name: 'a', age: 1, role: 'admin'};`,
  },
  ...(
    [
      [10, {newTypes: 210, newBuilders: 363}],
      [20, {newTypes: 300, newBuilders: 573}],
      [40, {newTypes: 480, newBuilders: 993}],
    ] as const
  ).map(
    ([count, budget]): Shape => ({
      label: `${count} plain, db name per column`,
      budget,
      body: (line, p) =>
        `${declare(line, p, 't', plain(count, true))}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readPlain(p, count)}`,
    })
  ),
  {
    label: '20 plain, nameless',
    budget: {newTypes: 300, newBuilders: 532},
    body: (line, p) =>
      `${declare(line, p, 't', plain(20, false))}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readPlain(p, 20)}`,
  },
  {
    label: 'wide vocabulary, select',
    // 702 -> 873 and 1293 -> 1516: a REVIEWED EXCEPTION, props reject stray modifier keys.
    budget: {newTypes: 873, newBuilders: 1516},
    body: (line, p) => `${declare(line, p, 'w', WIDE)}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readWide(p)}`,
  },
  {
    label: 'two tables, one reference',
    // 160 -> 212: a REVIEWED EXCEPTION, TableRef checks the column key and takes a name for self-references.
    // 212 -> 266 and 423 -> 494: a REVIEWED EXCEPTION, props reject stray modifier keys.
    budget: {newTypes: 266, newBuilders: 494},
    body: (line, p) => {
      if (line === 'curBuilders')
        return `const ${p}A = c.pgTable('teams', {id: c.serial('id').primaryKey()});
const ${p}B = c.pgTable('members', {id: c.serial('id').primaryKey(), teamId: c.integer('team_id').references(() => cCols(${p}A).id)});
declare const ${p}row: CSelect<typeof ${p}B>; export const ${p}t: number | null = ${p}row.teamId;`;
      if (line === 'newBuilders')
        return `const ${p}A = n.pgTable('teams', {id: n.serial('id', {primaryKey: true})});
const ${p}B = n.pgTable('members', {id: n.serial('id', {primaryKey: true}), teamId: n.integer('team_id', {references: [() => nTableRef(${p}A, 'id')]})});
declare const ${p}row: NSelect<typeof ${p}B>; export const ${p}t: number | null = ${p}row.teamId;`;
      if (line === 'curTypes')
        return `type ${p}A = c.PgTable<'teams', {id: c.Serial<'id', {primaryKey: true}>}>;
type ${p}B = c.PgTable<'members', {id: c.Serial<'id', {primaryKey: true}>; teamId: c.Integer<'team_id', {references: [{table: 'teams'; column: 'id'}]}>}>;
declare const ${p}row: CSelect<${p}B>; export const ${p}t: number | null = ${p}row.teamId;`;
      return `type ${p}A = n.PgTable<'teams', {id: n.Serial<{primaryKey: true}>}>;
type ${p}B = n.PgTable<'members', {id: n.Serial<{primaryKey: true}>; teamId: n.Integer<{references: [NTableRef<${p}A, 'id'>]}>}, [], {teamId: 'team_id'}>;
declare const ${p}row: NSelect<${p}B>; export const ${p}t: number | null = ${p}row.teamId;`;
    },
  },
  {
    label: 'refineTableType, select',
    // 1277 -> 1421 and 1729 -> 1918: a REVIEWED EXCEPTION, props reject stray modifier keys.
    budget: {newTypes: 1421, newBuilders: 1918},
    body: (line, p) => {
      const refine = isCur(line) ? 'cRefine' : 'nRefine';
      const source = line.endsWith('Builders') ? `${p}V` : `({} as ${p}T)`;
      return `${declare(line, p, 'users', MIXED)}
const ${p}R = ${refine}(${source}, {name: {maxLength: 50}});
type ${p}Row = ${select(line, `typeof ${p}R`)};\n${readMixed(p)}`;
    },
  },
  {
    label: 'toDrizzle + select / insert / update query',
    // 8812 -> 8956 and 9915 -> 10104: a REVIEWED EXCEPTION, props reject stray modifier keys.
    budget: {newTypes: 8956, newBuilders: 10104},
    body: (line, p) => {
      const toDz = isCur(line) ? 'cToDrizzle' : 'nToDrizzle';
      const source = line.endsWith('Builders') ? `${p}V` : `({} as ${p}T)`;
      return `${declare(line, p, 'users', MIXED)}
const ${p}D = ${toDz}(${source});
const ${p}Q = db.select().from(${p}D);
declare const ${p}rows: Awaited<typeof ${p}Q>;
export const ${p}n: string = ${p}rows[0]!.name;
export const ${p}w: Date = ${p}rows[0]!.createdAt;
export const ${p}i = db.insert(${p}D).values({id: 'x', name: 'a', age: 21, role: 'user'});
export const ${p}u = db.update(${p}D).set({age: 31});`;
    },
  },
];

// ── mysql and sqlite: the same four lines over three shapes each ─────────────

const dialectHeader = (dialect: 'mysql' | 'sqlite', db: string) => `
import * as c from '@mionjs/drizzle-orm-${dialect}-core';
import {toDrizzle as cToDrizzle} from '@mionjs/drizzle-orm-${dialect}-core/drizzle';
import type {InferSelectModel as CSelect, InferInsertModel as CInsert} from '@mionjs/drizzle-orm';
import * as n from '../../drizzle-orm-${dialect}-core/next/index.ts';
import {toDrizzle as nToDrizzle} from '../../drizzle-orm-${dialect}-core/next/drizzle.ts';
import type {InferSelectModel as NSelect, InferInsertModel as NInsert} from '../../drizzle-orm/next/models.ts';
import {$type as n$type} from '../../drizzle-orm/next/index.ts';
${db}
export {};
`;

interface DialectBlock {
  dialect: 'mysql' | 'sqlite';
  measure: ReturnType<typeof makeMeasurer>;
  shapes: Shape[];
}

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

const readRow = (p: string, reads: Array<[string, string]>) =>
  `declare const ${p}row: ${p}Row;\n` +
  reads.map(([key, type], i) => `export const ${p}${i}: ${type} = ${p}row.${key};`).join('\n');

function dialectShapes(
  tableFn: string,
  tableType: string,
  mixed: ColSpec[],
  mixedReads: Array<[string, string]>,
  wide: ColSpec[],
  wideReads: Array<[string, string]>,
  queries: (p: string) => string,
  budgets: [Shape['budget'], Shape['budget'], Shape['budget']]
): Shape[] {
  const declareIn = (line: Line, p: string, table: string, cols: ColSpec[]) => declare(line, p, table, cols, tableFn, tableType);
  return [
    {
      label: '5 mixed, select',
      budget: budgets[0],
      body: (line, p) =>
        `${declareIn(line, p, 'users', mixed)}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readRow(p, mixedReads)}`,
    },
    {
      label: 'wide vocabulary, select',
      budget: budgets[1],
      body: (line, p) => `${declareIn(line, p, 'w', wide)}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readRow(p, wideReads)}`,
    },
    {
      label: 'toDrizzle + select / insert / update query',
      budget: budgets[2],
      body: (line, p) => {
        const toDz = isCur(line) ? 'cToDrizzle' : 'nToDrizzle';
        const source = line.endsWith('Builders') ? `${p}V` : `({} as ${p}T)`;
        return `${declareIn(line, p, 'users', mixed)}\nconst ${p}D = ${toDz}(${source});\n${queries(p)}`;
      },
    },
  ];
}

const DIALECT_BLOCKS: DialectBlock[] = [
  {
    dialect: 'mysql',
    measure: makeMeasurer(
      dialectHeader(
        'mysql',
        `import type {MySqlDatabase, MySqlQueryResultHKT, PreparedQueryHKTBase} from 'drizzle-orm/mysql-core';
declare const db: MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase>;`
      ),
      {options: RESOLVING_OPTIONS, snippetFile: SNIPPET_FILE, diagnosticsScope: 'snippet'}
    ),
    shapes: dialectShapes(
      'mysqlTable',
      'MysqlTable',
      MYSQL_MIXED,
      [
        ['id', 'number'],
        ['name', 'string'],
        ['age', 'number'],
        ['role', 'string'],
        ['createdAt', 'Date'],
      ],
      MYSQL_WIDE,
      [
        ['id', 'number'],
        ['role', 'string'],
        ['seq', 'number'],
        ['payload', '{kind: string} | null'],
        ['email', 'string | null'],
        ['updatedAt', 'Date'],
        ['big', 'bigint | null'],
      ],
      (p) => `const ${p}Q = db.select().from(${p}D);
declare const ${p}rows: Awaited<typeof ${p}Q>;
export const ${p}n: string = ${p}rows[0]!.name;
export const ${p}w: Date = ${p}rows[0]!.createdAt;
const ${p}I = db.insert(${p}D).values({name: 'a', age: 21, role: 'user'}).$returningId();
declare const ${p}ids: Awaited<typeof ${p}I>;
export const ${p}id: number = ${p}ids[0]!.id;
export const ${p}u = db.update(${p}D).set({age: 31});`,
      [
        {newTypes: 712, newBuilders: 1184},
        {newTypes: 1040, newBuilders: 1773},
        {newTypes: 8583, newBuilders: 9786},
      ]
    ),
  },
  {
    dialect: 'sqlite',
    measure: makeMeasurer(
      dialectHeader(
        'sqlite',
        `import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';
declare const db: BaseSQLiteDatabase<'sync', unknown>;`
      ),
      {options: RESOLVING_OPTIONS, snippetFile: SNIPPET_FILE, diagnosticsScope: 'snippet'}
    ),
    shapes: dialectShapes(
      'sqliteTable',
      'SqliteTable',
      SQLITE_MIXED,
      [
        ['id', 'number'],
        ['name', 'string'],
        ['age', 'number'],
        ['role', 'string'],
        ['createdAt', 'Date'],
      ],
      SQLITE_WIDE,
      [
        ['id', 'number'],
        ['role', 'string'],
        ['flag', 'boolean'],
        ['payload', '{kind: string} | null'],
        ['email', 'string | null'],
        ['amount', 'number'],
        ['big', 'bigint | null'],
      ],
      (p) => `const ${p}Q = db.select().from(${p}D);
declare const ${p}rows: Awaited<typeof ${p}Q>;
export const ${p}n: string = ${p}rows[0]!.name;
export const ${p}w: Date = ${p}rows[0]!.createdAt;
export const ${p}i = db.insert(${p}D).values({name: 'a', age: 21, role: 'user', createdAt: new Date()});
export const ${p}u = db.update(${p}D).set({age: 31});`,
      [
        {newTypes: 658, newBuilders: 1058},
        {newTypes: 977, newBuilders: 1631},
        {newTypes: 7672, newBuilders: 8695},
      ]
    ),
  },
];

const PREFIX: Record<Line, string> = {curBuilders: 'cb', curTypes: 'ct', newTypes: 'nt', newBuilders: 'nb'};
const measured = new Map<string, Record<Line, number>>();

// Without these, a broken import collapses every type to `any` and the counts drop.
const SHAPE_PINS = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
${declare('curBuilders', 'pa', 'users', MIXED)}
${declare('newTypes', 'pb', 'users', MIXED)}
${declare('newBuilders', 'pc', 'users', MIXED)}
${declare('curBuilders', 'wa', 'w', WIDE)}
${declare('newTypes', 'wb', 'w', WIDE)}
${declare('newBuilders', 'wc', 'w', WIDE)}
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
    const blocks = [{dialect: 'pg', measure, shapes: SHAPES}, ...DIALECT_BLOCKS];
    for (const block of blocks) {
      for (const shape of block.shapes) {
        const row = {} as Record<Line, number>;
        for (const line of LINES) {
          const result = block.measure(shape.body(line, PREFIX[line]));
          expect(
            result.errors,
            `${block.dialect} "${shape.label}" / ${line} should type-check cleanly:\n  ${result.errors.join('\n  ')}`
          ).toEqual([]);
          row[line] = result.netInstantiations;
        }
        measured.set(`${block.dialect}: ${shape.label}`, row);
      }
    }
  });

  afterAll(() => {
    writeColumnFormatsReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      rows: [{dialect: 'pg', shapes: SHAPES}, ...DIALECT_BLOCKS].flatMap(({dialect, shapes}) =>
        shapes.map(
          (shape): ColumnFormatsRow => ({
            dialect,
            label: shape.label,
            ...measured.get(`${dialect}: ${shape.label}`)!,
            budget: shape.budget,
          })
        )
      ),
    });
  });

  for (const {dialect, shapes} of [{dialect: 'pg', shapes: SHAPES}, ...DIALECT_BLOCKS]) {
    for (const shape of shapes) budgetTest(dialect, shape);
  }
  function budgetTest(dialect: string, shape: Shape) {
    it(`${dialect}: ${shape.label}: the new lines stay within their budgets`, () => {
      const row = measured.get(`${dialect}: ${shape.label}`)!;
      expect(row.newTypes, `new types cost ${row.newTypes}, over ${shape.budget.newTypes}`).toBeLessThanOrEqual(
        shape.budget.newTypes
      );
      expect(row.newBuilders, `new builders cost ${row.newBuilders}, over ${shape.budget.newBuilders}`).toBeLessThanOrEqual(
        shape.budget.newBuilders
      );
    });
  }

  it('the new builder table is its hand-written twin, and the models are the shipped ones', () => {
    const result = measure(SHAPE_PINS);
    expect(result.errors, `shape pins failed:\n  ${result.errors.join('\n  ')}`).toEqual([]);
  });
});
