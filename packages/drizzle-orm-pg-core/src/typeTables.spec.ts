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
import {getRunTypeId} from '@ts-runtypes/core';
import type {InferInsertModel, InferSelectModel, References, Sql} from '@mionjs/drizzle-orm';
import {sql as slimSql} from '@mionjs/drizzle-orm';
import {project as sharedProject} from '../test/tableSpecShared.ts';
import type {
  $Default,
  $DefaultFn,
  $OnUpdate,
  $OnUpdateFn,
  $Type,
  Array as PgArray,
  CheckEntry,
  Default,
  DefaultNow,
  DefaultRandom,
  ForeignKeyEntry,
  GeneratedAlwaysAsIdentity,
  IndexEntry,
  Integer,
  Jsonb,
  NotNull,
  PgTable,
  PrimaryKey,
  Serial,
  Text,
  Timestamp,
  Unique,
  UniqueEntry,
  UniqueIndexEntry,
  Uuid,
  Varchar,
} from './index.ts';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  tableFromType,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from './index.ts';
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
    expect(project(toDrizzle(tableFromType<TwinType>()))).toEqual(project(toDrizzle(twinBuilders)));
  });

  it('tableFromType returns the same slim table per type id (one materialization)', () => {
    const first = tableFromType<TwinType>();
    expect(first).toBe(tableFromType<TwinType>());
    expect(toDrizzle(first)).toBe(toDrizzle(first));
  });
});

describe('pg type-defined tables — marker forms', () => {
  it('toDrizzle<T>() is the happy path: same drizzle table object as the two-step road', () => {
    expect(toDrizzle<TwinType>()).toBe(toDrizzle(tableFromType<TwinType>()));
    expect(project(toDrizzle<TwinType>())).toEqual(project(toDrizzle(twinBuilders)));
  });
  it('marker forms carry options (References through toDrizzle<T>({tables}))', () => {
    const parents = tableFromType<ParentsType>();
    const children = toDrizzle<ChildrenType>({tables: {parents: parents as object}});
    expect(sharedProject(children)).toEqual(sharedProject(toDrizzle(childrenBuilders)));
  });
  it('a thunk in options.tables resolves a table declared later in the file', () => {
    // The ordering drizzle's own schemas are written in: `references: () =>
    // cities.id` is lazy, so the target routinely sits further down. A bare
    // value would be read before its declaration exists; the thunk is not.
    const children = toDrizzle<ChildrenType>({tables: {parents: () => lateParents as object}});
    const lateParents = tableFromType<ParentsType>();
    expect(sharedProject(children)).toEqual(sharedProject(toDrizzle(childrenBuilders)));
  });
  it('toDrizzle still rejects a value that is neither table, handle nor options', () => {
    expect(() => toDrizzle({bogus: true} as never)).toThrowError(/takes a slim table/);
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
    const parentsFromType = tableFromType<ParentsType>();
    const childrenFromType = tableFromType<ChildrenType>({
      tables: {parents: parentsFromType as object},
    });
    expect(sharedProject(toDrizzle(childrenFromType))).toEqual(sharedProject(toDrizzle(childrenBuilders)));
    expect(sharedProject(toDrizzle(parentsFromType))).toEqual(sharedProject(toDrizzle(parentsBuilders)));
  });

  it('a missing References dep fails with an actionable error', () => {
    type Lonely = PgTable<'lonely', {pid: Integer<'pid'> & References<'nowhere', 'id'>}>;
    expect(() => tableFromType<Lonely>()).toThrowError(/references table "nowhere".*options/);
  });
});

// Table-level extras: the extraConfig tuple road.
const extrasBuilders = pgTable(
  'extras_t',
  {
    a: integer('a').notNull(),
    b: varchar('b', {length: 10}),
    pid: integer('pid'),
  },
  (t) => [
    index('idx_a').on(t.a),
    uniqueIndex('uidx_b').on(t.b),
    unique('uq_ab').on(t.a, t.b),
    check('chk_a', slimSql`a >= 0`),
    foreignKey({name: 'fk_pid', columns: [t.pid], foreignColumns: [parentsBuilders.id]}),
  ]
);
type ExtrasType = PgTable<
  'extras_t',
  {
    a: Integer<'a'> & NotNull;
    b: Varchar<'b', {length: 10}>;
    pid: Integer<'pid'>;
  },
  [
    IndexEntry<'idx_a', ['a']>,
    UniqueIndexEntry<'uidx_b', ['b']>,
    UniqueEntry<'uq_ab', ['a', 'b']>,
    CheckEntry<'chk_a', Sql<'a >= 0'>>,
    ForeignKeyEntry<'fk_pid', ['pid'], 'parents', ['id']>,
  ]
>;

describe('pg type-defined tables — table-level extras', () => {
  it('the extras tuple materializes the same indexes, checks and foreign keys', () => {
    const parentsFromType = tableFromType<ParentsType>();
    const extrasFromType = tableFromType<ExtrasType>({tables: {parents: parentsFromType as object}});
    expect(sharedProject(toDrizzle(extrasFromType))).toEqual(sharedProject(toDrizzle(extrasBuilders)));
  });
  it('extras models ignore the extras tuple (same id as the builder road)', () => {
    type A = InferSelectModel<ExtrasType>;
    type B = InferSelectModel<typeof extrasBuilders>;
    const row: A = {} as A;
    expect(getRunTypeId<A>()).toBe(getRunTypeId<B>());
    expect(getRunTypeId(row)).toBe(getRunTypeId<A>());
  });
});

// Runtime-callback modifiers: the type carries the $ markers, the callbacks
// ride options.runtime, and both roads must materialize the same table AND
// the same runtime behavior (the callbacks themselves).
const runtimeBuilders = pgTable('runtime_t', {
  id: uuid('id').primaryKey(),
  slug: varchar('slug', {length: 80})
    .notNull()
    .$defaultFn(() => 'slug-1'),
  counter: integer('counter').$default(() => 7),
  updatedAt: timestamp('updated_at', {mode: 'string'}).$onUpdate(() => 'updated-now'),
  touched: integer('touched').$onUpdateFn(() => 1),
});
type RuntimeType = PgTable<
  'runtime_t',
  {
    id: Uuid<'id'> & PrimaryKey;
    slug: Varchar<'slug', {length: 80}> & NotNull & $DefaultFn;
    counter: Integer<'counter'> & $Default;
    updatedAt: Timestamp<'updated_at', {mode: 'string'}> & $OnUpdate;
    touched: Integer<'touched'> & $OnUpdateFn;
  }
>;
const runtimeFromType = () =>
  tableFromType<RuntimeType>({
    runtime: {
      slug: {$defaultFn: () => 'slug-1'},
      counter: {$default: () => 7},
      updatedAt: {$onUpdate: () => 'updated-now'},
      touched: {$onUpdateFn: () => 1},
    },
  });
/** Invoke each drizzle column's runtime hooks (set by the $ modifiers) so the
 *  oracle compares callback BEHAVIOR, not function identity. */
function runtimeHooks(table: unknown) {
  const config = getTableConfig(table as never);
  return Object.fromEntries(
    config.columns.map((column) => {
      const hooks = column as unknown as {defaultFn?: () => unknown; onUpdateFn?: () => unknown};
      return [column.name, {defaultFn: hooks.defaultFn?.(), onUpdateFn: hooks.onUpdateFn?.()}];
    })
  );
}

describe('pg type-defined tables — runtime-callback modifiers', () => {
  it('materializes the same table as the builder road, callbacks included', () => {
    const bridge = toDrizzle(runtimeFromType());
    expect(project(bridge)).toEqual(project(toDrizzle(runtimeBuilders)));
    expect(runtimeHooks(bridge)).toEqual(runtimeHooks(toDrizzle(runtimeBuilders)));
    expect(runtimeHooks(bridge).slug).toEqual({defaultFn: 'slug-1', onUpdateFn: undefined});
    expect(runtimeHooks(bridge).updated_at).toEqual({defaultFn: undefined, onUpdateFn: 'updated-now'});
  });
  it('runtime models share one id across roads (static + reflection forms)', () => {
    type TypeInsertRuntime = InferInsertModel<RuntimeType>;
    const minimal: TypeInsertRuntime = {id: 'x'}; // slug is notNull but $DefaultFn makes it optional
    expect(getRunTypeId<TypeInsertRuntime>()).toBe(getRunTypeId<InferInsertModel<typeof runtimeBuilders>>());
    expect(getRunTypeId(minimal)).toBe(getRunTypeId<TypeInsertRuntime>());
  });
  it('two calls with options are independent: each keeps its own callback', () => {
    // What the builder road does: every mysqlTable()/pgTable() call is a fresh
    // table. Two tests declaring the same table with their own closure must not
    // share one, or the second gets the first one's exhausted callback.
    const rest = {counter: {$default: () => 7}, updatedAt: {$onUpdate: () => 'now'}, touched: {$onUpdateFn: () => 1}};
    const first = tableFromType<RuntimeType>({runtime: {slug: {$defaultFn: () => 'first'}, ...rest}});
    const second = tableFromType<RuntimeType>({runtime: {slug: {$defaultFn: () => 'second'}, ...rest}});
    expect(first).not.toBe(second);
    expect(runtimeHooks(toDrizzle(first)).slug.defaultFn).toBe('first');
    expect(runtimeHooks(toDrizzle(second)).slug.defaultFn).toBe('second');
  });
  it('a $ marker without its options.runtime callback fails naming column and method', () => {
    type Bare = PgTable<'bare_runtime', {slug: Varchar<'slug', {length: 5}> & $DefaultFn}>;
    expect(() => tableFromType<Bare>()).toThrowError(/column "slug" carries the \$defaultFn marker/);
  });
  it('an options.runtime callback without its marker fails', () => {
    type NoMarker = PgTable<'no_marker_runtime', {n: Integer<'n'>}>;
    expect(() => tableFromType<NoMarker>({runtime: {n: {$onUpdate: () => 1}}})).toThrowError(
      /options\.runtime\.n\.\$onUpdate has no matching/
    );
  });
});

describe('pg type-defined tables — widened vocabulary twin', () => {
  it('toDrizzle(tableFromType(...)) equals the builder road for the wide table', () => {
    expect(project(toDrizzle(tableFromType<WideType>()))).toEqual(project(toDrizzle(wideBuilders)));
  });
  it('wide models share one id across roads (static + reflection forms)', () => {
    const row: WideSelectType = {} as WideSelectType;
    expect(getRunTypeId<WideSelectType>()).toBe(getRunTypeId<WideSelectBuilders>());
    expect(getRunTypeId(row)).toBe(getRunTypeId<WideSelectType>());
  });
});
