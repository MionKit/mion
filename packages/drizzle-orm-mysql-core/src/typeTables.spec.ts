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
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import type {InferInsertModel, InferSelectModel, RtTableMeta} from '@mionjs/drizzle-orm';
import {rtTableBrand} from '@mionjs/drizzle-orm';
import type {AnyMysqlTable, Int, MysqlTable, Serial, Text, Timestamp, Varchar} from './index.ts';
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
    id: Serial<'id', {primaryKey: true}>;
    seq: Int<'seq', {unsigned: true; autoincrement: true}>;
    name: Varchar<'name', {length: 100; notNull: true}>;
    age: Int<'age', {notNull: true; default: [21]}>;
    plan: Text<'plan', {enum: ['free', 'pro']; notNull: true}>;
    createdAt: Timestamp<'created_at', {notNull: true; defaultNow: true}>;
    touchedAt: Timestamp<'touched_at', {onUpdateNow: true}>;
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
    expect(project(toDrizzle(tableFromType<TwinType>()))).toEqual(project(toDrizzle(twinBuilders)));
  });

  it('tableFromType returns the same slim table per type id (one materialization)', () => {
    const first = tableFromType<TwinType>();
    expect(first).toBe(tableFromType<TwinType>());
    expect(toDrizzle(first)).toBe(toDrizzle(first));
  });

  it('toDrizzle<T>() is the happy path: same drizzle table object as the two-step road', () => {
    expect(toDrizzle<TwinType>()).toBe(toDrizzle(tableFromType<TwinType>()));
    expect(project(toDrizzle<TwinType>())).toEqual(project(toDrizzle(twinBuilders)));
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
    id: Int<'id', {primaryKey: true}>;
    slug: Varchar<'slug', {length: 80; notNull: true; $defaultFn: true}>;
    counter: Int<'counter', {$onUpdate: true}>;
  }
>;

describe('mysql type-defined tables — runtime-callback modifiers', () => {
  it('materializes the same table as the builder road, callbacks included', () => {
    const fromType = tableFromType<RuntimeType>({
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
  it('two calls with options are independent: each keeps its own callback', () => {
    // What the builder road does: every mysqlTable() call is a fresh table. Two
    // tests declaring the same table with their own closure must not share one,
    // or the second gets the first one's exhausted callback.
    const first = tableFromType<RuntimeType>({runtime: {slug: {$defaultFn: () => 'first'}, counter: {$onUpdate: () => 1}}});
    const second = tableFromType<RuntimeType>({runtime: {slug: {$defaultFn: () => 'second'}, counter: {$onUpdate: () => 2}}});
    expect(first).not.toBe(second);
    const slugDefault = (table: unknown) =>
      (
        getTableConfig(table as never).columns.find((column) => column.name === 'slug') as unknown as {defaultFn: () => unknown}
      ).defaultFn();
    expect(slugDefault(toDrizzle(first))).toBe('first');
    expect(slugDefault(toDrizzle(second))).toBe('second');
  });
  it('runtime models share one id across roads (static + reflection forms)', () => {
    type TypeInsertRuntime = InferInsertModel<RuntimeType>;
    const minimal: TypeInsertRuntime = {id: 1}; // slug is notNull but $DefaultFn makes it optional
    expect(getRunTypeId<TypeInsertRuntime>()).toBe(getRunTypeId<InferInsertModel<typeof runtimeBuilders>>());
    expect(getRunTypeId(minimal)).toBe(getRunTypeId<TypeInsertRuntime>());
  });
});

// A table carries the dialect that recorded it, inside its own metadata. That
// is what makes reaching the wrong package's toDrizzle a COMPILE error, where
// it used to typecheck and then die at materialization: every table replays its
// own captured buildTable closure against whichever context it is handed.
//
// The foreign table is spelled here rather than imported, because a dialect
// package must not depend on its siblings. What this package owes the pin is
// the other half: that its OWN builders and table types carry its tag.
describe('mysql tables are typed to the mysql package', () => {
  it('tags what mysqlTable() and MysqlTable<> produce as mysql', () => {
    const table = mysqlTable('tagged', {id: int('id').primaryKey()});
    const accepted: AnyMysqlTable = table;
    type FromType = MysqlTable<'tagged', {id: Int<'id', {primaryKey: true}>}>;
    const acceptedType: AnyMysqlTable = {} as FromType;
    expect(accepted).toBe(table);
    expect(acceptedType).toBeDefined();
  });

  it('rejects another dialect table, as a value and as a type argument', () => {
    interface ForeignLike extends RtTableMeta<'users', {id: Int<'id'>}, []> {
      readonly [rtTableBrand]?: 'pg';
    }
    // @ts-expect-error a pg-tagged table is not a mysql table
    const rejected: AnyMysqlTable = {} as ForeignLike;
    // @ts-expect-error and it cannot be rebuilt through this package's bridge
    void tableFromType<ForeignLike>;
    expect(rejected).toBeDefined();
  });
});
