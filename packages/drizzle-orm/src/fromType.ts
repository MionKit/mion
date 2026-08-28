/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The runtime bridge of the pure-types road: rebuild a slim table (column
// recorders + createRtTable) from the REFLECTED graph of a type-defined table
// (PgTable<'users', {...}>). The graph carries everything the builders would
// have recorded — builder fn, db column name, config and modifier calls ride
// the rtColSpec/rtColMods sentinels as literal types — so the rebuilt table
// materializes into exactly the drizzle table the builder road produces.
//
// This module imports NOTHING from @ts-runtypes/core at runtime (the dialect
// packages' core peer is type-only): callers resolve the graph themselves
// (tableFromType(getRunType<UsersTable>()) in the dialect's ./drizzle module)
// and the walker reads the plain node objects structurally.

import {RtColumnRecorder, sql} from './recorder.ts';
import type {AnyRtColumn} from './recorder.ts';
import type {BuildTableFn} from './table.ts';
import {createRtTable} from './table.ts';

/** Runtime inputs a type-defined table cannot carry in the type: the tables
 *  its References modifiers point at, keyed by DB table name. */
export interface TableFromTypeDeps {
  tables?: Record<string, object>;
}

/** Minimal structural view of a reflected RunType node (the walker's whole
 *  vocabulary). Kind values mirror runTypeKind.generated.ts in
 *  @ts-runtypes/core — wire-stable by contract, pinned by fromType.spec.ts. */
export interface ReflectedNode {
  id: string;
  kind?: unknown;
  name?: unknown;
  literal?: unknown;
  child?: ReflectedNode;
  children?: ReflectedNode[];
}
/** The kind discriminators the walker dispatches on. Local on purpose (no
 *  runtime @ts-runtypes/core import in this package); values are wire-stable
 *  and fromType.spec.ts pins them against RunTypeKind. */
export const reflectedKinds = {
  undefined: 11,
  literal: 13,
  tuple: 26,
  objectLiteral: 30,
} as const;
const KIND_UNDEFINED = reflectedKinds.undefined;
const KIND_LITERAL = reflectedKinds.literal;
const KIND_TUPLE = reflectedKinds.tuple;
const KIND_OBJECT_LITERAL = reflectedKinds.objectLiteral;

/** Suffix-match a symbol-keyed member (tsgo spells it `þ@<symbolConstName>`). */
function memberNamed(node: ReflectedNode, suffix: string): ReflectedNode | undefined {
  return node.children?.find((member) => typeof member.name === 'string' && member.name.endsWith(suffix));
}

/** Exact-match a plain (string-keyed) member. */
function plainMember(node: ReflectedNode, name: string): ReflectedNode | undefined {
  return node.children?.find((member) => member.name === name);
}

function fail(detail: string): never {
  throw new Error(`@mionjs/drizzle-orm tableFromType: ${detail}`);
}

/** Reconstruct the JS value of a literal type tree (string/number/boolean
 *  literals, undefined, literal objects, tuples). An Sql<'text'> carrier
 *  becomes a recorded sql template, so replayed args hold real sql values.
 *  Anything else is not representable in a column spec and fails loudly. */
function literalValueOf(node: ReflectedNode, where: string): unknown {
  if (node.kind === KIND_LITERAL) return node.literal;
  if (node.kind === KIND_UNDEFINED) return undefined;
  if (node.kind === KIND_TUPLE) {
    return (node.children ?? []).map((member, i) => literalValueOf(member.child ?? member, `${where}[${i}]`));
  }
  if (node.kind === KIND_OBJECT_LITERAL) {
    const sqlMember = memberNamed(node, '@rtSqlTextKey');
    if (sqlMember?.child) {
      const textNode = plainMember(sqlMember.child, 'sql')?.child;
      if (textNode?.kind !== KIND_LITERAL || typeof textNode.literal !== 'string') {
        fail(`${where}: the Sql carrier has no literal text`);
      }
      const text = textNode.literal;
      const strings = Object.assign([text], {raw: [text]}) as unknown as TemplateStringsArray;
      return sql(strings);
    }
    const value: Record<string, unknown> = {};
    for (const member of node.children ?? []) {
      if (typeof member.name !== 'string' || member.child === undefined) fail(`${where} carries a non-literal member`);
      value[member.name] = literalValueOf(member.child, `${where}.${member.name}`);
    }
    return value;
  }
  fail(`${where} is not a literal type (kind ${String(node.kind)}) — only literal values can ride a column type`);
}

interface ColumnSpec {
  fn: string;
  name: string | undefined;
  config: Record<string, unknown> | undefined;
}

function readColumnSpec(columnNode: ReflectedNode, key: string): ColumnSpec {
  const specMember = memberNamed(columnNode, '@rtColSpecKey');
  if (!specMember?.child) {
    fail(`column "${key}" carries no column spec — use the dialect column types (Varchar, Uuid, ...), not plain data types`);
  }
  const spec = specMember.child;
  const fnNode = plainMember(spec, 'fn')?.child;
  const fn = fnNode?.kind === KIND_LITERAL ? fnNode.literal : undefined;
  if (typeof fn !== 'string') fail(`column "${key}" spec has no builder fn literal`);
  const nameValue = literalValueOf(plainMember(spec, 'name')?.child ?? {id: '', kind: KIND_UNDEFINED}, `${key}.name`);
  if (nameValue !== undefined && typeof nameValue !== 'string') fail(`column "${key}" spec name is not a string`);
  const configNode = plainMember(spec, 'config')?.child;
  let config: Record<string, unknown> | undefined;
  if (configNode !== undefined) {
    const configValue = literalValueOf(configNode, `${key}.config`);
    if (configValue !== undefined && (typeof configValue !== 'object' || Array.isArray(configValue))) {
      fail(`column "${key}" spec config is not an object`);
    }
    config = configValue as Record<string, unknown> | undefined;
    if (config !== undefined && Object.keys(config).length === 0) config = undefined;
  }
  return {fn, name: nameValue, config};
}

/** Replay one column's modifier calls onto its recorder: `true` = no-arg flag,
 *  a tuple = the call args. Order is the mods object's member order.
 *  References resolves its target through deps.tables lazily (the referenced
 *  table may still be materializing), validated eagerly here. */
function applyMods(
  recorder: RtColumnRecorder,
  columnNode: ReflectedNode,
  key: string,
  deps: TableFromTypeDeps | undefined
): void {
  const modsMember = memberNamed(columnNode, '@rtColModsKey');
  if (!modsMember?.child) return;
  const methods = recorder as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const modMember of modsMember.child.children ?? []) {
    const method = modMember.name;
    if (typeof method !== 'string' || modMember.child === undefined) fail(`column "${key}" has a malformed modifier`);
    if (method === '$type') continue;
    if (typeof methods[method] !== 'function') fail(`column "${key}" carries an unknown modifier "${method}"`);
    const value = literalValueOf(modMember.child, `${key}.${method}`);
    if (method === 'references') {
      const [ref, actions] = value as [{table: string; column: string}, object | undefined];
      const target = deps?.tables?.[ref.table];
      if (target === undefined) {
        fail(`column "${key}" references table "${ref.table}" — pass it via tableFromType deps: {tables: {${ref.table}: ...}}`);
      }
      recorder.references(() => (target as Record<string, AnyRtColumn>)[ref.column], actions);
      continue;
    }
    if (value === true) {
      methods[method]();
    } else if (Array.isArray(value)) {
      methods[method](...value);
    } else {
      fail(`column "${key}" modifier "${method}" carries neither a flag nor an args tuple`);
    }
  }
}

/** Rebuild the slim table from a reflected type-road table graph. The result
 *  is a normal slim table: hand it to materializeRtTable (which is what the
 *  dialect tableFromType wrappers do). */
export function buildRtTableFromGraph(graph: ReflectedNode, buildTable: BuildTableFn, deps?: TableFromTypeDeps): object {
  const metaMember = memberNamed(graph, '@rtTableKey');
  if (!metaMember?.child) {
    fail('the reflected type is not a table — declare it with the dialect table type (PgTable<Name, Cols>, ...)');
  }
  const meta = metaMember.child;
  const nameNode = plainMember(meta, 'name')?.child;
  const tableName = nameNode?.kind === KIND_LITERAL ? nameNode.literal : undefined;
  if (typeof tableName !== 'string') fail('the table name is not a string literal');
  const columnsNode = plainMember(meta, 'columns')?.child;
  if (columnsNode?.children === undefined) fail(`table "${tableName}" has no columns record`);

  const columns: Record<string, unknown> = {};
  for (const columnMember of columnsNode.children) {
    const key = columnMember.name;
    if (typeof key !== 'string' || columnMember.child === undefined) continue;
    const spec = readColumnSpec(columnMember.child, key);
    const args: unknown[] = [];
    if (spec.name !== undefined) args.push(spec.name);
    if (spec.config !== undefined) args.push(spec.config);
    const recorder = new RtColumnRecorder((context) => context.ns[spec.fn](...(args as never[])));
    applyMods(recorder, columnMember.child, key, deps);
    columns[key] = recorder;
  }
  return createRtTable(tableName, columns, undefined, buildTable) as object;
}
