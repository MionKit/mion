/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The two-roads oracle for mysql (varchar / int / serial / text-enum / timestamp +
// NotNull / PrimaryKey / Default / Autoincrement / OnUpdateNow / DefaultNow):
// a table written as builders and the same table written as a pure type must
// yield
//   1. the same drizzle table out of materialization (getTableConfig equal),
//   2. the same model runtype id, in BOTH marker call shapes (the Marker test
//      coverage rule in ts-go-runtypes/CLAUDE.md).

import {describe, it, expect} from 'vitest';
import {getTableConfig} from 'drizzle-orm/mysql-core';
import {createValidateFn, getRunType, getRunTypeId} from '@ts-runtypes/core';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';
import type {
  $DefaultFn,
  $OnUpdate,
  Autoincrement,
  Default,
  DefaultNow,
  Int,
  MysqlTable,
  NotNull,
  OnUpdateNow,
  PrimaryKey,
  Serial,
  Text,
  Timestamp,
  Varchar,
} from './index.ts';
import {int, mysqlTable, serial, tableFromType, text, timestamp, varchar} from './index.ts';
import {toDrizzle} from './drizzle.ts';

// The same table, both roads.
const twinBuilders = mysqlTable('twins', {
  id: serial('id').primaryKey(),
  seq: int('seq', {unsigned: true}).autoincrement(),
  name: varchar('name', {length: 100}).notNull(),
  age: int('age').notNull().default(21),
  plan: text('plan', {enum: ['free', 'pro']}).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  touchedAt: timestamp('touched_at').onUpdateNow(),
});
type TwinType = MysqlTable<
  'twins',
  {
    id: Serial<'id'> & PrimaryKey;
    seq: Int<'seq', {unsigned: true}> & Autoincrement;
    name: Varchar<'name', {length: 100}> & NotNull;
    age: Int<'age'> & NotNull & Default<21>;
    plan: Text<'plan', {enum: ['free', 'pro']}> & NotNull;
    createdAt: Timestamp<'created_at'> & NotNull & DefaultNow;
    touchedAt: Timestamp<'touched_at'> & OnUpdateNow;
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

describe('mysql type-defined tables — same drizzle table', () => {
  it('toDrizzle(tableFromType(...)) materializes the same table as the builder road', () => {
    expect(project(toDrizzle(tableFromType<TwinType>(getRunType<TwinType>())))).toEqual(project(toDrizzle(twinBuilders)));
  });

  it('tableFromType returns the same slim table per type id (one materialization)', () => {
    const first = tableFromType<TwinType>(getRunType<TwinType>());
    expect(first).toBe(tableFromType<TwinType>(getRunType<TwinType>()));
    expect(toDrizzle(first)).toBe(toDrizzle(first));
  });
});

describe('mysql type-defined tables — same model runtype id', () => {
  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('getRunTypeId static form: both roads resolve the select model to one id', () => {
    expect(getRunTypeId<TypeSelect>()).toBeTruthy();
    expect(getRunTypeId<TypeSelect>()).toBe(getRunTypeId<BuilderSelect>());
  });
  it('getRunTypeId reflection form: both roads resolve the select model to one id', () => {
    const fromType: TypeSelect = {
      id: 1,
      seq: null,
      name: 'n',
      age: 30,
      plan: 'free',
      createdAt: new Date(),
      touchedAt: null,
    } as TypeSelect;
    const fromBuilders: BuilderSelect = fromType as BuilderSelect;
    expect(getRunTypeId(fromType)).toBeTruthy();
    expect(getRunTypeId(fromType)).toBe(getRunTypeId(fromBuilders));
    expect(getRunTypeId(fromType)).toBe(getRunTypeId<TypeSelect>());
  });
  it('insert models also share one id across roads (static + reflection forms)', () => {
    const insert: TypeInsert = {name: 'n', age: 2, plan: 'pro', createdAt: new Date()} as TypeInsert;
    expect(getRunTypeId<TypeInsert>()).toBe(getRunTypeId<BuilderInsert>());
    expect(getRunTypeId(insert)).toBe(getRunTypeId<TypeInsert>());
  });

  it('the validator compiled from the type-road model enforces the enum union', () => {
    const validate = createValidateFn<TypeSelect>();
    const row = {id: 1, seq: null, name: 'n', age: 30, plan: 'free', createdAt: new Date(), touchedAt: null};
    expect(validate(row)).toBe(true);
    expect(validate({...row, plan: 'enterprise'})).toBe(false); // not in the enum tuple
  });
});

// Runtime-callback modifiers: $ markers in the type, callbacks via
// options.runtime; same table AND same callback behavior on both roads.
const runtimeBuilders = mysqlTable('runtime_t', {
  id: int('id').primaryKey(),
  slug: varchar('slug', {length: 80})
    .notNull()
    .$defaultFn(() => 'slug-1'),
  counter: int('counter').$onUpdate(() => 7),
});
type RuntimeType = MysqlTable<
  'runtime_t',
  {
    id: Int<'id'> & PrimaryKey;
    slug: Varchar<'slug', {length: 80}> & NotNull & $DefaultFn;
    counter: Int<'counter'> & $OnUpdate;
  }
>;

describe('mysql type-defined tables — runtime-callback modifiers', () => {
  it('materializes the same table as the builder road, callbacks included', () => {
    const fromType = tableFromType<RuntimeType>(getRunType<RuntimeType>(), {
      runtime: {slug: {$defaultFn: () => 'slug-1'}, counter: {$onUpdate: () => 7}},
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
