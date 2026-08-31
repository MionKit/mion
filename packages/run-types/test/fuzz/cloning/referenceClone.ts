// Reference interpreter for `createCloneExactShapeFn<T>()` — the executable
// oracle the clone fuzz compares the COMPILED clone against (O15).
//
// A naive, obviously-correct walk of the reflected RunType graph that mirrors
// the Go emitter's per-kind arms one-for-one
// (ts-go-runtypes/internal/cachegen/typefunctions/clone_exact_shape.go),
// trading all of its output-shape decisions for the dumbest possible
// implementation. No caching, no fastpaths, no code generation — when the
// compiled clone and this walk disagree on a conforming value, one of them is
// wrong, and this one is short enough to eyeball.
//
// The contract mirrored here:
//   - primitives / enums / literals / template literals / bigint / null /
//     undefined / never / any / unknown / bare object, plus the OPAQUE kinds
//     (symbol, function kinds, Promise, non-serializable natives) → returned
//     AS-IS (pass by reference).
//   - ObjectLiteral / Class<SubKindNone> → fresh object rebuilt from the
//     DECLARED members only (classes keep their prototype via
//     `Object.create(Object.getPrototypeOf(v))`). Declared members are NEVER
//     dropped: an opaque-valued member is kept, shared by reference. Class
//     METHODS ride the shared prototype and are not copied; object-literal
//     method members are own props and copy by reference. Static members are
//     skipped. Absent optionals stay absent (`v[name] === undefined` skips).
//     Index signatures copy every non-declared key with the sig's value
//     clone applied; everything undeclared is dropped by construction.
//   - Array → per-element recursion. Tuple → per-slot recursion truncated to
//     `value.length`; a rest tail recurses per element.
//   - Map / Set → fresh instance, per-entry recursion. Date → re-wrap.
//     RegExp → re-compile (source + flags + lastIndex). Temporal → fresh via
//     the static `from()`.
//   - Union: OBJECT-bearing unions are out of scope (the compiled factory is
//     a CES001 alwaysThrow — the corpus must exclude them; this walk throws
//     loudly if one slips in). Atomic unions dispatch structurally: an
//     array/Date/RegExp/Map/Set value matching a member gets that member's
//     clone, everything else passes through. The corpus keeps at most one
//     member per structural family so this dispatch is unambiguous.
//
// Pure module: no vitest imports, no I/O. Runs only on values that PASSED
// `validate<T>` (the oracle gates on it), so the walk asserts shape instead
// of defensively guarding — a crash here is a signal, not a hazard.

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
      return cloneRegExp(value as RegExp);

    case kind.array: {
      if (!node.child) return (value as unknown[]).slice();
      const elemType = node.child;
      return (value as unknown[]).map((element) => cloneNode(elemType, element, table));
    }

    case kind.tuple:
      return cloneTuple(node, value as unknown[], table);

    case kind.indexSignature:
      // Bare index-signature root (root reach-in) — the object arm normally
      // consumes sigs; mirror emitIndexSignatureCloneExactShape.
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

/** ObjectLiteral / Class<None> rebuild (mirrors emitObjectCloneExactShape). **/
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

function cloneRegExp(value: RegExp): RegExp {
  const out = new RegExp(value.source, value.flags);
  out.lastIndex = value.lastIndex;
  return out;
}

/** Atomic-union dispatch (mirrors emitUnionCloneExactShape): first member
 *  whose structural family matches the value gets its clone; immutable and
 *  opaque members fall through to the `return v` tail. **/
function cloneUnion(node: RunType, value: unknown, table: RefTable): unknown {
  for (const child of (node.children ?? []) as RunType[]) {
    const member = resolve(child, table);
    if (member.notSupported) continue; // DataOnly-stripped member — never dispatched
    const memberKind = member.kind as number;
    if (memberKind === kind.objectLiteral || memberKind === kind.intersection) {
      throw new Error('referenceClone: object-bearing unions are out of scope (compiled factory is a CES001 alwaysThrow)');
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
