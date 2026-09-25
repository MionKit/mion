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
function declare(line: Line, prefix: string, table: string, cols: ColSpec[]): string {
  if (line === 'curBuilders')
    return `const ${prefix}V = c.pgTable('${table}', {${cols.map((x) => `${x.key}: ${x.curB},`).join(' ')}});\ntype ${prefix}T = typeof ${prefix}V;`;
  if (line === 'newBuilders')
    return `const ${prefix}V = n.pgTable('${table}', {${cols.map((x) => `${x.key}: ${x.newB},`).join(' ')}});\ntype ${prefix}T = typeof ${prefix}V;`;
  if (line === 'curTypes')
    return `type ${prefix}T = c.PgTable<'${table}', {${cols.map((x) => `${x.key}: ${x.curT};`).join(' ')}}>;`;
  const names = cols.filter((x) => x.db !== undefined && x.db !== x.key).map((x) => `${x.key}: '${x.db}'`);
  return `type ${prefix}T = n.PgTable<'${table}', {${cols.map((x) => `${x.key}: ${x.newT};`).join(' ')}}${names.length ? `, [], {${names.join('; ')}}` : ''}>;`;
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
    budget: {newTypes: 539, newBuilders: 971},
    body: (line, p) => `${declare(line, p, 'users', MIXED)}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readMixed(p)}`,
  },
  {
    label: '5 mixed, select + insert',
    budget: {newTypes: 1132, newBuilders: 1638},
    body: (line, p) =>
      `${declare(line, p, 'users', MIXED)}\ntype ${p}Row = ${select(line, `${p}T`)};\ntype ${p}New = ${insert(line, `${p}T`)};\n${readMixed(p)}
export const ${p}NewUser: ${p}New = {id: 'x' as never, name: 'a', age: 1, role: 'admin'};`,
  },
  ...(
    [
      [10, {newTypes: 210, newBuilders: 364}],
      [20, {newTypes: 300, newBuilders: 574}],
      [40, {newTypes: 480, newBuilders: 994}],
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
    budget: {newTypes: 702, newBuilders: 1293},
    body: (line, p) => `${declare(line, p, 'w', WIDE)}\ntype ${p}Row = ${select(line, `${p}T`)};\n${readWide(p)}`,
  },
  {
    label: 'two tables, one reference',
    // 160 -> 212: a REVIEWED EXCEPTION, TableRef checks the column key and takes a name for self-references.
    budget: {newTypes: 212, newBuilders: 423},
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
    budget: {newTypes: 1277, newBuilders: 1729},
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
    budget: {newTypes: 8812, newBuilders: 9915},
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
    for (const shape of SHAPES) {
      const row = {} as Record<Line, number>;
      for (const line of LINES) {
        const result = measure(shape.body(line, PREFIX[line]));
        expect(result.errors, `"${shape.label}" / ${line} should type-check cleanly:\n  ${result.errors.join('\n  ')}`).toEqual(
          []
        );
        row[line] = result.netInstantiations;
      }
      measured.set(shape.label, row);
    }
  });

  afterAll(() => {
    writeColumnFormatsReport({
      typescript: ts.version,
      drizzleOrm: drizzleVersion,
      rows: SHAPES.map((shape): ColumnFormatsRow => ({label: shape.label, ...measured.get(shape.label)!, budget: shape.budget})),
    });
  });

  for (const shape of SHAPES) {
    it(`${shape.label}: the new lines stay within their budgets`, () => {
      const row = measured.get(shape.label)!;
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
