/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The two-roads oracle for sqlite (integer / text / real + NotNull /
// PrimaryKey<{autoIncrement: true}> / Default): a table written as builders
// and the same table written as a pure type must yield
//   1. the same drizzle table out of materialization (getTableConfig equal),
//   2. the same model runtype id, in BOTH marker call shapes (the Marker test
//      coverage rule in ts-go-runtypes/CLAUDE.md).

import {describe, it, expect} from 'vitest';
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import {getRunType, getRunTypeId} from '@ts-runtypes/core';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';
import type {$DefaultFn, $OnUpdateFn, Default, Integer, NotNull, PrimaryKey, Real, SqliteTable, Text} from './index.ts';
import {integer, real, sqliteTable, tableFromType, text} from './index.ts';
import {toDrizzle} from './drizzle.ts';

// The same table, both roads. The autoIncrement primary key exercises the
// PrimaryKey<Config> marker: both roads must mark the insert id optional
// (hasDefault) and replay the same primaryKey({autoIncrement: true}) call.
const twinBuilders = sqliteTable('twins', {
  id: integer('id').primaryKey({autoIncrement: true}),
  title: text('title', {length: 80}).notNull(),
  rating: real('rating').notNull().default(4.5),
  createdAt: integer('created_at', {mode: 'timestamp'}).notNull(),
  note: text(),
});
type TwinType = SqliteTable<
  'twins',
  {
    id: Integer<'id'> & PrimaryKey<{autoIncrement: true}>;
    title: Text<'title', {length: 80}> & NotNull;
    rating: Real<'rating'> & NotNull & Default<4.5>;
    createdAt: Integer<'created_at', {mode: 'timestamp'}> & NotNull;
    note: Text;
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
      autoIncrement: (column as unknown as {autoIncrement?: boolean}).autoIncrement,
      primary: column.primary,
    })),
  };
}

describe('sqlite type-defined tables — same drizzle table', () => {
  it('toDrizzle(tableFromType(...)) materializes the same table as the builder road', () => {
    expect(project(toDrizzle(tableFromType<TwinType>(getRunType<TwinType>())))).toEqual(project(toDrizzle(twinBuilders)));
  });

  it('tableFromType returns the same slim table per type id (one materialization)', () => {
    const first = tableFromType<TwinType>(getRunType<TwinType>());
    expect(first).toBe(tableFromType<TwinType>(getRunType<TwinType>()));
    expect(toDrizzle(first)).toBe(toDrizzle(first));
  });
});

describe('sqlite type-defined tables — same model runtype id', () => {
  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('getRunTypeId static form: both roads resolve the select model to one id', () => {
    expect(getRunTypeId<TypeSelect>()).toBeTruthy();
    expect(getRunTypeId<TypeSelect>()).toBe(getRunTypeId<BuilderSelect>());
  });
  it('getRunTypeId reflection form: both roads resolve the select model to one id', () => {
    const fromType: TypeSelect = {id: 1, title: 't', rating: 4.5, createdAt: new Date(), note: null} as TypeSelect;
    const fromBuilders: BuilderSelect = fromType as BuilderSelect;
    expect(getRunTypeId(fromType)).toBeTruthy();
    expect(getRunTypeId(fromType)).toBe(getRunTypeId(fromBuilders));
    expect(getRunTypeId(fromType)).toBe(getRunTypeId<TypeSelect>());
  });
  it('insert models also share one id across roads (static + reflection forms)', () => {
    // The autoIncrement id is optional on insert on BOTH roads (hasDefault),
    // so one shared id proves the optionality matches.
    const insert: TypeInsert = {title: 't', rating: 1.5, createdAt: new Date()} as TypeInsert;
    expect(getRunTypeId<TypeInsert>()).toBe(getRunTypeId<BuilderInsert>());
    expect(getRunTypeId(insert)).toBe(getRunTypeId<TypeInsert>());
  });
});

// Runtime-callback modifiers: $ markers in the type, callbacks via
// options.runtime; same table AND same callback behavior on both roads.
const runtimeBuilders = sqliteTable('runtime_t', {
  id: integer('id').primaryKey(),
  slug: text('slug', {length: 80})
    .notNull()
    .$defaultFn(() => 'slug-1'),
  counter: integer('counter').$onUpdateFn(() => 7),
});
type RuntimeType = SqliteTable<
  'runtime_t',
  {
    id: Integer<'id'> & PrimaryKey;
    slug: Text<'slug', {length: 80}> & NotNull & $DefaultFn;
    counter: Integer<'counter'> & $OnUpdateFn;
  }
>;

describe('sqlite type-defined tables — runtime-callback modifiers', () => {
  it('materializes the same table as the builder road, callbacks included', () => {
    const fromType = tableFromType<RuntimeType>(getRunType<RuntimeType>(), {
      runtime: {slug: {$defaultFn: () => 'slug-1'}, counter: {$onUpdateFn: () => 7}},
    });
    const bridge = toDrizzle(fromType);
    expect(project(bridge)).toEqual(project(toDrizzle(runtimeBuilders)));
    const hooks = (table: unknown) =>
      getTableConfig(table as never).columns.map((column) => {
        const c = column as unknown as {defaultFn?: () => unknown; onUpdateFn?: () => unknown};
        return [column.name, c.defaultFn?.(), c.onUpdateFn?.()];
      });
    expect(hooks(bridge)).toEqual(hooks(toDrizzle(runtimeBuilders)));
    expect(hooks(bridge)).toContainEqual(['slug', 'slug-1', undefined]);
  });
  it('runtime models share one id across roads (static + reflection forms)', () => {
    type TypeInsertRuntime = InferInsertModel<RuntimeType>;
    const minimal: TypeInsertRuntime = {id: 1}; // slug is notNull but $DefaultFn makes it optional
    expect(getRunTypeId<TypeInsertRuntime>()).toBe(getRunTypeId<InferInsertModel<typeof runtimeBuilders>>());
    expect(getRunTypeId(minimal)).toBe(getRunTypeId<TypeInsertRuntime>());
  });
});
