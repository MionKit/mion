// Reference interpreter for `createRemoveUnknownKeysFn<T>()`, the oracle the clone fuzz compares against (O15).
// A naive walk mirroring the Go emitter's arms one-for-one, short enough to eyeball:
// ts-go-runtypes/internal/cachegen/typefunctions/remove_unknown_keys.go. Object-bearing unions throw here (the
// factory is a RUK001 alwaysThrow). It only sees values that passed `validate<T>`, so a crash is a signal.

import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';

const kind = RunTypeKind;
const sub = RunTypeSubKind;

/** SubKind → Temporal builtin (mirrors protocol.TemporalInfoBySubKind). **/
const TEMPORAL_BUILTIN: Record<number, string> = {
  [sub.temporalInstant]: 'Instant',
  [sub.temporalZonedDateTime]: 'ZonedDateTime',
  [sub.temporalPlainDate]: 'PlainDate',
  [sub.temporalPlainTime]: 'PlainTime',
  [sub.temporalPlainDateTime]: 'PlainDateTime',
  [sub.temporalPlainYearMonth]: 'PlainYearMonth',
  [sub.temporalPlainMonthDay]: 'PlainMonthDay',
  [sub.temporalDuration]: 'Duration',
};

/** Member kinds that are function-like (mirrors isFunctionLikeKind). **/
const FUNCTION_LIKE_KINDS = new Set<number>([kind.function, kind.method, kind.methodSignature, kind.callSignature]);

/** Reference clone of `value` for the reflected type `schema`. See module doc. **/
export function referenceClone(schema: RunType, value: unknown): unknown {
  return cloneNode(schema, value, refTableFor(schema));
}

// ─────────────────────────── ref resolution ───────────────────────────
// `getRunType` returns a KNOTTED graph (ref slots are patched to real object
// references post-construction — the mock walker recurses it directly), so
// resolution is normally a no-op. A `{kind: -1, id}` ref node, should one
// ever surface, resolves through an id table built from the schema graph.

type RefTable = Map<string, RunType>;
const refTableCache = new WeakMap<RunType, RefTable>();

function refTableFor(schema: RunType): RefTable {
  let table = refTableCache.get(schema);
  if (!table) {
    table = new Map();
    indexNodes(schema, table, new Set());
    refTableCache.set(schema, table);
  }
  return table;
}

const CHILD_LISTS = ['children', 'parameters', 'arguments', 'typeArguments', 'safeUnionChildren'] as const;
const CHILD_SLOTS = ['child', 'index', 'return', 'indexType', 'extends', 'classType'] as const;

function indexNodes(node: RunType, table: RefTable, seen: Set<RunType>): void {
  // Some slots can carry LIVE runtime values rather than RunType nodes (a
  // class node's constructor, literal payloads); reading `.arguments` off a
  // strict-mode function throws, so only plain-object nodes are walked.
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  if (typeof node.id === 'string' && (node.kind as number) !== kind.ref) table.set(node.id, node);
  for (const slot of CHILD_SLOTS) {
    const next = node[slot] as RunType | undefined;
    if (next) indexNodes(next, table, seen);
  }
  for (const list of CHILD_LISTS) {
    const nodes = node[list] as RunType[] | undefined;
    if (Array.isArray(nodes)) for (const next of nodes) indexNodes(next, table, seen);
  }
}

function resolve(node: RunType, table: RefTable): RunType {
  if ((node.kind as number) !== kind.ref) return node;
  const target = table.get(node.id);
  if (!target) throw new Error(`referenceClone: dangling ref "${node.id}" in the schema graph`);
  return target;
}

// ─────────────────────────── the walk ───────────────────────────

function cloneNode(rawNode: RunType, value: unknown, table: RefTable): unknown {
  const node = resolve(rawNode, table);
  const k = node.kind as number;
  switch (k) {
    case kind.objectLiteral:
    case kind.intersection:
      return cloneShapedObject(node, value, false, table);

    case kind.class: {
      const subKind = (node.subKind as number | undefined) ?? sub.none;
      if (subKind === sub.date) return new Date((value as Date).getTime());
      if (subKind === sub.map) return cloneMap(node, value as Map<unknown, unknown>, table);
      if (subKind === sub.set) return cloneSet(node, value as Set<unknown>, table);
      const temporalName = TEMPORAL_BUILTIN[subKind];
      if (temporalName) {
        const temporal = (globalThis as Record<string, unknown>).Temporal as
          | Record<string, {from(v: unknown): unknown}>
          | undefined;
        if (!temporal) throw new Error('referenceClone: Temporal is not available on globalThis');
        return temporal[temporalName].from(value);
      }
      if (subKind === sub.nonSerializable) return value; // opaque handle — shared
      return cloneShapedObject(node, value, true, table);
    }

    case kind.regexp:
      return value; // not data — shared by reference like a function

    case kind.array: {
      if (!node.child) return (value as unknown[]).slice();
      const elemType = node.child;
      return (value as unknown[]).map((element) => cloneNode(elemType, element, table));
    }

    case kind.tuple:
      return cloneTuple(node, value as unknown[], table);

    case kind.indexSignature:
      // Bare index-signature root; mirrors emitIndexSignatureRemoveUnknownKeys.
      return cloneShapedObject({...node, children: [node]} as RunType, value, false, table);

    case kind.union:
      return cloneUnion(node, value, table);

    // Wrappers (defensive — parents normally unwrap before recursing).
    case kind.property:
    case kind.propertySignature:
    case kind.parameter:
    case kind.tupleMember:
      return node.child ? cloneNode(node.child, value, table) : value;

    // Immutable kinds (primitives, enums, literals, template literals,
    // bigint, null/undefined/void/never) and opaque kinds (any/unknown/bare
    // object, symbol, function kinds, promise) — shared by reference.
    default:
      return value;
  }
}

/** True when a declared property's VALUE type cannot be rebuilt — kept on the
 *  clone, shared by reference (mirrors opaqueValueSlot). **/
function isOpaqueValueType(node: RunType): boolean {
  const k = node.kind as number;
  if (FUNCTION_LIKE_KINDS.has(k)) return true;
  if (k === kind.symbol || k === kind.promise) return true;
  if (k === kind.class && (node.subKind as number | undefined) === sub.nonSerializable) return true;
  if (k === kind.literal && Array.isArray(node.flags) && (node.flags as string[]).includes('symbol')) return true;
  return false;
}

/** Mirrors emitObjectRemoveUnknownKeys. **/
function cloneShapedObject(node: RunType, value: unknown, asClass: boolean, table: RefTable): unknown {
  const source = value as Record<string | number, unknown>;
  interface PropPlan {
    name: string | number;
    optional: boolean;
    /** undefined ⇒ copy the raw member value by reference (opaque). **/
    childType: RunType | undefined;
  }
  const props: PropPlan[] = [];
  const sigs: RunType[] = [];
  // Declared names the index-sig for-in must skip: every non-static,
  // non-function-like named member — kept OR dropped (mirrors
  // collectSiblingNamedKeys, which guards G6: a dropped prop must not be
  // copied back in by a sig arm).
  const sigSkipNames = new Set<string>();

  for (const child of (node.children ?? []) as RunType[]) {
    const member = resolve(child, table);
    const memberKind = member.kind as number;
    if (member.isStatic) continue;
    if (FUNCTION_LIKE_KINDS.has(memberKind)) {
      // Class methods ride the shared prototype — never copied. An
      // object-literal method member is an own function-valued prop:
      // declared members are never dropped, so it copies by reference.
      if (asClass) continue;
      if (member.name === undefined) continue; // callable-interface signature — out of corpus scope
      props.push({name: member.name as string | number, optional: Boolean(member.optional), childType: undefined});
      continue;
    }
    if (memberKind === kind.indexSignature) {
      sigs.push(member);
      continue;
    }
    if (memberKind !== kind.property && memberKind !== kind.propertySignature) continue;
    if (member.name === undefined || !member.child) continue;
    sigSkipNames.add(String(member.name));
    const childType = resolve(member.child, table);
    props.push({
      name: member.name as string | number,
      optional: Boolean(member.optional),
      childType: isOpaqueValueType(childType) ? undefined : childType,
    });
  }

  // Index-signature copy walk first (its keys are declared shape too), then
  // the declared-prop assignments so they win any name conflict — mirrors
  // buildSafeIndexSignatureObject's for-in + trailing assignments. A sig
  // object clones to a PLAIN object even for a class (the emitter routes to
  // the sig walk before the class branch).
  if (sigs.length > 0) {
    const out: Record<string | number, unknown> = {};
    for (const key in source) {
      if (sigSkipNames.has(key)) continue;
      for (const sig of sigs) {
        const keyType = sig.index ? resolve(sig.index, table) : undefined;
        if (keyType && (keyType.kind as number) === kind.symbol) continue; // symbol-keyed sig — never enumerated
        if (keyType && (keyType.kind as number) === kind.templateLiteral) {
          // The compiled walk gates these keys behind the pattern regex; the
          // corpus must not include them, so fail loudly instead of diverging.
          throw new Error('referenceClone: template-literal index signatures are out of scope for the v1 corpus');
        }
        if (!sig.child) continue;
        const valueType = resolve(sig.child, table);
        if (FUNCTION_LIKE_KINDS.has(valueType.kind as number)) continue; // function-valued sig — skipped arm
        out[key] = cloneNode(valueType, source[key], table);
      }
    }
    for (const prop of props) {
      const raw = source[prop.name];
      if (prop.optional && raw === undefined) continue;
      out[prop.name] = prop.childType ? cloneNode(prop.childType, raw, table) : raw;
    }
    return out;
  }

  // No clonable declared properties — the exact shape is `{}` regardless of
  // the value's content (mirrors the emitter's early return, which drops the
  // class prototype too).
  if (props.length === 0) return {};

  const out: Record<string | number, unknown> = asClass
    ? (Object.create(Object.getPrototypeOf(source)) as Record<string | number, unknown>)
    : {};
  for (const prop of props) {
    const raw = source[prop.name];
    if (prop.optional && raw === undefined) continue;
    out[prop.name] = prop.childType ? cloneNode(prop.childType, raw, table) : raw;
  }
  return out;
}

/** Tuple rebuild: per-slot recursion truncated to `value.length` (absent
 *  trailing optionals stay absent); a rest tail recurses per element. **/
function cloneTuple(node: RunType, value: unknown[], table: RefTable): unknown[] {
  const members = (node.children ?? []) as RunType[];
  const out: unknown[] = [];
  let hasOptional = false;
  for (let i = 0; i < members.length; i++) {
    const member = resolve(members[i], table);
    const restType = restElementType(member, table);
    if (restType) {
      const start = typeof member.position === 'number' ? member.position : i;
      for (let j = start; j < value.length; j++) out.push(cloneNode(restType, value[j], table));
      return out;
    }
    if (member.optional) hasOptional = true;
    const slotType = member.child ? resolve(member.child, table) : member;
    out.push(member.optional && value[i] === undefined ? undefined : cloneNode(slotType, value[i], table));
  }
  // Absent trailing optional slots must stay absent (mirrors the emitter's
  // `.slice(0, v.length)` truncation of the positional literal).
  return hasOptional ? out.slice(0, value.length) : out;
}

/** Element type of a rest tuple member, or null for a regular slot. The wire
 *  marks rest via `flags: ['rest']` with `child` = the element type; a
 *  rest-node wrapper (`child.kind === rest`) is handled defensively. **/
function restElementType(member: RunType, table: RefTable): RunType | null {
  if ((member.kind as number) === kind.rest) return member.child ? resolve(member.child, table) : null;
  const child = member.child ? resolve(member.child, table) : undefined;
  if (child && (child.kind as number) === kind.rest) return child.child ? resolve(child.child, table) : null;
  if (Array.isArray(member.flags) && (member.flags as string[]).includes('rest')) return child ?? null;
  return null;
}

function cloneMap(node: RunType, value: Map<unknown, unknown>, table: RefTable): Map<unknown, unknown> {
  const args = (node.arguments ?? []) as RunType[];
  const keyType = args[0]?.child as RunType | undefined;
  const valueType = args[1]?.child as RunType | undefined;
  const out = new Map<unknown, unknown>();
  for (const [entryKey, entryValue] of value) {
    out.set(
      keyType ? cloneNode(keyType, entryKey, table) : entryKey,
      valueType ? cloneNode(valueType, entryValue, table) : entryValue
    );
  }
  return out;
}

function cloneSet(node: RunType, value: Set<unknown>, table: RefTable): Set<unknown> {
  const elementType = (node.arguments ?? [])[0]?.child as RunType | undefined;
  const out = new Set<unknown>();
  for (const item of value) out.add(elementType ? cloneNode(elementType, item, table) : item);
  return out;
}

/** Mirrors emitUnionRemoveUnknownKeys: the first member whose structural family matches clones it. **/
function cloneUnion(node: RunType, value: unknown, table: RefTable): unknown {
  for (const child of (node.children ?? []) as RunType[]) {
    const member = resolve(child, table);
    if (member.notSupported) continue; // DataOnly-stripped member — never dispatched
    const memberKind = member.kind as number;
    if (memberKind === kind.objectLiteral || memberKind === kind.intersection) {
      throw new Error('referenceClone: object-bearing unions are out of scope (compiled factory is a RUK001 alwaysThrow)');
    }
    if ((memberKind === kind.array || memberKind === kind.tuple) && Array.isArray(value)) {
      return cloneNode(member, value, table);
    }
    if (memberKind === kind.regexp && value instanceof RegExp) return cloneNode(member, value, table);
    if (memberKind === kind.class) {
      const subKind = (member.subKind as number | undefined) ?? sub.none;
      if (subKind === sub.none) {
        throw new Error('referenceClone: class-bearing unions are out of scope for the v1 corpus');
      }
      if (subKind === sub.date && value instanceof Date) return cloneNode(member, value, table);
      if (subKind === sub.map && value instanceof Map) return cloneNode(member, value, table);
      if (subKind === sub.set && value instanceof Set) return cloneNode(member, value, table);
    }
  }
  return value;
}
