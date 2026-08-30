/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Shared core of the pg table fuzz suites: the random table SPEC, the
// value-surface interpreter (slim recorders / raw drizzle), the getTableConfig
// projection oracle, and the type-road renderers that turn a spec into the
// pure-types spelling (PgTable<'t', {...}>) plus a synthetic reflected graph.
// Consumed by tableEquality.fuzz.spec.ts (three in-process surfaces) and
// drizzleTypeSource.integration.spec.ts (real resolver over generated source);
// not part of the shipped build (tsconfig.build.json excludes test/).

import {getMaterializedViewConfig, getTableConfig, getViewConfig} from 'drizzle-orm/pg-core';
import type {ReflectedNode} from '@mionjs/drizzle-orm';
import {reflectedKinds} from '../../drizzle-orm/src/fromType.ts';

// ── the random table spec ────────────────────────────────────────────────────

export interface ModCall {
  method: string;
  args: unknown[];
}
export interface ColumnSpec {
  key: string;
  fn: string;
  args: unknown[];
  mods: ModCall[];
  /** () => parent.id reference, realized per surface. */
  referencesParent?: boolean;
}
export interface ExtraSpec {
  fn: 'index' | 'uniqueIndex' | 'unique' | 'check' | 'foreignKey';
  name: string;
  onKeys?: string[];
  whereKey?: string;
  checkKey?: string;
  fkKey?: boolean;
}
export interface TableSpec {
  columns: ColumnSpec[];
  extras: ExtraSpec[];
}

export function makeSpec(rng: () => number): TableSpec {
  const pick = <T>(items: T[]): T => items[Math.floor(rng() * items.length)];
  const chance = (p: number) => rng() < p;
  const int = (max: number) => 1 + Math.floor(rng() * max);

  const kinds: Array<() => Pick<ColumnSpec, 'fn' | 'args' | 'mods'>> = [
    () => ({fn: 'varchar', args: [{length: int(200)}], mods: []}),
    () => ({fn: 'text', args: chance(0.4) ? [{enum: ['a', 'b', 'c']}] : [], mods: []}),
    () => ({fn: 'integer', args: [], mods: []}),
    () => ({fn: 'smallint', args: [], mods: []}),
    () => ({fn: 'boolean', args: [], mods: chance(0.5) ? [{method: 'default', args: [chance(0.5)]}] : []}),
    () => ({fn: 'uuid', args: [], mods: chance(0.5) ? [{method: 'defaultRandom', args: []}] : []}),
    () => ({
      fn: 'timestamp',
      args: [{mode: pick(['date', 'string'])}],
      mods: chance(0.5) ? [{method: 'defaultNow', args: []}] : [],
    }),
    () => ({fn: 'numeric', args: [{precision: int(12), scale: int(4), mode: pick(['number', 'string'])}], mods: []}),
    () => ({fn: 'doublePrecision', args: [], mods: []}),
    () => ({fn: 'jsonb', args: [], mods: []}),
    () => ({fn: 'inet', args: [], mods: []}),
    () => ({fn: 'bigint', args: [{mode: pick(['number', 'bigint'])}], mods: []}),
  ];

  const columns: ColumnSpec[] = [];
  const columnCount = 1 + int(7);
  let hasPrimary = false;
  for (let i = 0; i < columnCount; i++) {
    const base = pick(kinds)();
    const column: ColumnSpec = {key: `col_${i}`, fn: base.fn, args: [`c${i}`, ...base.args], mods: [...base.mods]};
    if (chance(0.5)) column.mods.push({method: 'notNull', args: []});
    if (!hasPrimary && chance(0.15)) {
      column.mods.push({method: 'primaryKey', args: []});
      hasPrimary = true;
    }
    if (chance(0.2)) column.mods.push({method: 'unique', args: [`uq_c${i}`]});
    if (base.fn === 'varchar' && chance(0.3)) column.mods.push({method: 'default', args: ['dflt']});
    if ((base.fn === 'integer' || base.fn === 'smallint') && chance(0.3)) column.mods.push({method: 'default', args: [int(100)]});
    if (base.fn === 'integer' && chance(0.3)) column.referencesParent = true;
    columns.push(column);
  }

  const extras: ExtraSpec[] = [];
  const columnKeys = columns.map((column) => column.key);
  const numericKey = columns.find((column) => column.fn === 'integer' || column.fn === 'smallint')?.key;
  if (chance(0.6)) {
    extras.push({
      fn: pick(['index', 'uniqueIndex']),
      name: `idx_${extras.length}`,
      onKeys: [pick(columnKeys)],
      whereKey: numericKey !== undefined && chance(0.4) ? numericKey : undefined,
    });
  }
  if (chance(0.35)) extras.push({fn: 'unique', name: `uqc_${extras.length}`, onKeys: [pick(columnKeys)]});
  if (numericKey !== undefined && chance(0.4)) extras.push({fn: 'check', name: `chk_${extras.length}`, checkKey: numericKey});
  if (columns.some((column) => column.referencesParent) && chance(0.5)) {
    extras.push({fn: 'foreignKey', name: `fk_${extras.length}`, fkKey: true});
  }
  return {columns, extras};
}

// ── interpret one spec over one value surface ────────────────────────────────

export interface Surface {
  ns: Record<string, (...args: never[]) => unknown>;
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
  table: (name: string, columns: Record<string, unknown>, extra?: (t: Record<string, unknown>) => unknown[]) => unknown;
  parent: Record<string, unknown>;
}

export function buildTable(surface: Surface, spec: TableSpec, tableName: string): unknown {
  const columns: Record<string, unknown> = {};
  for (const columnSpec of spec.columns) {
    let column = surface.ns[columnSpec.fn](...(columnSpec.args as never[])) as Record<string, (...a: unknown[]) => unknown>;
    for (const mod of columnSpec.mods) column = mod.method === 'skip' ? column : (column[mod.method](...mod.args) as never);
    if (columnSpec.referencesParent) {
      column = column.references(() => surface.parent.id, {onDelete: 'cascade'}) as never;
    }
    columns[columnSpec.key] = column;
  }
  const extraConfig =
    spec.extras.length === 0
      ? undefined
      : (t: Record<string, unknown>) =>
          spec.extras.map((extra) => {
            if (extra.fn === 'check')
              return surface.ns.check(extra.name as never, surface.sql`${t[extra.checkKey!]} >= 0` as never);
            if (extra.fn === 'foreignKey') {
              const fkColumn = spec.columns.find((column) => column.referencesParent)!;
              return surface.ns.foreignKey({
                name: extra.name,
                columns: [t[fkColumn.key]],
                foreignColumns: [surface.parent.id],
              } as never);
            }
            let entry = surface.ns[extra.fn](extra.name as never) as Record<string, (...a: unknown[]) => unknown>;
            entry = entry.on(...extra.onKeys!.map((key) => t[key])) as never;
            if (extra.whereKey !== undefined && extra.fn !== 'unique') {
              entry = entry.where(surface.sql`${t[extra.whereKey]} > ${5}`) as never;
            }
            return entry;
          });
  return surface.table(tableName, columns, extraConfig as never);
}

// ── the oracle: getTableConfig projections must match ────────────────────────

export function project(table: unknown) {
  const config = getTableConfig(table as never);
  const normalizeValue = (value: unknown): unknown => {
    if (typeof value === 'function') return '<fn>';
    if (value !== null && typeof value === 'object' && 'queryChunks' in (value as object)) return '<sql>';
    return value;
  };
  const columnName = (column: unknown) => (column as {name: string}).name;
  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      columnType: column.columnType,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: normalizeValue(column.default),
      primary: column.primary,
      isUnique: (column as unknown as {isUnique: boolean}).isUnique,
      enumValues: column.enumValues,
    })),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: Record<string, unknown>}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        where: normalizeValue(indexConfig.where),
        columns: (indexConfig.columns as unknown[]).map(columnName),
      };
    }),
    foreignKeys: config.foreignKeys.map((fk) => {
      const reference = fk.reference();
      return {
        name: fk.getName(),
        onDelete: fk.onDelete,
        columns: reference.columns.map(columnName),
        foreignColumns: reference.foreignColumns.map(columnName),
      };
    }),
    checks: config.checks.map((entry) => ({name: entry.name, value: normalizeValue(entry.value)})),
    uniqueConstraints: config.uniqueConstraints.map((constraint) => ({
      name: constraint.name,
      columns: constraint.columns.map(columnName),
    })),
  };
}

// ── the type road over a spec ────────────────────────────────────────────────
// The vocabulary the pure-types road covers so far (widened per phase with the
// column types and modifier markers). A spec outside it has no type spelling
// yet; the fuzz suites gate surface 3 on typeRoadCovers().

const TYPE_ROAD_FNS: Record<string, string> = {
  varchar: 'Varchar',
  text: 'Text',
  integer: 'Integer',
  smallint: 'Smallint',
  boolean: 'Boolean',
  uuid: 'Uuid',
  timestamp: 'Timestamp',
  numeric: 'Numeric',
  doublePrecision: 'DoublePrecision',
  jsonb: 'Jsonb',
  inet: 'Inet',
  bigint: 'Bigint',
};
/** The modifier methods the type road can spell as props today. */
const TYPE_ROAD_MODS = new Set(['notNull', 'primaryKey', 'default', 'defaultRandom', 'defaultNow', 'unique']);

export function typeRoadCovers(spec: TableSpec): boolean {
  if (spec.extras.length > 0) return false;
  return spec.columns.every(
    (column) =>
      TYPE_ROAD_FNS[column.fn] !== undefined &&
      column.referencesParent !== true &&
      column.mods.every((mod) => TYPE_ROAD_MODS.has(mod.method))
  );
}

/** The parent table every fuzz surface shares for references. */
export const FUZZ_PARENT_NAME = 'fuzz_parents';
const FUZZ_REFERENCE_ACTIONS = {onDelete: 'cascade'} as const;

/** Reduce a spec to what the type road covers today (columns with a type
 *  spelling, their covered mods and references, extras minus interpolated
 *  sql), so surface 3 runs on nearly every iteration instead of only on
 *  fully-covered tables. Returns undefined when nothing survives. */
export function typeRoadReduce(spec: TableSpec): TableSpec | undefined {
  const columns = spec.columns
    .filter((column) => TYPE_ROAD_FNS[column.fn] !== undefined)
    .map((column) => ({
      ...column,
      mods: column.mods.filter((mod) => TYPE_ROAD_MODS.has(mod.method)),
    }));
  if (columns.length === 0) return undefined;
  const keys = new Set(columns.map((column) => column.key));
  const hasReference = columns.some((column) => column.referencesParent);
  const extras = spec.extras.filter((extra) => {
    if (extra.fn === 'check') return false;
    if (extra.whereKey !== undefined) return false;
    if (extra.fn === 'foreignKey') return hasReference;
    return (extra.onKeys ?? []).every((key) => keys.has(key));
  });
  return {columns, extras};
}

/** Literal type text of a config/arg value (string/number/boolean/objects). */
function literalTypeText(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value).replace(/"/g, "'");
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(literalTypeText).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const members = Object.entries(value).map(([key, item]) => `${key}: ${literalTypeText(item)}`);
    return `{${members.join('; ')}}`;
  }
  throw new Error(`no literal type text for ${String(value)}`);
}

/** Render one covered column as its pure-type spelling
 *  (DB.Varchar<'c0', {length: 5; notNull: true}>): the db name, then the ONE
 *  props object holding the builder's config keys and its modifier calls. A
 *  no-arg call spells `true`, a call with arguments spells the args tuple. */
export function renderColumnType(column: ColumnSpec, namespace: string): string {
  const typeName = TYPE_ROAD_FNS[column.fn];
  const [name, config] = column.args as [string | undefined, Record<string, unknown> | undefined];
  const props: string[] = [];
  if (config !== undefined) {
    for (const [key, value] of Object.entries(config)) props.push(`${key}: ${literalTypeText(value)}`);
  }
  for (const mod of column.mods) {
    const value = mod.args.length > 0 ? `[${mod.args.map(literalTypeText).join(', ')}]` : 'true';
    props.push(`${mod.method}: ${value}`);
  }
  if (column.referencesParent) {
    const target = `{table: '${FUZZ_PARENT_NAME}'; column: 'id'}`;
    props.push(`references: [${target}, ${literalTypeText(FUZZ_REFERENCE_ACTIONS)}]`);
  }
  const typeArgs: string[] = [];
  if (name !== undefined) typeArgs.push(literalTypeText(name));
  if (props.length > 0) typeArgs.push(`{${props.join('; ')}}`);
  return `${namespace}.${typeName}${typeArgs.length > 0 ? `<${typeArgs.join(', ')}>` : ''}`;
}

/** Render one covered extra as the canonical TableEntry spelling. */
export function renderEntryType(extra: ExtraSpec, spec: TableSpec, namespace: string): string {
  if (extra.fn === 'foreignKey') {
    const fkColumn = spec.columns.find((column) => column.referencesParent)!;
    return (
      `${namespace}.TableEntry<'foreignKey', [{name: '${extra.name}'; ` +
      `columns: [{col: '${fkColumn.key}'}]; foreignColumns: [{table: '${FUZZ_PARENT_NAME}'; col: 'id'}]}]>`
    );
  }
  const on = (extra.onKeys ?? []).map((key) => `{col: '${key}'}`).join(', ');
  return `${namespace}.TableEntry<'${extra.fn}', ['${extra.name}'], {on: [${on}]}>`;
}

/** Literal VALUE text of a config/arg (the same values literalTypeText spells
 *  as a type, spelled as the JS the builders form is written in). */
function literalValueText(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value).replace(/"/g, "'");
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(literalValueText).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, item]) => `${key}: ${literalValueText(item)}`)
      .join(', ')}}`;
  }
  throw new Error(`no literal value text for ${String(value)}`);
}

/** Render one covered column as its BUILDER call chain
 *  (NS.varchar('c0', {length: 5}).notNull()). */
export function renderColumnBuilders(column: ColumnSpec, namespace: string, parentConst: string): string {
  let text = `${namespace}.${column.fn}(${column.args.map(literalValueText).join(', ')})`;
  for (const mod of column.mods) text += `.${mod.method}(${mod.args.map(literalValueText).join(', ')})`;
  if (column.referencesParent) {
    text += `.references(() => ${parentConst}.id, ${literalValueText(FUZZ_REFERENCE_ACTIONS)})`;
  }
  return text;
}

/** Render a covered spec as the BUILDERS form source, the twin of
 *  renderTableType. The two together are what lets a fuzz iteration prove the
 *  two roads land on ONE runtype id, rather than only on one drizzle table. */
export function renderTableBuilders(spec: TableSpec, tableName: string, namespace: string, parentConst: string): string {
  const columns = spec.columns.map((column) => `  ${column.key}: ${renderColumnBuilders(column, namespace, parentConst)},`);
  const base = `${namespace}.pgTable('${tableName}', {\n${columns.join('\n')}\n}`;
  if (spec.extras.length === 0) return `${base})`;
  const entries = spec.extras.map((extra) => {
    if (extra.fn === 'foreignKey') {
      const fkColumn = spec.columns.find((column) => column.referencesParent)!;
      return (
        `    ${namespace}.foreignKey({name: '${extra.name}', ` +
        `columns: [t.${fkColumn.key}], foreignColumns: [${parentConst}.id]}),`
      );
    }
    const on = (extra.onKeys ?? []).map((key) => `t.${key}`).join(', ');
    return `    ${namespace}.${extra.fn}('${extra.name}').on(${on}),`;
  });
  return `${base}, (t) => [\n${entries.join('\n')}\n  ])`;
}

/** Render a covered spec as `NS.PgTable<'name', {...}, [extras]>` type text. */
export function renderTableType(spec: TableSpec, tableName: string, namespace: string): string {
  const columns = spec.columns.map((column) => `  ${column.key}: ${renderColumnType(column, namespace)};`);
  const base = `${namespace}.PgTable<'${tableName}', {\n${columns.join('\n')}\n}`;
  if (spec.extras.length === 0) return `${base}>`;
  const entries = spec.extras.map((extra) => `  ${renderEntryType(extra, spec, namespace)},`);
  return `${base}, [\n${entries.join('\n')}\n]>`;
}

// ── synthetic reflected graph of a covered spec ──────────────────────────────
// Mirrors what the resolver reflects for the rendered type text (the shape
// fromType.spec.ts pins), so the wide fuzz space can exercise the bridge on
// every run without spawning the resolver.

let nextNodeId = 0;
const nodeId = () => `syn${nextNodeId++}`;
const literalNode = (value: unknown): ReflectedNode => ({id: nodeId(), kind: reflectedKinds.literal, literal: value});
const undefinedNode = (): ReflectedNode => ({id: nodeId(), kind: reflectedKinds.undefined});
const objectNode = (members: Record<string, ReflectedNode>): ReflectedNode => ({
  id: nodeId(),
  kind: reflectedKinds.objectLiteral,
  children: Object.entries(members).map(([name, child]) => ({id: nodeId(), kind: 32, name, child})),
});
const tupleNode = (items: ReflectedNode[]): ReflectedNode => ({
  id: nodeId(),
  kind: reflectedKinds.tuple,
  children: items.map((child) => ({id: nodeId(), kind: 27, child})),
});

function valueNode(value: unknown): ReflectedNode {
  if (value === undefined) return undefinedNode();
  if (Array.isArray(value)) return tupleNode(value.map(valueNode));
  if (value !== null && typeof value === 'object') {
    const members: Record<string, ReflectedNode> = {};
    for (const [key, item] of Object.entries(value)) members[key] = valueNode(item);
    return objectNode(members);
  }
  return literalNode(value);
}

/** Build the synthetic reflected graph of a covered spec's type spelling. */
export function syntheticTableGraph(spec: TableSpec, tableName: string): ReflectedNode {
  const columns: Record<string, ReflectedNode> = {};
  for (const column of spec.columns) {
    const [name, config] = column.args as [string | undefined, Record<string, unknown> | undefined];
    const mods: Record<string, ReflectedNode> = {};
    for (const mod of column.mods) {
      mods[mod.method] = mod.args.length > 0 ? tupleNode(mod.args.map(valueNode)) : literalNode(true);
    }
    if (column.referencesParent) {
      mods.references = tupleNode([valueNode({table: FUZZ_PARENT_NAME, column: 'id'}), valueNode(FUZZ_REFERENCE_ACTIONS)]);
    }
    columns[column.key] = objectNode({
      'þ@rtColSpecKey': objectNode({
        fn: literalNode(column.fn),
        name: name === undefined ? undefinedNode() : literalNode(name),
        config: valueNode(config ?? {}),
        data: objectNode({}),
      }),
      'þ@rtColModsKey': objectNode(mods),
    });
  }
  const entries = spec.extras.map((extra) => {
    if (extra.fn === 'foreignKey') {
      const fkColumn = spec.columns.find((column) => column.referencesParent)!;
      return objectNode({
        'þ@rtEntrySpecKey': objectNode({
          fn: literalNode('foreignKey'),
          args: valueNode([
            {name: extra.name, columns: [{col: fkColumn.key}], foreignColumns: [{table: FUZZ_PARENT_NAME, col: 'id'}]},
          ]),
          chain: objectNode({}),
        }),
      });
    }
    return objectNode({
      'þ@rtEntrySpecKey': objectNode({
        fn: literalNode(extra.fn),
        args: valueNode([extra.name]),
        chain: objectNode({on: valueNode((extra.onKeys ?? []).map((key) => ({col: key})))}),
      }),
    });
  });
  const meta: Record<string, ReflectedNode> = {name: literalNode(tableName), columns: objectNode(columns)};
  if (entries.length > 0) meta.extras = tupleNode(entries);
  return objectNode({'þ@rtTableKey': objectNode(meta)});
}

// ── views: the same spec machinery, read-only ────────────────────────────────

export interface ViewSpec {
  /** Fresh column builders: a column can never be shared with a table. */
  columns: ColumnSpec[];
  materialized: boolean;
  /** `.existing()` instead of `.as(sql`...`)`. */
  existing: boolean;
  with?: Record<string, unknown>;
  using?: string;
  tablespace?: string;
  withNoData?: boolean;
}

/** Reuse the table's generated column kinds, minus every modifier that only
 *  means something on a table (defaults, references, identity): a manual view
 *  column carries its type and notNull, nothing else. */
export function makeViewSpec(rng: () => number, tableSpec: TableSpec): ViewSpec {
  const chance = (p: number) => rng() < p;
  const columns = tableSpec.columns.slice(0, 1 + Math.floor(rng() * tableSpec.columns.length)).map((column, index) => ({
    key: `v${index}`,
    fn: column.fn,
    args: column.args,
    mods: chance(0.5) ? [{method: 'notNull', args: []}] : [],
  }));
  const materialized = chance(0.4);
  return {
    columns,
    materialized,
    existing: chance(0.3),
    with: chance(0.4) ? {fillfactor: 90} : undefined,
    using: materialized && chance(0.5) ? 'btree' : undefined,
    tablespace: materialized && chance(0.4) ? 'custom_tablespace' : undefined,
    withNoData: materialized && chance(0.4) ? true : undefined,
  };
}

export function buildView(surface: Surface, spec: ViewSpec, viewName: string): unknown {
  const columns: Record<string, unknown> = {};
  for (const columnSpec of spec.columns) {
    let column = surface.ns[columnSpec.fn](...(columnSpec.args as never[])) as Record<string, (...a: unknown[]) => unknown>;
    for (const mod of columnSpec.mods) column = column[mod.method](...mod.args) as never;
    columns[columnSpec.key] = column;
  }
  const factory = spec.materialized ? 'pgMaterializedView' : 'pgView';
  let builder = surface.ns[factory](viewName as never, columns as never) as Record<string, (...a: unknown[]) => unknown>;
  if (spec.using !== undefined) builder = builder.using(spec.using) as never;
  if (spec.with !== undefined) builder = builder.with(spec.with) as never;
  if (spec.tablespace !== undefined) builder = builder.tablespace(spec.tablespace) as never;
  if (spec.withNoData) builder = builder.withNoData() as never;

  // The query embeds the parent TABLE, so reference resolution is exercised
  // on every iteration that is not `.existing()`.
  return spec.existing ? builder.existing() : builder.as(surface.sql`select * from ${surface.parent}`);
}

/** The view oracle: what drizzle-kit reads plus the selected columns. */
export function projectView(view: unknown, materialized: boolean) {
  const config = (materialized ? getMaterializedViewConfig(view as never) : getViewConfig(view as never)) as unknown as Record<
    string,
    unknown
  >;
  return {
    name: config.name,
    schema: config.schema,
    isExisting: config.isExisting,
    query: config.query === undefined ? undefined : '<sql>',
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
