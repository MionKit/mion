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
import {getRunTypeId} from '@mionjs/run-types';
import type {InferInsertModel, InferSelectModel, RtTableMeta} from '@mionjs/drizzle-orm';
import {rtTableBrand} from '@mionjs/drizzle-orm';
import type {AnySqliteTable, Blob, Integer, Real, SqliteTable, Text} from './index.ts';
import {blob, integer, real, sqliteTable, tableFromType, text} from './index.ts';
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
    id: Integer<'id', {primaryKey: [{autoIncrement: true}]}>;
    title: Text<'title', {length: 80; notNull: true}>;
    rating: Real<'rating', {notNull: true; default: [4.5]}>;
    createdAt: Integer<'created_at', {mode: 'timestamp'; notNull: true}>;
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
    id: Integer<'id', {primaryKey: true}>;
    slug: Text<'slug', {length: 80; notNull: true; $defaultFn: true}>;
    counter: Integer<'counter', {$onUpdateFn: true}>;
  }
>;

describe('sqlite type-defined tables — runtime-callback modifiers', () => {
  it('materializes the same table as the builder road, callbacks included', () => {
    const fromType = tableFromType<RuntimeType>({
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
  it('two calls with options are independent: each keeps its own callback', () => {
    // What the builder road does: every sqliteTable() call is a fresh table. Two
    // tests declaring the same table with their own closure must not share one,
    // or the second gets the first one's exhausted callback.
    const first = tableFromType<RuntimeType>({runtime: {slug: {$defaultFn: () => 'first'}, counter: {$onUpdateFn: () => 1}}});
    const second = tableFromType<RuntimeType>({runtime: {slug: {$defaultFn: () => 'second'}, counter: {$onUpdateFn: () => 2}}});
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

// A blob column in buffer mode is the one sqlite column whose data type is
// Node's Buffer, and reflecting a Buffer used to halt the build outright on a
// project compiled against the ESNext lib (MKR009 naming IteratorObject). The
// lib-version half of that fix is pinned where the lib can be chosen — the Go
// typeid suite and devtools/test/esnext-lib-buffer.test.ts — since
// this spec runs under the repo's own ES2023 config. What belongs here is the
// column itself: it was the one exotic sqlite column the two-roads oracle had
// never covered, which is why the whole thing stayed hidden.
const blobBuilders = sqliteTable('blobs', {
  id: integer('id').primaryKey(),
  payload: blob('payload', {mode: 'buffer'}).notNull(),
  meta: blob('meta', {mode: 'json'}),
});
type BlobType = SqliteTable<
  'blobs',
  {
    id: Integer<'id', {primaryKey: true}>;
    payload: Blob<'payload', {mode: 'buffer'; notNull: true}>;
    meta: Blob<'meta', {mode: 'json'}>;
  }
>;

type BlobSelect = InferSelectModel<BlobType>;
type BlobBuilderSelect = InferSelectModel<typeof blobBuilders>;

describe('sqlite type-defined tables — blob columns', () => {
  it('materializes the same table as the builder road', () => {
    expect(project(toDrizzle(tableFromType<BlobType>()))).toEqual(project(toDrizzle(blobBuilders)));
  });

  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('getRunTypeId static form: a Buffer-typed column resolves and both roads share one id', () => {
    expect(getRunTypeId<BlobSelect>()).toBeTruthy();
    expect(getRunTypeId<BlobSelect>()).toBe(getRunTypeId<BlobBuilderSelect>());
  });
  it('getRunTypeId reflection form: the same Buffer-typed model lands on the static form id', () => {
    const row: BlobSelect = {id: 1, payload: Buffer.from('hi'), meta: null} as BlobSelect;
    expect(getRunTypeId(row)).toBe(getRunTypeId<BlobSelect>());
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
describe('sqlite tables are typed to the sqlite package', () => {
  it('tags what sqliteTable() and SqliteTable<> produce as sqlite', () => {
    const table = sqliteTable('tagged', {id: integer('id').primaryKey()});
    const accepted: AnySqliteTable = table;
    type FromType = SqliteTable<'tagged', {id: Integer<'id', {primaryKey: true}>}>;
    const acceptedType: AnySqliteTable = {} as FromType;
    expect(accepted).toBe(table);
    expect(acceptedType).toBeDefined();
  });

  it('rejects another dialect table, as a value and as a type argument', () => {
    interface ForeignLike extends RtTableMeta<'users', {id: Integer<'id'>}, []> {
      readonly [rtTableBrand]?: 'pg';
    }
    // @ts-expect-error a pg-tagged table is not a sqlite table
    const rejected: AnySqliteTable = {} as ForeignLike;
    // @ts-expect-error and it cannot be rebuilt through this package's bridge
    void tableFromType<ForeignLike>;
    expect(rejected).toBeDefined();
  });
});
