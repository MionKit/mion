/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The two-roads oracle for pg, on the pipeline slice (varchar / integer /
// uuid + NotNull / PrimaryKey / Default / DefaultRandom): a table written as
// builders and the same table written as a pure type must yield
//   1. the same drizzle table out of materialization (getTableConfig equal),
//   2. the same model runtype id, in BOTH marker call shapes (the Marker test
//      coverage rule in ts-go-runtypes/CLAUDE.md).

import {describe, it, expect} from 'vitest';
import {getTableConfig} from 'drizzle-orm/pg-core';
import {getRunType, getRunTypeId} from '@ts-runtypes/core';
import type {InferInsertModel, InferSelectModel, References, Sql} from '@mionjs/drizzle-orm';
import {sql as slimSql} from '@mionjs/drizzle-orm';
import {project as sharedProject} from '../test/tableSpecShared.ts';
import type {
  $Type,
  Array as PgArray,
  Default,
  DefaultNow,
  DefaultRandom,
  GeneratedAlwaysAsIdentity,
  Integer,
  Jsonb,
  NotNull,
  PgTable,
  PrimaryKey,
  Serial,
  Text,
  Timestamp,
  Unique,
  Uuid,
  Varchar,
} from './index.ts';
import {integer, jsonb, pgTable, serial, tableFromType, text, timestamp, uuid, varchar} from './index.ts';
import {toDrizzle} from './drizzle.ts';

// The same table, both roads.
const twinBuilders = pgTable('twins', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull().default(21),
  bio: varchar('bio', {length: 500}),
  note: varchar(),
});
type TwinType = PgTable<
  'twins',
  {
    id: Uuid<'id'> & PrimaryKey & DefaultRandom;
    name: Varchar<'name', {length: 100}> & NotNull;
    age: Integer<'age'> & NotNull & Default<21>;
    bio: Varchar<'bio', {length: 500}>;
    note: Varchar;
  }
>;

type BuilderSelect = InferSelectModel<typeof twinBuilders>;
type TypeSelect = InferSelectModel<TwinType>;
type BuilderInsert = InferInsertModel<typeof twinBuilders>;
type TypeInsert = InferInsertModel<TwinType>;

function project(table: unknown) {
  const config = getTableConfig(table as never);
  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: column.default,
      primary: column.primary,
    })),
  };
}

// The widened vocabulary twin: serial base flags, enum text, identity, array,
// $type, unique, defaultNow.
const wideBuilders = pgTable('twins_wide', {
  id: serial('id').primaryKey(),
  role: text('role', {enum: ['free', 'pro']}).notNull(),
  seq: integer('seq').generatedAlwaysAsIdentity(),
  tags: text('tags').array().notNull(),
  meta: jsonb('meta').$type<{tags: string[]}>().notNull(),
  score: integer('score').unique('uq_score'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
type WideType = PgTable<
  'twins_wide',
  {
    id: Serial<'id'> & PrimaryKey;
    role: Text<'role', {enum: ['free', 'pro']}> & NotNull;
    seq: Integer<'seq'> & GeneratedAlwaysAsIdentity;
    tags: Text<'tags'> & PgArray & NotNull;
    meta: Jsonb<'meta'> & $Type<{tags: string[]}> & NotNull;
    score: Integer<'score'> & Unique<'uq_score'>;
    createdAt: Timestamp<'created_at'> & NotNull & DefaultNow;
  }
>;
type WideSelectBuilders = InferSelectModel<typeof wideBuilders>;
type WideSelectType = InferSelectModel<WideType>;

describe('pg type-defined tables — same drizzle table', () => {
  it('toDrizzle(tableFromType(...)) materializes the same table as the builder road', () => {
    expect(project(toDrizzle(tableFromType<TwinType>(getRunType<TwinType>())))).toEqual(project(toDrizzle(twinBuilders)));
  });

  it('tableFromType returns the same slim table per type id (one materialization)', () => {
    const first = tableFromType<TwinType>(getRunType<TwinType>());
    expect(first).toBe(tableFromType<TwinType>(getRunType<TwinType>()));
    expect(toDrizzle(first)).toBe(toDrizzle(first));
  });
});

describe('pg type-defined tables — same model runtype id', () => {
  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('getRunTypeId static form: both roads resolve the select model to one id', () => {
    expect(getRunTypeId<TypeSelect>()).toBeTruthy();
    expect(getRunTypeId<TypeSelect>()).toBe(getRunTypeId<BuilderSelect>());
  });
  it('getRunTypeId reflection form: both roads resolve the select model to one id', () => {
    const fromType: TypeSelect = {id: 'x', name: 'n', age: 1, bio: null, note: null} as TypeSelect;
    const fromBuilders: BuilderSelect = fromType as BuilderSelect;
    expect(getRunTypeId(fromType)).toBeTruthy();
    expect(getRunTypeId(fromType)).toBe(getRunTypeId(fromBuilders));
    expect(getRunTypeId(fromType)).toBe(getRunTypeId<TypeSelect>());
  });
  it('insert models also share one id across roads (static + reflection forms)', () => {
    const insert: TypeInsert = {name: 'n', age: 2} as TypeInsert;
    expect(getRunTypeId<TypeInsert>()).toBe(getRunTypeId<BuilderInsert>());
    expect(getRunTypeId(insert)).toBe(getRunTypeId<TypeInsert>());
  });
});

// References + literal sql: the runtime bridge resolves the referenced table
// through deps and rebuilds the sql template.
const parentsBuilders = pgTable('parents', {id: integer('id').primaryKey()});
const childrenBuilders = pgTable('children', {
  pid: integer('pid')
    .references(() => parentsBuilders.id, {onDelete: 'cascade'})
    .notNull(),
  createdAt: timestamp('created_at').default(slimSql`now()`),
});
type ParentsType = PgTable<'parents', {id: Integer<'id'> & PrimaryKey}>;
type ChildrenType = PgTable<
  'children',
  {
    pid: Integer<'pid'> & References<'parents', 'id', {onDelete: 'cascade'}> & NotNull;
    createdAt: Timestamp<'created_at'> & Default<Sql<'now()'>>;
  }
>;

describe('pg type-defined tables — references and literal sql', () => {
  it('References resolves through deps and sql defaults rebuild, matching the builder road', () => {
    const parentsFromType = tableFromType<ParentsType>(getRunType<ParentsType>());
    const childrenFromType = tableFromType<ChildrenType>(getRunType<ChildrenType>(), {
      tables: {parents: parentsFromType as object},
    });
    expect(sharedProject(toDrizzle(childrenFromType))).toEqual(sharedProject(toDrizzle(childrenBuilders)));
    expect(sharedProject(toDrizzle(parentsFromType))).toEqual(sharedProject(toDrizzle(parentsBuilders)));
  });

  it('a missing References dep fails with an actionable error', () => {
    type Lonely = PgTable<'lonely', {pid: Integer<'pid'> & References<'nowhere', 'id'>}>;
    expect(() => tableFromType<Lonely>(getRunType<Lonely>())).toThrowError(/references table "nowhere".*deps/);
  });
});

describe('pg type-defined tables — widened vocabulary twin', () => {
  it('toDrizzle(tableFromType(...)) equals the builder road for the wide table', () => {
    expect(project(toDrizzle(tableFromType<WideType>(getRunType<WideType>())))).toEqual(project(toDrizzle(wideBuilders)));
  });
  it('wide models share one id across roads (static + reflection forms)', () => {
    const row: WideSelectType = {} as WideSelectType;
    expect(getRunTypeId<WideSelectType>()).toBe(getRunTypeId<WideSelectBuilders>());
    expect(getRunTypeId(row)).toBe(getRunTypeId<WideSelectType>());
  });
});
