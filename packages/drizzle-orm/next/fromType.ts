/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Rebuilds a slim table from a reflected table type. Differs from ../src/fromType.ts only in that modifier
// calls ride the spec's config (split by colModNames) and db names come from the table's `names` member.

import {isColModName} from '../src/typeColumns.ts';
import {RtColumnRecorder, RtEntryRecorder, sql} from '../src/recorder.ts';
import type {AnyRtColumn, RtSql} from '../src/recorder.ts';
import type {BuildTableFn} from '../src/table.ts';
import {createRtTable} from '../src/table.ts';
import type {ReflectedNode, TableDep} from '../src/fromType.ts';
import {reflectedKinds} from '../src/fromType.ts';
import type {AnyTable} from './table.ts';
import type {ColSpecOf, ValueOf} from './columns.ts';

type DataOfCol<C> = ColSpecOf<C> extends {config: infer P; data: infer D} ? ValueOf<P, D> : never;

/** Per-column runtime callbacks a type cannot carry, keyed like the column's $ markers. */
export type RuntimeCallbacks<T extends AnyTable> = {
  [K in keyof T['columns']]?: {
    $default?: () => DataOfCol<T['columns'][K]> | RtSql;
    $defaultFn?: () => DataOfCol<T['columns'][K]> | RtSql;
    $onUpdate?: () => DataOfCol<T['columns'][K]> | RtSql;
    $onUpdateFn?: () => DataOfCol<T['columns'][K]> | RtSql;
  };
};
export interface TableFromTypeOptions<T extends AnyTable = AnyTable> {
  tables?: Record<string, TableDep>;
  runtime?: RuntimeCallbacks<T>;
}

const KIND_UNDEFINED = reflectedKinds.undefined;
const KIND_LITERAL = reflectedKinds.literal;
const KIND_TUPLE = reflectedKinds.tuple;
const KIND_OBJECT_LITERAL = reflectedKinds.objectLiteral;
const runtimeModMethods = new Set(['$default', '$defaultFn', '$onUpdate', '$onUpdateFn']);

function membersOf(node: ReflectedNode | undefined): ReflectedNode[] {
  return node?.children ?? [];
}
function memberNamed(node: ReflectedNode, suffix: string): ReflectedNode | undefined {
  return membersOf(node).find((member) => typeof member.name === 'string' && member.name.endsWith(suffix));
}
function plainMember(node: ReflectedNode, name: string): ReflectedNode | undefined {
  return membersOf(node).find((member) => member.name === name);
}
function fail(detail: string): never {
  throw new Error(`@mionjs/drizzle-orm tableFromType: ${detail}`);
}

function literalValueOf(node: ReflectedNode, where: string): unknown {
  if (node.kind === KIND_LITERAL) return node.literal;
  if (node.kind === KIND_UNDEFINED) return undefined;
  if (node.kind === KIND_TUPLE)
    return (node.children ?? []).map((member, i) => literalValueOf(member.child ?? member, `${where}[${i}]`));
  if (node.kind === KIND_OBJECT_LITERAL) {
    const sqlMember = memberNamed(node, '@rtSqlTextKey');
    if (sqlMember?.child) {
      const textNode = plainMember(sqlMember.child, 'sql')?.child;
      if (textNode?.kind !== KIND_LITERAL || typeof textNode.literal !== 'string')
        fail(`${where}: the Sql carrier has no literal text`);
      const text = textNode.literal;
      return sql(Object.assign([text], {raw: [text]}) as unknown as TemplateStringsArray);
    }
    const value: Record<string, unknown> = {};
    for (const member of node.children ?? []) {
      if (typeof member.name !== 'string' || member.child === undefined) fail(`${where} carries a non-literal member`);
      value[member.name] = literalValueOf(member.child, `${where}.${member.name}`);
    }
    return value;
  }
  fail(`${where} is not a literal type (kind ${String(node.kind)}), only literal values can ride a column type`);
}

/** Call only when drizzle asks for the column: a thunked table exists only then. */
function refColumn(options: TableFromTypeOptions | undefined, key: string, ref: {table: string; column: string}): AnyRtColumn {
  const column = (tableDep(options, ref.table) as Record<string, AnyRtColumn | undefined>)[ref.column];
  if (column === undefined) fail(`column "${key}" references no column "${ref.column}" in table "${ref.table}"`);
  return column;
}

function tableDep(options: TableFromTypeOptions | undefined, name: string): object | undefined {
  const dep = options?.tables?.[name];
  return typeof dep === 'function' ? (dep as () => object)() : dep;
}

/** The db names that differ from the record key, off the table's `names` member. */
function readNames(meta: ReflectedNode): Record<string, string> {
  const names: Record<string, string> = {};
  for (const member of membersOf(plainMember(meta, 'names')?.child)) {
    const value = member.child;
    if (typeof member.name === 'string' && value?.kind === KIND_LITERAL && typeof value.literal === 'string')
      names[member.name] = value.literal;
  }
  return names;
}

/** One column: the builder call from the spec's config keys, then its modifier keys replayed in order. */
function buildColumn(
  columnNode: ReflectedNode,
  key: string,
  dbName: string | undefined,
  options: TableFromTypeOptions | undefined,
  consumedRuntime: Set<string>
): RtColumnRecorder {
  const spec = memberNamed(columnNode, '@rtColSpecKey')?.child;
  if (!spec) fail(`column "${key}" carries no column spec, use the dialect column types (Varchar, Uuid, ...)`);
  const fnNode = plainMember(spec, 'fn')?.child;
  const fn = fnNode?.kind === KIND_LITERAL ? fnNode.literal : undefined;
  if (typeof fn !== 'string') fail(`column "${key}" spec has no builder fn literal`);
  if (fn === 'enum' || fn === 'custom')
    fail(`column "${key}" is a ${fn} column, which needs its runtime handle: declare it with the builders`);
  const configMembers = membersOf(plainMember(spec, 'config')?.child);
  const config: Record<string, unknown> = {};
  for (const member of configMembers) {
    if (typeof member.name !== 'string' || member.child === undefined) fail(`column "${key}" config has a malformed member`);
    // Modifier keys are skipped BEFORE reading a value: $type carries a type with no literal value.
    if (!isColModName(member.name)) config[member.name] = literalValueOf(member.child, `${key}.${member.name}`);
  }
  const args: unknown[] = [];
  if (dbName !== undefined) args.push(dbName);
  if (Object.keys(config).length > 0) args.push(config);
  const recorder = new RtColumnRecorder((context) => context.ns[fn](...(args as never[])));
  const methods = recorder as unknown as Record<string, (...callArgs: unknown[]) => unknown>;
  for (const member of configMembers) {
    const method = member.name as string;
    if (!isColModName(method) || method === '$type') continue;
    if (runtimeModMethods.has(method)) {
      const callback = options?.runtime?.[key]?.[method as '$default'];
      if (typeof callback !== 'function')
        fail(
          `column "${key}" carries the ${method} marker, pass the callback via options: {runtime: {${key}: {${method}: () => ...}}}`
        );
      methods[method](callback);
      consumedRuntime.add(`${key}.${method}`);
      continue;
    }
    const value = literalValueOf(member.child!, `${key}.${method}`);
    if (method === 'references') {
      const [ref, actions] = value as [{table: string; column: string}, object | undefined];
      if (options?.tables?.[ref.table] === undefined)
        fail(`column "${key}" references table "${ref.table}", pass it via tableFromType options: {tables: {${ref.table}: ...}}`);
      recorder.references(() => refColumn(options, key, ref), actions);
    } else if (value === true) {
      methods[method]();
    } else if (Array.isArray(value)) {
      methods[method](...value);
    } else {
      fail(`column "${key}" modifier "${method}" carries neither a flag nor an args tuple`);
    }
  }
  return recorder;
}

interface EntrySpec {
  fn: string;
  args: unknown[];
  chain: Array<{method: string; args: unknown[] | true}>;
}
function readEntries(meta: ReflectedNode, tableName: string): EntrySpec[] {
  const extrasNode = plainMember(meta, 'extras')?.child;
  if (extrasNode === undefined || extrasNode.kind !== KIND_TUPLE) return [];
  return (extrasNode.children ?? []).map((rawMember, index) => {
    const specMember = memberNamed(rawMember.child ?? rawMember, '@rtEntrySpecKey');
    if (!specMember?.child) fail(`table "${tableName}" extras[${index}] carries no entry spec (use the TableEntry types)`);
    const fnNode = plainMember(specMember.child, 'fn')?.child;
    const fn = fnNode?.kind === KIND_LITERAL ? fnNode.literal : undefined;
    if (typeof fn !== 'string') fail(`table "${tableName}" extras[${index}] has no fn literal`);
    const argsNode = plainMember(specMember.child, 'args')?.child;
    const args = argsNode === undefined ? [] : (literalValueOf(argsNode, `extras[${index}].args`) as unknown[]);
    const chain: EntrySpec['chain'] = membersOf(plainMember(specMember.child, 'chain')?.child).map((chainMember) => {
      const value = literalValueOf(chainMember.child!, `extras[${index}].${String(chainMember.name)}`);
      if (value !== true && !Array.isArray(value))
        fail(`table "${tableName}" extras[${index}].${String(chainMember.name)} is neither a flag nor an args tuple`);
      return {method: chainMember.name as string, args: value as unknown[] | true};
    });
    return {fn, args, chain};
  });
}
function resolveEntryRefs(
  value: unknown,
  self: Record<string, unknown>,
  options: TableFromTypeOptions | undefined,
  where: string
): unknown {
  if (Array.isArray(value)) return value.map((item, i) => resolveEntryRefs(item, self, options, `${where}[${i}]`));
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 1 && typeof record.col === 'string') {
    if (self[record.col] === undefined) fail(`${where}: no column "${record.col}" in this table`);
    return self[record.col];
  }
  if (keys.length === 2 && typeof record.col === 'string' && typeof record.table === 'string') {
    const target = tableDep(options, record.table);
    if (target === undefined) fail(`${where}: references table "${record.table}", pass it via tableFromType options`);
    return (target as Record<string, unknown>)[record.col];
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const mapped: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) mapped[key] = resolveEntryRefs(item, self, options, `${where}.${key}`);
  return mapped;
}

/** Rebuild the slim table from a reflected hand-written table graph. */
export function buildRtTableFromGraph(
  graph: ReflectedNode,
  buildTable: BuildTableFn,
  options?: TableFromTypeOptions,
  expectedDialect?: string
): object {
  const brandMember = memberNamed(graph, '@rtTableBrand');
  if (!brandMember) fail('the reflected type is not a table, declare it with the dialect table type (PgTable<Name, Cols>, ...)');
  const reflectedDialect = brandMember.child?.kind === KIND_LITERAL ? brandMember.child.literal : undefined;
  if (expectedDialect !== undefined && typeof reflectedDialect === 'string' && reflectedDialect !== expectedDialect) {
    fail(`the reflected type is a ${reflectedDialect} table, rebuilt through the ${expectedDialect} package`);
  }
  const nameNode = plainMember(graph, 'name')?.child;
  const tableName = nameNode?.kind === KIND_LITERAL ? nameNode.literal : undefined;
  if (typeof tableName !== 'string') fail('the table name is not a string literal');
  const columnsNode = plainMember(graph, 'columns')?.child;
  if (columnsNode?.children === undefined) fail(`table "${tableName}" has no columns record`);
  const names = readNames(graph);
  const columns: Record<string, unknown> = {};
  const consumedRuntime = new Set<string>();
  for (const columnMember of columnsNode.children) {
    const key = columnMember.name;
    if (typeof key !== 'string' || columnMember.child === undefined) continue;
    columns[key] = buildColumn(columnMember.child, key, names[key], options, consumedRuntime);
  }
  for (const [key, callbacks] of Object.entries(options?.runtime ?? {})) {
    for (const [method, callback] of Object.entries(callbacks ?? {})) {
      if (callback !== undefined && !consumedRuntime.has(`${key}.${method}`)) {
        fail(`options.runtime.${key}.${method} has no matching ${method} marker on the column type (or no such column)`);
      }
    }
  }
  const entries = readEntries(graph, tableName);
  const extraConfig =
    entries.length === 0
      ? undefined
      : (self: Record<string, unknown>) =>
          entries.map((entry, index) => {
            const where = `table "${tableName}" extras[${index}]`;
            const recorder = new RtEntryRecorder(entry.fn, resolveEntryRefs(entry.args, self, options, where) as unknown[]);
            const chainable = recorder as unknown as Record<string, (...chainArgs: unknown[]) => unknown>;
            for (const {method, args} of entry.chain) {
              if (typeof chainable[method] !== 'function') fail(`${where}: unknown chain method "${method}"`);
              if (args === true) chainable[method]();
              else chainable[method](...(resolveEntryRefs(args, self, options, `${where}.${method}`) as unknown[]));
            }
            return recorder;
          });
  return createRtTable(tableName, columns, extraConfig as never, buildTable) as object;
}
