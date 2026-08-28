/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for the slim pg surface: toDrizzle materializes EXACTLY the
// table a hand-written drizzle file builds (drizzle's own getTableConfig is
// the oracle, across columns, modifiers, enums, arrays, references and the
// whole extraConfig surface), materialization is memoized, refineTableType is
// identity, and the derived models compile validators that enforce every
// captured param with no runtime guards.

import {describe, it, expect} from 'vitest';
import {
  getTableConfig,
  check as dzCheck,
  foreignKey as dzForeignKey,
  index as dzIndex,
  integer as dzInteger,
  pgEnum as dzPgEnum,
  pgPolicy as dzPgPolicy,
  pgRole as dzPgRole,
  pgTable as dzPgTable,
  primaryKey as dzPrimaryKey,
  serial as dzSerial,
  text as dzText,
  timestamp as dzTimestamp,
  unique as dzUnique,
  uniqueIndex as dzUniqueIndex,
  uuid as dzUuid,
  varchar as dzVarchar,
  boolean as dzBoolean,
  jsonb as dzJsonb,
  numeric as dzNumeric,
  bigint as dzBigint,
  date as dzDate,
  time as dzTime,
  smallint as dzSmallint,
  doublePrecision as dzDoublePrecision,
  inet as dzInet,
  bit as dzBit,
} from 'drizzle-orm/pg-core';
import {sql as dzRealSql} from 'drizzle-orm';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {
  bigint,
  bit,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from './index.ts';
import type {InferInsertModel, InferSelectModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {refineTableType, sql} from '@mionjs/drizzle-orm';
import {toDrizzle} from './drizzle.ts';

// ── the equality oracle ──────────────────────────────────────────────────────

/** JSON-safe projection of everything the SQL depends on. */
function project(table: Parameters<typeof getTableConfig>[0]) {
  const config = getTableConfig(table);
  const normalizeValue = (value: unknown): unknown => {
    if (typeof value === 'function') return '<fn>';
    if (value !== null && typeof value === 'object' && 'queryChunks' in (value as object)) return '<sql>';
    return value;
  };
  const columnName = (column: unknown) => (column as {name: string}).name;
  return {
    name: config.name,
    schema: config.schema,
    columns: config.columns.map((column) => ({
      name: column.name,
      columnType: column.columnType,
      dataType: column.dataType,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: normalizeValue(column.default),
      hasRuntimeDefault: typeof (column as unknown as {defaultFn?: unknown}).defaultFn === 'function',
      primary: column.primary,
      isUnique: (column as unknown as {isUnique: boolean}).isUnique,
      enumValues: column.enumValues,
      generated: column.generated ? {type: column.generated.type, as: normalizeValue(column.generated.as)} : undefined,
      identity: (column as unknown as {generatedIdentity?: {type: string}}).generatedIdentity?.type,
    })),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: Record<string, unknown>}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        where: normalizeValue(indexConfig.where),
        columns: (indexConfig.columns as unknown[]).map((column) =>
          'queryChunks' in (column as object)
            ? '<sql>'
            : {
                name: columnName(column),
                order: (column as {indexConfig?: {order?: string}}).indexConfig?.order,
              }
        ),
      };
    }),
    foreignKeys: config.foreignKeys.map((fk) => {
      const reference = fk.reference();
      return {
        name: fk.getName(),
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
        columns: reference.columns.map(columnName),
        foreignColumns: reference.foreignColumns.map(columnName),
        foreignTable: getTableConfig(reference.foreignTable as never).name,
      };
    }),
    checks: config.checks.map((entry) => ({name: entry.name, value: normalizeValue(entry.value)})),
    primaryKeys: config.primaryKeys.map((pk) => ({name: pk.getName(), columns: pk.columns.map(columnName)})),
    uniqueConstraints: config.uniqueConstraints.map((constraint) => ({
      name: constraint.name,
      nullsNotDistinct: constraint.nullsNotDistinct,
      columns: constraint.columns.map(columnName),
    })),
    policies: config.policies.map((policy) => ({
      name: policy.name,
      as: policy.as,
      for: policy.for,
      to: Array.isArray(policy.to)
        ? policy.to.map((to) => (typeof to === 'string' ? to : (to as {name: string}).name))
        : policy.to,
      using: normalizeValue(policy.using),
      withCheck: normalizeValue(policy.withCheck),
    })),
  };
}

// ── the matrix: one wide table + references + composite pk + enum ────────────

const roleEnum = pgEnum('user_role', ['admin', 'user']);
const dzRoleEnum = dzPgEnum('user_role', ['admin', 'user']);

const auditor = pgRole('auditor', {createDb: false});
const dzAuditor = dzPgRole('auditor', {createDb: false});

const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  code: varchar('code', {length: 10}).notNull().unique(),
});
const dzTeams = dzPgTable('teams', {
  id: dzSerial('id').primaryKey(),
  code: dzVarchar('code', {length: 10}).notNull().unique(),
});

const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', {length: 100}).notNull(),
    nickname: varchar('nickname', {length: 30}).$defaultFn(() => 'anon'),
    role: roleEnum('role').notNull(),
    plan: text('plan', {enum: ['free', 'pro']})
      .notNull()
      .default('free'),
    age: integer('age').notNull(),
    seq: integer('seq').generatedByDefaultAsIdentity(),
    score: doublePrecision('score').default(0.5),
    balance: numeric('balance', {precision: 10, scale: 2, mode: 'number'}),
    bigCount: bigint('big_count', {mode: 'bigint'}),
    small: smallint('small'),
    codes: varchar('codes', {length: 5}).array().notNull(),
    active: boolean('active').notNull().default(true),
    meta: jsonb('meta').$type<{tags: string[]}>(),
    ip: inet('ip'),
    mask: bit('mask', {dimensions: 8}),
    teamId: integer('team_id').references(() => teams.id, {onDelete: 'cascade'}),
    fullName: text('full_name').generatedAlwaysAs(sql`name || ' '`),
    bornOn: date('born_on', {mode: 'string'}),
    wakeAt: time('wake_at'),
    createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
    updatedAt: timestamp('updated_at').default(sql.raw('now()')),
  },
  (t) => [
    index('users_name_idx')
      .on(t.name.desc(), t.age)
      .where(sql`${t.age} > ${18}`),
    uniqueIndex('users_nickname_uidx').on(t.nickname),
    unique('users_name_team_uq').on(t.name, t.teamId).nullsNotDistinct(),
    foreignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [teams.id]}).onUpdate('restrict'),
    check('users_age_check', sql`${t.age} >= 0`),
    pgPolicy('users_read_policy', {as: 'permissive', for: 'select', to: [auditor], using: sql`true`}),
  ]
);
const dzUsers = dzPgTable(
  'users',
  {
    id: dzUuid('id').defaultRandom().primaryKey(),
    name: dzVarchar('name', {length: 100}).notNull(),
    nickname: dzVarchar('nickname', {length: 30}).$defaultFn(() => 'anon'),
    role: dzRoleEnum('role').notNull(),
    plan: dzText('plan', {enum: ['free', 'pro']})
      .notNull()
      .default('free'),
    age: dzInteger('age').notNull(),
    seq: dzInteger('seq').generatedByDefaultAsIdentity(),
    score: dzDoublePrecision('score').default(0.5),
    balance: dzNumeric('balance', {precision: 10, scale: 2, mode: 'number'}),
    bigCount: dzBigint('big_count', {mode: 'bigint'}),
    small: dzSmallint('small'),
    codes: dzVarchar('codes', {length: 5}).array().notNull(),
    active: dzBoolean('active').notNull().default(true),
    meta: dzJsonb('meta').$type<{tags: string[]}>(),
    ip: dzInet('ip'),
    mask: dzBit('mask', {dimensions: 8}),
    teamId: dzInteger('team_id').references(() => dzTeams.id, {onDelete: 'cascade'}),
    fullName: dzText('full_name').generatedAlwaysAs(dzRealSql`name || ' '`),
    bornOn: dzDate('born_on', {mode: 'string'}),
    wakeAt: dzTime('wake_at'),
    createdAt: dzTimestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
    updatedAt: dzTimestamp('updated_at').default(dzRealSql.raw('now()')),
  },
  (t) => [
    dzIndex('users_name_idx')
      .on(t.name.desc(), t.age)
      .where(dzRealSql`${t.age} > ${18}`),
    dzUniqueIndex('users_nickname_uidx').on(t.nickname),
    dzUnique('users_name_team_uq').on(t.name, t.teamId).nullsNotDistinct(),
    dzForeignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [dzTeams.id]}).onUpdate('restrict'),
    dzCheck('users_age_check', dzRealSql`${t.age} >= 0`),
    dzPgPolicy('users_read_policy', {as: 'permissive', for: 'select', to: [dzAuditor], using: dzRealSql`true`}),
  ]
);

const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id').notNull(),
    teamId: integer('team_id').notNull(),
  },
  (t) => [primaryKey({name: 'memberships_pk', columns: [t.userId, t.teamId]})]
);
const dzMemberships = dzPgTable(
  'memberships',
  {
    userId: dzUuid('user_id').notNull(),
    teamId: dzInteger('team_id').notNull(),
  },
  (t) => [dzPrimaryKey({name: 'memberships_pk', columns: [t.userId, t.teamId]})]
);

describe('pg slim surface — toDrizzle equals hand-written drizzle', () => {
  it('the wide users table materializes byte-equal (columns, enum, arrays, refs, extraConfig)', () => {
    expect(project(toDrizzle(users))).toEqual(project(dzUsers));
  });

  it('the referenced table and the composite-pk table materialize byte-equal', () => {
    expect(project(toDrizzle(teams))).toEqual(project(dzTeams));
    expect(project(toDrizzle(memberships))).toEqual(project(dzMemberships));
  });

  it('the enum handle materializes to a real drizzle enum', () => {
    const materialized = toDrizzle(roleEnum);
    expect(materialized.enumName).toBe('user_role');
    expect(materialized.enumValues).toEqual(['admin', 'user']);
  });

  it('memoizes: every call returns the same drizzle table object', () => {
    expect(toDrizzle(users)).toBe(toDrizzle(users));
  });

  it('refineTableType is identity at runtime and shares the materialized table', () => {
    const refined = refineTableType(users, {name: {minLength: 2}});
    expect(refined as unknown).toBe(users);
    expect(toDrizzle(refined)).toBe(toDrizzle(users));
  });
});

// ── derived models drive full-fidelity validators ────────────────────────────

const people = pgTable('people', {
  id: uuid('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  bio: text('bio'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
const apiPeople = refineTableType(people, {name: {minLength: 3}, age: {min: 18}});
type Person = InferSelectModel<typeof apiPeople>;
type NewPerson = InferInsertModel<typeof apiPeople>;
type PersonPatch = InferUpdateModel<typeof apiPeople>;

const validPerson = {
  id: '793aff46-42ac-4372-b7fa-c48ba48ed94f',
  name: 'ann-lee',
  age: 30,
  role: 'admin',
  bio: null,
  createdAt: new Date(),
};

describe('pg slim surface — models compile full-fidelity validators', () => {
  const validatePerson = createValidateFn<Person>();
  const validateInsert = createValidateFn<NewPerson>();
  const validatePatch = createValidateFn<PersonPatch>();

  it('the refined table is the same object; only typeof carries the refinement', () => {
    expect(apiPeople).toBe(people);
  });

  it('accepts a valid row (nullable column as null)', () => {
    expect(validatePerson(validPerson)).toBe(true);
  });

  it('enforces captured and refined params (uuid, maxLength, minLength, min, enum, Int32)', () => {
    expect(validatePerson({...validPerson, id: 'not-a-uuid'})).toBe(false);
    expect(validatePerson({...validPerson, name: 'x'.repeat(101)})).toBe(false);
    expect(validatePerson({...validPerson, name: 'ab'})).toBe(false); // refined minLength 3
    expect(validatePerson({...validPerson, age: 17})).toBe(false); // refined min 18
    expect(validatePerson({...validPerson, age: 3000000000})).toBe(false); // Int32 max
    expect(validatePerson({...validPerson, age: 20.5})).toBe(false); // integer
    expect(validatePerson({...validPerson, role: 'root'})).toBe(false);
  });

  it('insert drops nothing required, defaults optional; patch is a real partial', () => {
    expect(validateInsert({id: validPerson.id, name: 'ann-lee', age: 21, role: 'user'})).toBe(true);
    expect(validateInsert({name: 'ann-lee', age: 21, role: 'user'})).toBe(false); // id has no default
    expect(validatePatch({})).toBe(true);
    expect(validatePatch({age: 17})).toBe(false); // present keys still validate
  });

  // Marker test coverage rule: both getRunTypeId call shapes, paired, with a
  // hash-equivalence assertion between them.
  it('getRunTypeId static form resolves the model', () => {
    expect(getRunTypeId<Person>()).toBeTruthy();
  });
  it('getRunTypeId reflection form resolves the model', () => {
    const person: Person = validPerson as Person;
    expect(getRunTypeId(person)).toBeTruthy();
  });
  it('both getRunTypeId forms resolve to the same id', () => {
    const person: Person = validPerson as Person;
    expect(getRunTypeId(person)).toBe(getRunTypeId<Person>());
  });
});
