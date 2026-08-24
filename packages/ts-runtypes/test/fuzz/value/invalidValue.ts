// Metamorphic invalid-value generation — the inverse of mockType.ts.
//
// Where the mock walker produces a value that PASSES `validate<T>`, this
// module produces a value that must FAIL it. The hard part is soundness:
// "what is invalid" depends entirely on the node being evaluated (a number
// is invalid for `string`, but valid for `string | number`), so generation
// is a per-kind switch — exactly mirroring the mock walker — and the tree
// walker only ever targets positions where invalidity is PROVABLE.
//
// Two pieces:
//   - `invalidForKind`  : per-kind switch → a value wrong for THAT kind,
//                         plus a `proven` flag (false for any/unknown/union
//                         and other kinds whose validator can re-accept).
//   - `mutateToInvalid` : clones a valid mock and corrupts exactly one
//                         provably-invalidatable position, so the whole
//                         value is guaranteed to fail validation.
//
// SOUNDNESS CONTRACT (one-directional, like the noop predicate): when
// `mutateToInvalid` returns a value, `validate<T>` on it MUST be `false`.
// A false negative (returning null when a mutation was possible) only costs
// coverage; a false positive (claiming invalid when the value still passes)
// produces a spurious oracle failure. The walker is deliberately
// conservative: it never descends through `union`, `any`, `unknown`,
// index signatures, or Map/Set internals, where a sibling branch or a
// catch-all could re-accept the corrupted value.

import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';

/** A wrong value for one node, plus whether it is PROVABLY invalid for that
 *  node's kind in isolation (ignoring ancestors — the walker handles those). **/
export interface InvalidValue {
  value: unknown;
  proven: boolean;
}

/** A single corruption site discovered during the tandem walk. **/
export interface MutationTarget {
  /** Property/index path from the root value to the corrupted position. **/
  path: Array<string | number>;
  /** The wrong value to write at `path`. **/
  value: unknown;
  /** The kind of the node that governs `path` (for diagnostics). **/
  kind: number;
}

const kind = RunTypeKind;
const sub = RunTypeSubKind;

/** Per-kind invalid-value switch. Returns a value of a DISJOINT type so the
 *  near-miss exercises coercion paths (e.g. `'123'` for `number` probes loose
 *  parsing), and `proven` says whether the validator for this kind can ever
 *  accept it. New kinds land here, never in helper files — mirrors mockSwitch. **/
export function invalidForKind(runType: RunType): InvalidValue {
  const k = runType.kind as number;
  switch (k) {
    // No value is invalid for these — the validator is a no-op `() => true`.
    case kind.any:
    case kind.unknown:
      return {value: FRESH_ALIEN(), proven: false};
    // `never` rejects everything, so any value is a valid invalid sample.
    case kind.never:
      return {value: 0, proven: true};
    case kind.string:
    case kind.templateLiteral:
      return {value: 123, proven: true};
    case kind.number:
      return {value: 'not-a-number', proven: true};
    case kind.boolean:
      return {value: 'not-a-boolean', proven: true};
    case kind.bigint:
      return {value: 123, proven: true};
    case kind.symbol:
      return {value: 'not-a-symbol', proven: true};
    case kind.null:
      return {value: 0, proven: true};
    case kind.undefined:
    case kind.void:
      return {value: 0, proven: true};
    case kind.regexp:
      return {value: 'not-a-regexp', proven: true};
    case kind.object:
      return {value: 42, proven: true};
    case kind.literal:
      return invalidForLiteral(runType.literal);
    case kind.enum:
      return invalidForEnum(runType.values as unknown[] | undefined);
    case kind.array:
    case kind.tuple:
    case kind.rest:
      return {value: 42, proven: true};
    case kind.objectLiteral:
    case kind.intersection:
    case kind.indexSignature:
      return {value: 42, proven: true};
    case kind.class:
      return invalidForClass(runType.subKind as number | undefined);
    // Single-child wrappers: invalid means an invalid child.
    case kind.property:
    case kind.propertySignature:
    case kind.parameter:
    case kind.tupleMember:
      return runType.child ? invalidForKind(runType.child) : {value: FRESH_ALIEN(), proven: false};
    // Cannot prove a single value fails every union branch from here, so the
    // walker never targets a union; this path is only a best-effort fallback.
    case kind.union:
      return {value: FRESH_ALIEN(), proven: false};
    default:
      return {value: FRESH_ALIEN(), proven: false};
  }
}

/** Invalid for a `class` node depends on its builtin subKind. Every variant
 *  expects an object/instance, so a primitive is invalid — except the
 *  non-serializable bucket, whose validator semantics we don't pin here. **/
function invalidForClass(subKind: number | undefined): InvalidValue {
  if (subKind === sub.nonSerializable) return {value: 42, proven: false};
  return {value: 42, proven: true};
}

/** A different value of a different type from the literal — guaranteed not to
 *  `===` the only accepted value. **/
function invalidForLiteral(literal: unknown): InvalidValue {
  if (typeof literal === 'string') return {value: literal + '\u0000__fuzz', proven: true};
  if (typeof literal === 'number') return {value: literal + 1, proven: true};
  if (typeof literal === 'bigint') return {value: literal + 1n, proven: true};
  if (typeof literal === 'boolean') return {value: !literal, proven: true};
  if (literal === null) return {value: 0, proven: true};
  return {value: FRESH_ALIEN(), proven: true};
}

/** A value provably outside the enum's value set. **/
function invalidForEnum(values: unknown[] | undefined): InvalidValue {
  if (!Array.isArray(values) || values.length === 0) return {value: FRESH_ALIEN(), proven: true};
  const candidate = '__fuzz_not_in_enum__';
  if (!values.includes(candidate)) return {value: candidate, proven: true};
  // The string literal is (improbably) a member — fall back to a fresh symbol,
  // which no enum can contain.
  return {value: FRESH_ALIEN(), proven: true};
}

/** A fresh symbol is invalid for every kind except any/unknown/symbol — the
 *  universal "alien" value used as a last-resort wrong value. **/
function FRESH_ALIEN(): symbol {
  return Symbol('fuzz-invalid');
}

/** Object-container kinds the walker descends into property-by-property. **/
function isObjectContainer(runType: RunType): boolean {
  const k = runType.kind as number;
  if (k === kind.objectLiteral || k === kind.intersection) return true;
  // A user class (subKind none) is structural; builtin classes are leaves.
  if (k === kind.class && ((runType.subKind as number | undefined) ?? sub.none) === sub.none) return true;
  return false;
}

/** Unwrap property/parameter/tupleMember wrappers to the type they carry. **/
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

/** Walk a runtype tree alongside a concrete (valid) value, collecting every
 *  position where a kind-wrong value is PROVABLY invalid for the whole root.
 *  Descent stops at union/any/unknown/index-signature/Map/Set so no collected
 *  target sits under something that could re-accept the corruption. **/
export function collectMutationTargets(runType: RunType, value: unknown): MutationTarget[] {
  const targets: MutationTarget[] = [];
  walk(unwrap(runType), value, [], targets);
  return targets;
}

function walk(runType: RunType, value: unknown, path: Array<string | number>, out: MutationTarget[]): void {
  const node = unwrap(runType);
  const k = node.kind as number;

  if (isObjectContainer(node)) {
    if (!isPlainRecord(value)) return;
    for (const child of (node.children ?? []) as RunType[]) {
      const ck = child.kind as number;
      if (ck !== kind.property && ck !== kind.propertySignature) continue;
      const name = child.name as string | number | undefined;
      if (name === undefined || !Object.prototype.hasOwnProperty.call(value, name)) continue;
      const memberValue = (value as Record<string | number, unknown>)[name];
      // An explicit `undefined` slot (optional omitted by the mock) carries no
      // value to corrupt into a wrong type — skip it.
      if (memberValue === undefined) continue;
      walk(child.child ?? child, memberValue, [...path, name], out);
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
      if (isRestMember(member)) continue; // rest length is fluid — skip
      if (i >= value.length || value[i] === undefined) continue;
      walk(member.child ?? member, value[i], [...path, i], out);
    }
    return;
  }

  // Non-descended kinds (union, any, unknown, indexSignature, promise,
  // function, Map/Set, non-serializable class, …) are either leaves we can't
  // prove or catch-alls we must not descend. Treat eligible leaves as targets.
  if (NON_TARGET_KINDS.has(k)) return;
  if (k === kind.class && !isObjectContainer(node) && (node.subKind as number) === sub.nonSerializable) return;

  const invalid = invalidForKind(node);
  if (invalid.proven) out.push({path, value: invalid.value, kind: k});
}

/** Kinds the walker neither descends nor targets. **/
const NON_TARGET_KINDS = new Set<number>([
  kind.union,
  kind.any,
  kind.unknown,
  kind.indexSignature,
  kind.promise,
  kind.function,
  kind.method,
  kind.methodSignature,
  kind.callSignature,
  kind.typeParameter,
  kind.infer,
]);

/** Map/Set builtin classes — leaves, but we replace the whole instance rather
 *  than descend into entries. **/
function isMapOrSet(runType: RunType): boolean {
  const subKind = runType.subKind as number | undefined;
  return runType.kind === kind.class && (subKind === sub.map || subKind === sub.set);
}

function isRestMember(member: RunType): boolean {
  if (member.kind === kind.rest) return true;
  return member.child !== undefined && member.child.kind === kind.rest;
}

function isPlainRecord(value: unknown): value is Record<string | number, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Map) && !(value instanceof Set)
  );
}

/** Produce ONE invalid variant of `value` by corrupting a single provably
 *  invalidatable position. Returns null when no such position exists (e.g. the
 *  root is `any`/`unknown` or an unconstrained union). `rng` selects which
 *  target to hit so repeated calls explore different positions. **/
export function mutateToInvalid(
  runType: RunType,
  value: unknown,
  rng: () => number
): {value: unknown; target: MutationTarget} | null {
  const targets = collectMutationTargets(runType, value);
  if (targets.length > 0) {
    const target = targets[Math.floor(rng() * targets.length)];
    return {value: applyMutation(value, target.path, target.value), target};
  }
  // No deep target — try replacing the whole value if the root kind is provable.
  const rootInvalid = invalidForKind(unwrap(runType));
  if (rootInvalid.proven && !isMapOrSet(unwrap(runType))) {
    const target: MutationTarget = {path: [], value: rootInvalid.value, kind: unwrap(runType).kind as number};
    return {value: rootInvalid.value, target};
  }
  return null;
}

/** Clone the spine from the root to `path` (sharing untouched branches) and
 *  write `wrong` at the leaf. Never mutates the input value. **/
export function applyMutation(root: unknown, path: Array<string | number>, wrong: unknown): unknown {
  if (path.length === 0) return wrong;
  const clone = shallowClone(root);
  let cursor = clone as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const step = path[i];
    cursor[step] = shallowClone(cursor[step]);
    cursor = cursor[step] as Record<string | number, unknown>;
  }
  cursor[path[path.length - 1]] = wrong;
  return clone;
}

function shallowClone(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') return {...(value as Record<string, unknown>)};
  return value;
}
