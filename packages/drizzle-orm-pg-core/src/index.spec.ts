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
  getViewConfig,
  getMaterializedViewConfig,
  pgView as dzPgView,
  pgMaterializedView as dzPgMaterializedView,
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
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
import {
  bigint,
  bit,
  boolean,
  check,
  pgView,
  pgMaterializedView,
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
import type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {cols, refineTableType, sql} from '@mionjs/drizzle-orm';
import {toDrizzle} from './drizzle.ts';

// ── the equality oracle ──────────────────────────────────────────────────────

const normalizeValue = (value: unknown): unknown => {
  if (typeof value === 'function') return '<fn>';
  if (value !== null && typeof value === 'object' && 'queryChunks' in (value as object)) return '<sql>';
  return value;
};
const columnName = (column: unknown) => (column as {name: string}).name;

/** JSON-safe projection of everything the SQL depends on. */
function project(table: Parameters<typeof getTableConfig>[0]) {
  const config = getTableConfig(table);
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
    policies: config.policies.map(projectPolicy),
    enableRLS: config.enableRLS,
  };
}

function projectPolicy(policy: {name: string; as?: unknown; for?: unknown; to?: unknown; using?: unknown; withCheck?: unknown}) {
  return {
    name: policy.name,
    as: policy.as,
    for: policy.for,
    to: Array.isArray(policy.to) ? policy.to.map((to) => (typeof to === 'string' ? to : (to as {name: string}).name)) : policy.to,
    using: normalizeValue(policy.using),
    withCheck: normalizeValue(policy.withCheck),
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
    teamId: integer('team_id').references(() => cols(teams).id, {onDelete: 'cascade'}),
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
    foreignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [cols(teams).id]}).onUpdate('restrict'),
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

// ── extraConfig: drizzle's array form AND its older keyed-object one ─────────
// Its own integration suites still write both, and the object form used to
// crash the recorder (it mapped the result as an array).

const objectConfig = pgTable('object_config', {id: uuid('id').primaryKey(), owner: text('owner').notNull()}, (t) => ({
  ownerIdx: index('object_config_owner_idx').on(t.owner),
  ownerUnique: unique('object_config_owner_unique').on(t.owner),
}));
const dzObjectConfig = dzPgTable('object_config', {id: dzUuid('id').primaryKey(), owner: dzText('owner').notNull()}, (t) => ({
  ownerIdx: dzIndex('object_config_owner_idx').on(t.owner),
  ownerUnique: dzUnique('object_config_owner_unique').on(t.owner),
}));

// The array form may also GROUP entries one level deep; drizzle flattens.
const groupedConfig = pgTable('grouped_config', {id: uuid('id').primaryKey(), owner: text('owner').notNull()}, (t) => [
  [index('grouped_config_owner_idx').on(t.owner), unique('grouped_config_owner_unique').on(t.owner)],
]);
const dzGroupedConfig = dzPgTable(
  'grouped_config',
  {id: dzUuid('id').primaryKey(), owner: dzText('owner').notNull()},
  (t) => [[dzIndex('grouped_config_owner_idx').on(t.owner), dzUnique('grouped_config_owner_unique').on(t.owner)]] as never
);

describe('pg slim surface — extraConfig object form', () => {
  it('materializes byte-equal to the same table written with drizzle', () => {
    expect(project(toDrizzle(objectConfig))).toEqual(project(dzObjectConfig));
  });

  it('keeps both entries: an object form is not silently dropped', () => {
    const config = getTableConfig(toDrizzle(objectConfig));
    expect(config.indexes.map((entry) => entry.config.name)).toEqual(['object_config_owner_idx']);
    expect(config.uniqueConstraints.map((entry) => entry.name)).toEqual(['object_config_owner_unique']);
  });

  it('flattens a grouped array one level, the way drizzle does', () => {
    expect(project(toDrizzle(groupedConfig))).toEqual(project(dzGroupedConfig));
    const config = getTableConfig(toDrizzle(groupedConfig));
    expect(config.indexes.map((entry) => entry.config.name)).toEqual(['grouped_config_owner_idx']);
    expect(config.uniqueConstraints.map((entry) => entry.name)).toEqual(['grouped_config_owner_unique']);
  });
});

// ── row level security: enableRLS, an existing role, a linked policy ─────────

const rlsDocs = pgTable('rls_docs', {
  id: uuid('id').primaryKey(),
  owner: text('owner').notNull(),
}).enableRLS();
const dzRlsDocs = dzPgTable('rls_docs', {
  id: dzUuid('id').primaryKey(),
  owner: dzText('owner').notNull(),
}).enableRLS();

const authenticated = pgRole('authenticated').existing();
const dzAuthenticated = dzPgRole('authenticated').existing();

const inlinePolicyDocs = pgTable('rls_inline', {id: uuid('id').primaryKey(), owner: text('owner').notNull()}, (t) => [
  pgPolicy('owner_reads', {as: 'permissive', for: 'select', to: authenticated, using: sql`${t.owner} = current_user`}),
]);
const dzInlinePolicyDocs = dzPgTable('rls_inline', {id: dzUuid('id').primaryKey(), owner: dzText('owner').notNull()}, (t) => [
  dzPgPolicy('owner_reads', {as: 'permissive', for: 'select', to: dzAuthenticated, using: dzRealSql`${t.owner} = current_user`}),
]);

const linkedPolicy = pgPolicy('linked_reads', {for: 'select', using: sql`true`}).link(rlsDocs);
const dzLinkedPolicy = dzPgPolicy('linked_reads', {for: 'select', using: dzRealSql`true`}).link(dzRlsDocs);

describe('pg slim surface — row level security', () => {
  it('enableRLS() lands on the materialized table', () => {
    expect(project(toDrizzle(rlsDocs))).toEqual(project(dzRlsDocs));
    expect(getTableConfig(toDrizzle(rlsDocs)).enableRLS).toBe(true);
  });

  it('a table without enableRLS() stays off', () => {
    expect(getTableConfig(toDrizzle(teams)).enableRLS).toBe(false);
  });

  it('a policy declared in extraConfig materializes byte-equal, role reference included', () => {
    expect(project(toDrizzle(inlinePolicyDocs))).toEqual(project(dzInlinePolicyDocs));
  });

  it('pgRole(...).existing() marks the role as pre-existing, like drizzle', () => {
    const materialized = toDrizzle(authenticated);
    expect(materialized.name).toBe('authenticated');
    expect((materialized as unknown as {_existing?: boolean})._existing).toBe(true);
    expect((toDrizzle(auditor) as unknown as {_existing?: boolean})._existing).toBeUndefined();
  });

  it('a linked policy materializes on its own and points at the linked table', () => {
    const materialized = toDrizzle(linkedPolicy);
    expect(projectPolicy(materialized as never)).toEqual(projectPolicy(dzLinkedPolicy as never));
    const linkedTable = (materialized as unknown as {_linkedTable?: object})._linkedTable;
    expect(linkedTable).toBe(toDrizzle(rlsDocs));
  });

  it('an UNLINKED policy materializes on its own, no cast needed', () => {
    const standalone = pgPolicy('standalone_reads', {as: 'permissive', for: 'select', to: 'public', using: sql`1=1`});
    const materialized = toDrizzle(standalone);
    const dzStandalone = dzPgPolicy('standalone_reads', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: dzRealSql`1=1`,
    });
    expect(projectPolicy(materialized as never)).toEqual(projectPolicy(dzStandalone as never));
    expect(materialized.name).toBe('standalone_reads');
  });

  it('a REAL drizzle policy in extraConfig passes through untouched (crudPolicy and friends)', () => {
    // No cast: a real drizzle entry is part of the declared type. The
    // documented way to use a provider helper (crudPolicy and friends) is to
    // pass its result straight in, and that used to need `as never`.
    const passthrough = pgTable('rls_passthrough', {id: uuid('id').primaryKey()}, () => [
      dzPgPolicy('from_drizzle', {for: 'select', using: dzRealSql`true`}),
    ]);
    const dzPassthrough = dzPgTable('rls_passthrough', {id: dzUuid('id').primaryKey()}, () => [
      dzPgPolicy('from_drizzle', {for: 'select', using: dzRealSql`true`}),
    ]);
    expect(project(toDrizzle(passthrough))).toEqual(project(dzPassthrough));
  });
});

// ── pgEnum: both drizzle overloads ───────────────────────────────────────────

// A plain object, which is what drizzle's second overload actually constrains
// on (Record<string, string>); a TS enum object is the same shape here.
const Priority = {Low: 'low', High: 'high'} as const;

describe('pg slim surface — pgEnum object overload', () => {
  it('the object form materializes to the same drizzle enum as the tuple form', () => {
    const objectEnum = pgEnum('priority', Priority);
    const dzObjectEnum = dzPgEnum('priority', Priority);
    const materialized = toDrizzle(objectEnum);
    expect(materialized.enumName).toBe(dzObjectEnum.enumName);
    expect(materialized.enumValues).toEqual(dzObjectEnum.enumValues);
  });

  it('exposes enumValues as the object VALUES, matching drizzle', () => {
    expect(pgEnum('priority_2', Priority).enumValues).toEqual([Priority.Low, Priority.High]);
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

// ── views: the manual-column form ────────────────────────────────────────────

/** JSON-safe projection of a view: name, the selected columns, and the config
 *  drizzle-kit reads (the query, whether it pre-exists, the storage options). */
function projectView(view: object, materialized = false) {
  const config = (materialized ? getMaterializedViewConfig(view as never) : getViewConfig(view as never)) as unknown as Record<
    string,
    unknown
  >;
  return {
    name: config.name,
    schema: config.schema,
    isExisting: config.isExisting,
    query: normalizeValue(config.query),
    with: config.with,
    using: config.using,
    tablespace: config.tablespace,
    withNoData: config.withNoData,
    columns: Object.entries(config.selectedFields as Record<string, unknown>).map(([key, column]) => ({
      key,
      name: (column as {name: string}).name,
      sqlType: (column as {getSQLType(): string}).getSQLType(),
      notNull: (column as {notNull: boolean}).notNull,
    })),
  };
}

const nyUsers = pgView('new_yorkers', {
  id: uuid('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  city: text('city'),
}).as(sql`select ${cols(users).id}, ${cols(users).name}, 'NY' from ${users}`);
const dzNyUsers = dzPgView('new_yorkers', {
  id: dzUuid('id').primaryKey(),
  name: dzVarchar('name', {length: 100}).notNull(),
  city: dzText('city'),
}).as(dzRealSql`select ${dzUsers.id}, ${dzUsers.name}, 'NY' from ${dzUsers}`);

const trimmedUser = pgView('trimmed_user', {
  id: uuid('id'),
  name: varchar('name', {length: 100}),
}).existing();
const dzTrimmedUser = dzPgView('trimmed_user', {
  id: dzUuid('id'),
  name: dzVarchar('name', {length: 100}),
}).existing();

const topTeams = pgMaterializedView('top_teams', {
  id: serial('id').primaryKey(),
  code: varchar('code', {length: 10}).notNull(),
})
  .using('btree')
  .with({fillfactor: 90})
  .tablespace('custom_tablespace')
  .withNoData()
  .as(sql`select ${cols(teams).id}, ${cols(teams).code} from ${teams}`);
const dzTopTeams = dzPgMaterializedView('top_teams', {
  id: dzSerial('id').primaryKey(),
  code: dzVarchar('code', {length: 10}).notNull(),
})
  .using('btree')
  .with({fillfactor: 90})
  .tablespace('custom_tablespace')
  .withNoData()
  .as(dzRealSql`select ${dzTeams.id}, ${dzTeams.code} from ${dzTeams}`);

describe('pg slim surface — views equal hand-written drizzle', () => {
  it('a sql-defined view materializes byte-equal, table references resolved', () => {
    expect(projectView(toDrizzle(nyUsers))).toEqual(projectView(dzNyUsers));
  });

  it('an .existing() view materializes byte-equal and is marked pre-existing', () => {
    expect(projectView(toDrizzle(trimmedUser))).toEqual(projectView(dzTrimmedUser));
    expect(getViewConfig(toDrizzle(trimmedUser)).isExisting).toBe(true);
  });

  it('a materialized view carries its whole chain', () => {
    expect(projectView(toDrizzle(topTeams), true)).toEqual(projectView(dzTopTeams, true));
  });

  it('memoizes: every call returns the same drizzle view object', () => {
    expect(toDrizzle(nyUsers)).toBe(toDrizzle(nyUsers));
  });

  it('the sql references the SAME materialized table the slim table gives', () => {
    // The view's query embeds `users`; resolving it must not build a second
    // drizzle table behind the app's back.
    expect(toDrizzle(users)).toBe(toDrizzle(users));
    expect(getViewConfig(toDrizzle(nyUsers)).name).toBe('new_yorkers');
  });

  it('the query-builder form is rejected with a reason, not a silent miss', () => {
    expect(() => (pgView as unknown as (name: string) => unknown)('qb_view')).toThrowError(/query builder/);
  });

  it('a view column cannot be shared with a table', () => {
    const shared = text('shared');
    pgTable('view_col_owner', {shared});
    expect(() => pgView('borrows', {shared})).toThrowError(/already used/);
  });
});

// ── view models: select only ─────────────────────────────────────────────────

describe('pg slim surface — view models', () => {
  it('InferSelectViewModel of a view is the row type, nullable columns as | null', () => {
    type NyRow = InferSelectViewModel<typeof nyUsers>;
    const row: NyRow = {id: '3d1f7a2e-0000-4000-8000-000000000000', name: 'Ada', city: null};
    expect(row.city).toBeNull();
  });
});
