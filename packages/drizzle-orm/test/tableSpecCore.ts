/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Dialect-free core of the table fuzz suites: the random table spec, the value-surface interpreter,
// the type-road renderers and the synthetic reflected graphs. Each dialect's test/tableSpecShared.ts
// binds it with specTools(dialect) and adds its own getTableConfig projection and views.

import type {ReflectedNode} from '../src/fromType.ts';
import {reflectedKinds} from '../src/fromType.ts';

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

/** The random helpers a dialect's column kinds draw from, all over one rng. */
export interface SpecRng {
  pick: <T>(items: T[]) => T;
  chance: (p: number) => boolean;
  int: (max: number) => number;
}
export type ColumnKind = (gen: SpecRng) => Pick<ColumnSpec, 'fn' | 'args' | 'mods'>;

/** What the generator and the renderers need to know about one dialect. */
export interface SpecDialect {
  /** The table brand the reflected graph carries ('pg', 'mysql', 'sqlite'). */
  brand: string;
  /** The table builder and table type names (pgTable / PgTable). */
  tableFn: string;
  tableType: string;
  kinds: ColumnKind[];
  /** Builders that get a string default ('dflt') now and then. */
  stringDefaultFns: readonly string[];
  /** Builders that get a numeric default now and then, and feed the index where / check extras. */
  intFns: readonly string[];
  /** The builder whose columns may reference the parent table. */
  refFn: string;
  /** Whether the dialect's indexes take `.where()` (mysql's do not). */
  indexWhere: boolean;
  /** The type-road vocabulary: builder name to column type name. */
  typeNames: Record<string, string>;
  /** The modifier methods the type road spells as props. */
  typeMods: ReadonlySet<string>;
}

function makeSpec(dialect: SpecDialect, rng: () => number): TableSpec {
  const pick = <T>(items: T[]): T => items[Math.floor(rng() * items.length)];
  const chance = (p: number) => rng() < p;
  const int = (max: number) => 1 + Math.floor(rng() * max);
  const gen: SpecRng = {pick, chance, int};

  const columns: ColumnSpec[] = [];
  const columnCount = 1 + int(7);
  let hasPrimary = false;
  for (let i = 0; i < columnCount; i++) {
    const base = pick(dialect.kinds)(gen);
    const column: ColumnSpec = {key: `col_${i}`, fn: base.fn, args: [`c${i}`, ...base.args], mods: [...base.mods]};
    if (chance(0.5)) column.mods.push({method: 'notNull', args: []});
    if (!hasPrimary && chance(0.15)) {
      column.mods.push({method: 'primaryKey', args: []});
      hasPrimary = true;
    }
    if (chance(0.2)) column.mods.push({method: 'unique', args: [`uq_c${i}`]});
    if (dialect.stringDefaultFns.includes(base.fn) && chance(0.3)) column.mods.push({method: 'default', args: ['dflt']});
    if (dialect.intFns.includes(base.fn) && chance(0.3)) column.mods.push({method: 'default', args: [int(100)]});
    if (base.fn === dialect.refFn && chance(0.3)) column.referencesParent = true;
    columns.push(column);
  }

  const extras: ExtraSpec[] = [];
  const columnKeys = columns.map((column) => column.key);
  const numericKey = columns.find((column) => dialect.intFns.includes(column.fn))?.key;
  if (chance(0.6)) {
    extras.push({
      fn: pick(['index', 'uniqueIndex']),
      name: `idx_${extras.length}`,
      onKeys: [pick(columnKeys)],
      whereKey: dialect.indexWhere && numericKey !== undefined && chance(0.4) ? numericKey : undefined,
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
  /** Build each column in ONE call, settings and modifiers in one props object (the next/ builders). */
  singleCall?: boolean;
  /** How this surface references parent.id, when not the column itself (the next/ tableRef). */
  parentRef?: () => unknown;
}

const parentRefOf = (surface: Surface): unknown => (surface.parentRef ? surface.parentRef() : surface.parent.id);

export function buildTable(surface: Surface, spec: TableSpec, tableName: string): unknown {
  const columns: Record<string, unknown> = {};
  for (const columnSpec of spec.columns) {
    if (surface.singleCall) {
      columns[columnSpec.key] = singleCallColumn(surface, columnSpec);
      continue;
    }
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
                foreignColumns: [parentRefOf(surface)],
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

/** One column built in one call: the config keys, then each modifier as `true` or its argument tuple. */
function singleCallColumn(surface: Surface, columnSpec: ColumnSpec): unknown {
  const [name, config] = columnSpec.args as [string | undefined, Record<string, unknown> | undefined];
  const props: Record<string, unknown> = {...config};
  for (const mod of columnSpec.mods) if (mod.method !== 'skip') props[mod.method] = mod.args.length > 0 ? mod.args : true;
  if (columnSpec.referencesParent) props.references = [() => parentRefOf(surface), {onDelete: 'cascade'}];
  const args: unknown[] = name === undefined ? [props] : [name, props];
  return surface.ns[columnSpec.fn](...(args as never[]));
}

// ── the type road over a spec ────────────────────────────────────────────────
// A spec outside the dialect's typeNames / typeMods has no type spelling; typeRoadReduce trims it to what does.

/** The parent table every fuzz surface shares for references. */
export const FUZZ_PARENT_NAME = 'fuzz_parents';
const FUZZ_REFERENCE_ACTIONS = {onDelete: 'cascade'} as const;

function typeRoadCovers(dialect: SpecDialect, spec: TableSpec): boolean {
  if (spec.extras.length > 0) return false;
  return spec.columns.every(
    (column) =>
      dialect.typeNames[column.fn] !== undefined &&
      column.referencesParent !== true &&
      column.mods.every((mod) => dialect.typeMods.has(mod.method))
  );
}

/** The spec minus what the type road cannot spell (uncovered columns and mods, interpolated sql extras), or undefined. */
function typeRoadReduce(dialect: SpecDialect, spec: TableSpec): TableSpec | undefined {
  const columns = spec.columns
    .filter((column) => dialect.typeNames[column.fn] !== undefined)
    .map((column) => ({
      ...column,
      mods: column.mods.filter((mod) => dialect.typeMods.has(mod.method)),
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

/** A covered column as its shipped pure-type spelling: `DB.Varchar<'c0', {length: 5; notNull: true}>`. */
function renderColumnType(dialect: SpecDialect, column: ColumnSpec, namespace: string): string {
  const typeName = dialect.typeNames[column.fn];
  const [name] = column.args as [string | undefined];
  const props = columnPropsText(column);
  const typeArgs: string[] = [];
  if (name !== undefined) typeArgs.push(literalTypeText(name));
  if (props.length > 0) typeArgs.push(`{${props.join('; ')}}`);
  return `${namespace}.${typeName}${typeArgs.length > 0 ? `<${typeArgs.join(', ')}>` : ''}`;
}

/** The props object members of a covered column: its config keys, then its modifier calls. */
function columnPropsText(column: ColumnSpec): string[] {
  const [, config] = column.args as [string | undefined, Record<string, unknown> | undefined];
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
  return props;
}

/** A covered spec as next/ types: nameless columns, shipped TableEntry extras, names for differing db names. */
function renderNextTableType(
  dialect: SpecDialect,
  spec: TableSpec,
  tableName: string,
  namespace: string,
  entriesNamespace: string
): string {
  const columns = spec.columns.map((column) => {
    const props = columnPropsText(column);
    return `  ${column.key}: ${namespace}.${dialect.typeNames[column.fn]}${props.length > 0 ? `<{${props.join('; ')}}>` : ''};`;
  });
  const names = spec.columns
    .filter((column) => column.args[0] !== undefined && column.args[0] !== column.key)
    .map((column) => `${column.key}: ${literalTypeText(column.args[0])}`);
  const entries = spec.extras.map((extra) => `  ${renderEntryType(extra, spec, entriesNamespace)},`);
  return `${namespace}.${dialect.tableType}<'${tableName}', {\n${columns.join('\n')}\n}, [\n${entries.join('\n')}\n], {${names.join('; ')}}>`;
}

/** One covered extra as the canonical TableEntry spelling. */
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

/** Literal VALUE text of a config/arg, the JS twin of literalTypeText. */
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

/** A covered column as its shipped builder chain: `NS.varchar('c0', {length: 5}).notNull()`. */
export function renderColumnBuilders(column: ColumnSpec, namespace: string, parentConst: string): string {
  let text = `${namespace}.${column.fn}(${column.args.map(literalValueText).join(', ')})`;
  for (const mod of column.mods) text += `.${mod.method}(${mod.args.map(literalValueText).join(', ')})`;
  if (column.referencesParent) {
    text += `.references(() => cols(${parentConst}).id, ${literalValueText(FUZZ_REFERENCE_ACTIONS)})`;
  }
  return text;
}

/** Twin of renderTableType: together they let a fuzz iteration prove both roads share ONE runtype id. */
function renderTableBuilders(
  dialect: SpecDialect,
  spec: TableSpec,
  tableName: string,
  namespace: string,
  parentConst: string,
  parentRefText = `cols(${parentConst}).id`
): string {
  const columns = spec.columns.map((column) => `  ${column.key}: ${renderColumnBuilders(column, namespace, parentConst)},`);
  const base = `${namespace}.${dialect.tableFn}('${tableName}', {\n${columns.join('\n')}\n}`;
  if (spec.extras.length === 0) return `${base})`;
  const entries = spec.extras.map((extra) => {
    if (extra.fn === 'foreignKey') {
      const fkColumn = spec.columns.find((column) => column.referencesParent)!;
      return (
        `    ${namespace}.foreignKey({name: '${extra.name}', ` +
        `columns: [t.${fkColumn.key}], foreignColumns: [${parentRefText}]}),`
      );
    }
    const on = (extra.onKeys ?? []).map((key) => `t.${key}`).join(', ');
    return `    ${namespace}.${extra.fn}('${extra.name}').on(${on}),`;
  });
  return `${base}, (t) => [\n${entries.join('\n')}\n  ])`;
}

/** A covered column as a single-call builder: `NS.varchar('c0', {length: 5, notNull: true})`. */
function renderColumnSingleCall(column: ColumnSpec, namespace: string, parentConst: string): string {
  const [name, config] = column.args as [string | undefined, Record<string, unknown> | undefined];
  const props: string[] = Object.entries(config ?? {}).map(([key, value]) => `${key}: ${literalValueText(value)}`);
  for (const mod of column.mods) {
    props.push(`${mod.method}: ${mod.args.length > 0 ? `[${mod.args.map(literalValueText).join(', ')}]` : 'true'}`);
  }
  if (column.referencesParent)
    props.push(`references: [() => tableRef(${parentConst}, 'id'), ${literalValueText(FUZZ_REFERENCE_ACTIONS)}]`);
  const args: string[] = [];
  if (name !== undefined) args.push(literalValueText(name));
  if (props.length > 0) args.push(`{${props.join(', ')}}`);
  return `${namespace}.${column.fn}(${args.join(', ')})`;
}

/** A covered spec with single-call builders, reusing renderTableBuilders' extras. */
function renderTableSingleCall(
  dialect: SpecDialect,
  spec: TableSpec,
  tableName: string,
  namespace: string,
  parentConst: string
): string {
  const chained = renderTableBuilders(dialect, spec, tableName, namespace, parentConst, `tableRef(${parentConst}, 'id')`);
  const columns = spec.columns.map((column) => `  ${column.key}: ${renderColumnSingleCall(column, namespace, parentConst)},`);
  const head = `${namespace}.${dialect.tableFn}('${tableName}', {\n${columns.join('\n')}\n}`;
  return head + chained.slice(chained.indexOf('\n}') + 2);
}

/** A covered spec as shipped `NS.PgTable<'name', {...}, [extras]>` type text. */
function renderTableType(dialect: SpecDialect, spec: TableSpec, tableName: string, namespace: string): string {
  const columns = spec.columns.map((column) => `  ${column.key}: ${renderColumnType(dialect, column, namespace)};`);
  const base = `${namespace}.${dialect.tableType}<'${tableName}', {\n${columns.join('\n')}\n}`;
  if (spec.extras.length === 0) return `${base}>`;
  const entries = spec.extras.map((extra) => `  ${renderEntryType(extra, spec, namespace)},`);
  return `${base}, [\n${entries.join('\n')}\n]>`;
}

// ── synthetic reflected graph of a covered spec ──────────────────────────────
// Mirrors what the resolver reflects for the rendered type text (the shape fromType.spec.ts pins),
// so the wide fuzz space exercises the bridge on every run without spawning the resolver.

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

/** The extras tuple members of a covered spec, shared by both graph shapes. */
function syntheticEntries(spec: TableSpec): ReflectedNode[] {
  return spec.extras.map((extra) => {
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
}

/** The synthetic reflected graph of a covered spec's shipped type spelling. */
function syntheticTableGraph(dialect: SpecDialect, spec: TableSpec, tableName: string): ReflectedNode {
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
  const entries = syntheticEntries(spec);
  // The table type IS its metadata: name / columns / extras are the root's own members, the brand marks it a table.
  const meta: Record<string, ReflectedNode> = {
    'þ@rtTableBrand': literalNode(dialect.brand),
    name: literalNode(tableName),
    columns: objectNode(columns),
  };
  if (entries.length > 0) meta.extras = tupleNode(entries);
  return objectNode(meta);
}

/** The spec as the resolver reflects next/ columns: config and modifiers in one spec, differing db names in `names`. */
function syntheticNextTableGraph(dialect: SpecDialect, spec: TableSpec, tableName: string): ReflectedNode {
  const columns: Record<string, ReflectedNode> = {};
  const names: Record<string, ReflectedNode> = {};
  for (const column of spec.columns) {
    const [name, config] = column.args as [string | undefined, Record<string, unknown> | undefined];
    if (name !== undefined && name !== column.key) names[column.key] = literalNode(name);
    const props: Record<string, ReflectedNode> = {};
    for (const [key, value] of Object.entries(config ?? {})) props[key] = valueNode(value);
    for (const mod of column.mods)
      props[mod.method] = mod.args.length > 0 ? tupleNode(mod.args.map(valueNode)) : literalNode(true);
    if (column.referencesParent) {
      props.references = tupleNode([valueNode({table: FUZZ_PARENT_NAME, column: 'id'}), valueNode(FUZZ_REFERENCE_ACTIONS)]);
    }
    columns[column.key] = objectNode({
      'þ@rtColSpecKey': objectNode({
        fn: literalNode(column.fn),
        config: objectNode(props),
        data: objectNode({}),
        base: undefinedNode(),
      }),
    });
  }
  const entries = syntheticEntries(spec);
  const meta: Record<string, ReflectedNode> = {
    'þ@rtTableBrand': literalNode(dialect.brand),
    name: literalNode(tableName),
    columns: objectNode(columns),
    names: objectNode(names),
  };
  if (entries.length > 0) meta.extras = tupleNode(entries);
  return objectNode(meta);
}

/** The spec generator and type-road renderers bound to one dialect. */
export function specTools(dialect: SpecDialect) {
  return {
    makeSpec: (rng: () => number) => makeSpec(dialect, rng),
    typeRoadCovers: (spec: TableSpec) => typeRoadCovers(dialect, spec),
    typeRoadReduce: (spec: TableSpec) => typeRoadReduce(dialect, spec),
    renderColumnType: (column: ColumnSpec, namespace: string) => renderColumnType(dialect, column, namespace),
    renderNextTableType: (spec: TableSpec, tableName: string, namespace: string, entriesNamespace: string) =>
      renderNextTableType(dialect, spec, tableName, namespace, entriesNamespace),
    renderTableBuilders: (spec: TableSpec, tableName: string, namespace: string, parentConst: string, parentRefText?: string) =>
      renderTableBuilders(dialect, spec, tableName, namespace, parentConst, parentRefText),
    renderTableSingleCall: (spec: TableSpec, tableName: string, namespace: string, parentConst: string) =>
      renderTableSingleCall(dialect, spec, tableName, namespace, parentConst),
    renderTableType: (spec: TableSpec, tableName: string, namespace: string) =>
      renderTableType(dialect, spec, tableName, namespace),
    syntheticTableGraph: (spec: TableSpec, tableName: string) => syntheticTableGraph(dialect, spec, tableName),
    syntheticNextTableGraph: (spec: TableSpec, tableName: string) => syntheticNextTableGraph(dialect, spec, tableName),
  };
}
