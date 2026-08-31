// Metamorphic EXTRAS generation — the clone-fuzz twin of invalidValue.ts.
//
// Where `mutateToInvalid` corrupts a valid mock so `validate<T>` must reject
// it, this module decorates a valid mock with undeclared keys so the value
// STAYS valid while `createCloneExactShapeFn<T>` must strip every one of them.
// The tandem tree walk collects PLAIN-OBJECT positions — ObjectLiteral /
// Class<SubKindNone> nodes WITHOUT index signatures — then injects 1–3
// `__fz_extra_<n>` keys with random primitive values at randomly chosen
// positions of a deep copy of the mock.
//
// SOUNDNESS CONTRACT (one-directional, mirrors invalidValue.ts): when
// `mutateWithExtras` returns a value, `validate<T>` on it MUST still be
// `true` AND a correct exact-shape clone MUST drop every injected key. A
// false negative (returning null when an injection was possible) only costs
// coverage; a false positive produces a spurious oracle failure. The walker
// is therefore deliberately conservative — it never descends through
// `union` (a sibling arm could make the extra load-bearing), Map/Set
// internals (entries are not keyed positions), or index-signature objects
// (a sig would make the injected key DECLARED shape: kept by the clone, and
// type-checked by validate — both oracle directions would break).

import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';

const kind = RunTypeKind;
const sub = RunTypeSubKind;

/** An extras-decorated variant of a valid mock, still `validate === true`. **/
export interface ExtrasValue {
  value: unknown;
  injectedCount: number;
}

const FUNCTION_LIKE_KINDS = new Set<number>([kind.function, kind.method, kind.methodSignature, kind.callSignature]);

/** Kinds whose member VALUE the walker never descends into (opaque —
 *  shared by reference, nothing inside is a keyed clone position). **/
function isOpaqueValueType(node: RunType): boolean {
  const k = node.kind as number;
  if (FUNCTION_LIKE_KINDS.has(k)) return true;
  if (k === kind.symbol || k === kind.promise) return true;
  if (k === kind.class && (node.subKind as number | undefined) === sub.nonSerializable) return true;
  return false;
}

/** True for an ObjectLiteral / Class<None> node with NO index signatures —
 *  the only positions where an undeclared key is provably (a) ignored by
 *  validate and (b) dropped by a correct exact-shape clone. **/
function isPlainObjectContainer(node: RunType): boolean {
  const k = node.kind as number;
  const isObjectish =
    k === kind.objectLiteral || (k === kind.class && ((node.subKind as number | undefined) ?? sub.none) === sub.none);
  if (!isObjectish) return false;
  for (const child of (node.children ?? []) as RunType[]) {
    if ((child.kind as number) === kind.indexSignature) return false;
    if ((child.kind as number) === kind.callSignature) return false; // callable interface — function-like, not a plain object
  }
  return true;
}

/** True for values an object-position injection can write into. **/
function isPlainRecordValue(value: unknown): value is Record<string | number, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Map) &&
    !(value instanceof Set) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp)
  );
}

/** Unwrap property/parameter/tupleMember wrappers (mirrors invalidValue.ts). **/
function unwrap(runType: RunType): RunType {
  let current = runType;
  while (
    current.child &&
    (current.kind === kind.property ||
      current.kind === kind.propertySignature ||
      current.kind === kind.parameter ||
      current.kind === kind.tupleMember)
  ) {
    current = current.child;
  }
  return current;
}

function isRestMember(member: RunType): boolean {
  if (member.kind === kind.rest) return true;
  if (member.child !== undefined && member.child.kind === kind.rest) return true;
  return Array.isArray(member.flags) && (member.flags as string[]).includes('rest');
}

/** Walk the runtype tree alongside a concrete valid value, collecting the
 *  path of every sound injection position. Descent covers object members,
 *  array elements, and fixed tuple slots; it stops at union / Map / Set /
 *  index-signature / opaque positions (see the soundness contract above). **/
export function collectExtrasPositions(runType: RunType, value: unknown): Array<Array<string | number>> {
  const positions: Array<Array<string | number>> = [];
  walk(unwrap(runType), value, [], positions);
  return positions;
}

function walk(node: RunType, value: unknown, path: Array<string | number>, out: Array<Array<string | number>>): void {
  const k = node.kind as number;

  if (isPlainObjectContainer(node)) {
    if (!isPlainRecordValue(value)) return;
    out.push(path);
    for (const member of (node.children ?? []) as RunType[]) {
      const memberKind = member.kind as number;
      if (member.isStatic) continue;
      if (memberKind !== kind.property && memberKind !== kind.propertySignature) continue;
      const name = member.name as string | number | undefined;
      if (name === undefined || !member.child) continue;
      const memberValue = value[name];
      if (memberValue === undefined) continue; // absent optional — nothing to descend
      const childType = member.child;
      if (isOpaqueValueType(childType)) continue;
      walk(childType, memberValue, [...path, name], out);
    }
    return;
  }

  if (k === kind.array) {
    if (!Array.isArray(value) || !node.child) return;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) continue;
      walk(node.child, value[i], [...path, i], out);
    }
    return;
  }

  if (k === kind.tuple) {
    if (!Array.isArray(value)) return;
    const members = (node.children ?? []) as RunType[];
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (isRestMember(member)) continue; // rest positions shift — skip the tail
      if (i >= value.length || value[i] === undefined) continue;
      walk(unwrap(member), value[i], [...path, i], out);
    }
    return;
  }

  // Everything else — union, Map/Set, index-sig objects, promises, opaque
  // and immutable leaves — is neither an injection position nor descended.
}

const EXTRA_VALUES: Array<() => unknown> = [() => 'fz-extra', () => 42.5, () => true, () => null, () => -7];

/** Produce an extras-decorated variant of `value` (a deep copy — the input
 *  mock is never touched) with 1–3 fresh `__fz_extra_<n>` keys injected at
 *  randomly chosen sound positions. Returns null when the type offers no
 *  sound position (atomic roots, pure records, Map/Set roots, …). **/
export function mutateWithExtras(runType: RunType, value: unknown, rng: () => number): ExtrasValue | null {
  const positions = collectExtrasPositions(runType, value);
  if (positions.length === 0) return null;
  const copy = deepCopyValue(value);
  const injectedCount = 1 + Math.floor(rng() * 3);
  for (let n = 0; n < injectedCount; n++) {
    const path = positions[Math.floor(rng() * positions.length)];
    const target = atPath(copy, path) as Record<string, unknown>;
    target[`__fz_extra_${n}`] = EXTRA_VALUES[Math.floor(rng() * EXTRA_VALUES.length)]();
  }
  return {value: copy, injectedCount};
}

function atPath(root: unknown, path: Array<string | number>): unknown {
  let cursor = root;
  for (const step of path) cursor = (cursor as Record<string | number, unknown>)[step];
  return cursor;
}

/** Prototype-preserving deep copy used both for injection (never mutate the
 *  caller's mock) and as the O16 pre-clone snapshot. Key presence is kept
 *  exactly (an explicit `key: undefined` stays a present key); functions,
 *  symbols, promises, Temporal instances and other opaque handles are shared
 *  by reference — they are pass-through in the clone contract and are only
 *  ever compared by identity. Corpus values are finite trees (no cycles). **/
export function deepCopyValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) {
    const copy = new RegExp(value.source, value.flags);
    copy.lastIndex = value.lastIndex;
    return copy;
  }
  if (Array.isArray(value)) return value.map((item) => deepCopyValue(item));
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    for (const [entryKey, entryValue] of value) copy.set(deepCopyValue(entryKey), deepCopyValue(entryValue));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>();
    for (const item of value) copy.add(deepCopyValue(item));
    return copy;
  }
  if (isOpaqueInstance(value)) return value;
  const copy = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    copy[key] = deepCopyValue((value as Record<string, unknown>)[key]);
  }
  return copy;
}

/** Object-typed values copied by reference: opaque handles (same set the
 *  isolation walker excludes) plus immutable Temporal instances. **/
function isOpaqueInstance(value: object): boolean {
  if (
    value instanceof Promise ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof WeakMap ||
    value instanceof WeakSet
  ) {
    return true;
  }
  const tag = (value as Record<PropertyKey, unknown>)[Symbol.toStringTag];
  return typeof tag === 'string' && tag.startsWith('Temporal.');
}
