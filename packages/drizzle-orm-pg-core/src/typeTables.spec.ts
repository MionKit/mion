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
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';
import type {Default, DefaultRandom, Integer, NotNull, PgTable, PrimaryKey, Uuid, Varchar} from './index.ts';
import {integer, pgTable, uuid, varchar} from './index.ts';
import {tableFromType, toDrizzle} from './drizzle.ts';

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

describe('pg type-defined tables — same drizzle table', () => {
  it('tableFromType materializes the same table as the builder road', () => {
    expect(project(tableFromType<TwinType>(getRunType<TwinType>()))).toEqual(project(toDrizzle(twinBuilders)));
  });

  it('tableFromType is memoized per type id', () => {
    expect(tableFromType<TwinType>(getRunType<TwinType>())).toBe(tableFromType<TwinType>(getRunType<TwinType>()));
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
