// Where an undeclared key can be planted, and what every unknown-keys family
// must then answer. The twin of `cloning/extrasValue.ts`, and deliberately a
// SECOND walker rather than a mode on that one: the clone oracle depends on
// its conservative contract (never a union, never a Map/Set, never an index
// signature), and the whole point here is to walk into exactly those places.
//
// The families this feeds are the ones that decide what an "unknown key" is,
// each with its own Go emitter and its own arm per position:
//
//   huk   createHasUnknownKeysFn
//   uke   createUnknownKeyErrorsFn
//   ces   createCloneExactShapeFn      (the public strip)
//   ukuw  the JSON decoder's `strategy: 'strip'` pre-pass
//   vst / vest  the `{checkUnknowns: true}` validators, which reuse huk / uke
//
// They have drifted apart more than once, always the same way: a position the
// shared merged-allowlist walk did not reach. So this walker's job is reach,
// not caution — every position that has its own arm, labelled with the answer
// all of them owe:
//
//   'flagged'   an undeclared key here is undeclared for every family
//   'carveOut'  an index signature declares every key, so every family must
//               answer clean — including the WHOLE union when any member
//               carries one (the emit no-ops for the family there)
//
// SOUNDNESS CONTRACT. When `plantUnknownKey` returns a position, the planted
// key name (`__fz_uk_<n>`) is one no member of the type could declare, so the
// merged-allowlist reading and the per-branch reading agree it is undeclared,
// and `validate<T>` on the result is still true. A missed position costs
// coverage, and O27 turns that cost into a failure rather than silence; a wrong
// LABEL produces a spurious oracle failure, so the walker stops rather than
// guesses: it never enters an index-signature object, and it enters a union
// only when ONE member could have produced the value, so no sibling arm can
// make a deeper key declared.

import type {RunType} from '../../../src/runtypes/types.ts';
import type {RTValidationErrorPathSegment} from '../../../src/createRTFunctions.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';
import {deepCopyValue} from '../cloning/extrasValue.ts';

const kind = RunTypeKind;
const sub = RunTypeSubKind;

/** What every unknown-keys family owes for a key planted at this position. **/
export type UnknownKeyPositionKind = 'flagged' | 'carveOut';

export interface UnknownKeyPosition {
  /** The container's path, spelled the way `unknownKeyErrors` spells it: a
   *  string for an object key, a number for an array / tuple index, and a
   *  `{key, failed}` segment for a Map / Set entry. The reported path of the
   *  planted key is this path plus the key name. **/
  path: RTValidationErrorPathSegment[];
  kind: UnknownKeyPositionKind;
}

export interface PlantedUnknownKey {
  /** A deep copy of the input with ONE undeclared key added. **/
  value: unknown;
  /** The key name, e.g. `__fz_uk_0`. **/
  key: string;
  /** The full path the families must report, container path + key name. **/
  path: RTValidationErrorPathSegment[];
  kind: UnknownKeyPositionKind;
}

/** The planted key's name. No arm can declare it, and it survives a JSON
 *  round trip unchanged, so the wire and runtime readings agree. **/
export const UNKNOWN_KEY_PREFIX = '__fz_uk_';

const FUNCTION_LIKE_KINDS = new Set<number>([kind.function, kind.method, kind.methodSignature, kind.callSignature]);

/** Unwrap the property / parameter / tupleMember carriers (mirrors extrasValue.ts). **/
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

/** Kinds whose member VALUE is opaque — nothing inside is a keyed position. **/
function isOpaqueValueType(node: RunType): boolean {
  const k = node.kind as number;
  if (FUNCTION_LIKE_KINDS.has(k)) return true;
  if (k === kind.symbol || k === kind.promise) return true;
  if (k === kind.class && (node.subKind as number | undefined) === sub.nonSerializable) return true;
  return false;
}

/** An ObjectLiteral or a plain user Class — the two nodes that carry declared
 *  property names and therefore an unknown-key check. **/
function isObjectish(node: RunType): boolean {
  const k = node.kind as number;
  if (k === kind.objectLiteral) return true;
  return k === kind.class && ((node.subKind as number | undefined) ?? sub.none) === sub.none;
}

/** True when the node declares an index signature — every key matching it is
 *  declared, which is the documented carve-out. A callable interface is
 *  function-like rather than a plain object, so it is out too. **/
function hasIndexSignature(node: RunType): boolean {
  for (const child of (node.children ?? []) as RunType[]) {
    const k = child.kind as number;
    if (k === kind.indexSignature || k === kind.callSignature) return true;
  }
  return false;
}

/** Values an object-position plant can write into. A Date / RegExp / Map /
 *  Set instance is a native, not a keyed shape. **/
function isPlainRecordValue(value: unknown): value is Record<string, unknown> {
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

function isRestMember(member: RunType): boolean {
  if (member.kind === kind.rest) return true;
  if (member.child !== undefined && member.child.kind === kind.rest) return true;
  return Array.isArray(member.flags) && (member.flags as string[]).includes('rest');
}

/** The union's answer for the WHOLE family: one member with an index
 *  signature makes every key declared from the union's point of view, and the
 *  emit no-ops for every family at that node. **/
function unionIsCarveOut(node: RunType): boolean {
  for (const member of (node.children ?? []) as RunType[]) {
    const resolved = unwrap(member);
    if (isObjectish(resolved) && hasIndexSignature(resolved)) return true;
  }
  return false;
}

/** The coarse runtime class a value belongs to, matched against a member's kind. Array and tuple
 *  share one class on purpose: telling them apart takes a length check the walker has no business
 *  doing, so a union of both is refused rather than guessed. **/
function coarseClassMatches(node: RunType, value: unknown): boolean {
  const k = node.kind as number;
  const subKind = node.subKind as number | undefined;
  if (Array.isArray(value)) return k === kind.array || k === kind.tuple;
  if (value instanceof Map) return k === kind.class && subKind === sub.map;
  if (value instanceof Set) return k === kind.class && subKind === sub.set;
  if (isPlainRecordValue(value)) return isObjectish(node);
  return false; // an atomic, a Date, a RegExp: no keyed position inside
}

/** The one member that could have produced this value, or null when the answer is not unambiguous.
 *  Two members of the same coarse class stays refused, and that refusal is right rather than
 *  cautious: the fused validator follows the branch it matched while the unknown-key families read
 *  the MERGED allowlist, so a deeper key has two honest answers there. `any`, `unknown`, a nested
 *  union and a ref match everything or nothing decidably, so they refuse too. **/
function soleUnionMemberFor(node: RunType, value: unknown): RunType | null {
  let found: RunType | null = null;
  for (const member of (node.children ?? []) as RunType[]) {
    const resolved = unwrap(member);
    const memberKind = resolved.kind as number;
    if (memberKind === kind.any || memberKind === kind.unknown || memberKind === kind.union || memberKind === kind.ref) {
      return null;
    }
    if (!coarseClassMatches(resolved, value)) continue;
    if (found) return null;
    found = resolved;
  }
  return found;
}

/** True when a keyed shape (an object literal or a plain class) sits ANYWHERE in the tree. The
 *  root's own kind is irrelevant: an array, a tuple, a union, a Map or a Set all carry one further
 *  down, and every hole this walker has ever had was a position it refused to reach while some
 *  family happily walked it. Paired with collectUnknownKeyPositions by O27, which turns "the walker
 *  found nowhere to plant" from silence into a failure. **/
export function containsKeyedShape(runType: RunType, depth = 0, seen = new Set<RunType>()): boolean {
  const node = unwrap(runType);
  if (depth > 16 || seen.has(node)) return false;
  seen.add(node);
  if (isObjectish(node)) return true;
  if (isOpaqueValueType(node)) return false;
  const branches: RunType[] = [];
  if (node.child) branches.push(node.child);
  branches.push(...((node.children ?? []) as RunType[]));
  branches.push(...((node.arguments ?? []) as RunType[]));
  return branches.some((branch) => containsKeyedShape(branch, depth + 1, seen));
}

/** Every position an undeclared key can be planted at, walking the runtype
 *  tree alongside a conforming value. Descent covers object members, array
 *  items, fixed tuple slots, Map keys and values, and Set items, plus the one
 *  member of a union that could have produced the value. A record-shaped union
 *  is itself the position, and an index-signature object is the carve-out. **/
export function collectUnknownKeyPositions(runType: RunType, value: unknown): UnknownKeyPosition[] {
  const out: UnknownKeyPosition[] = [];
  walk(unwrap(runType), value, [], out);
  return out;
}

function walk(node: RunType, value: unknown, path: RTValidationErrorPathSegment[], out: UnknownKeyPosition[]): void {
  const k = node.kind as number;

  if (isObjectish(node)) {
    if (!isPlainRecordValue(value)) return;
    if (hasIndexSignature(node)) {
      out.push({path, kind: 'carveOut'});
      return; // an index signature declares every key; nothing below is decidable here
    }
    out.push({path, kind: 'flagged'});
    for (const member of (node.children ?? []) as RunType[]) {
      const memberKind = member.kind as number;
      if (member.isStatic) continue;
      if (memberKind !== kind.property && memberKind !== kind.propertySignature) continue;
      const name = member.name as string | undefined;
      if (name === undefined || !member.child) continue;
      const memberValue = value[name];
      if (memberValue === undefined) continue; // absent optional — nothing to descend
      if (isOpaqueValueType(member.child)) continue;
      walk(member.child, memberValue, [...path, name], out);
    }
    return;
  }

  if (k === kind.union) {
    if (unionIsCarveOut(node)) {
      if (isPlainRecordValue(value)) out.push({path, kind: 'carveOut'});
      return; // a member declares every key, so the whole union answers clean
    }
    if (isPlainRecordValue(value)) {
      out.push({path, kind: 'flagged'});
      return; // the record IS the position; a sibling arm could declare a deeper key
    }
    // Not record-shaped, so the union node itself is not a position. Descend only when ONE member
    // could have produced this value: with no sibling arm in play, both readings of the union agree
    // a deeper key is undeclared.
    const sole = soleUnionMemberFor(node, value);
    if (!sole) return;
    const nested: UnknownKeyPosition[] = [];
    walk(sole, value, path, nested);
    // An index signature further down re-opens what the union declares, so the member contributes
    // nothing rather than a guessed label.
    if (nested.some((position) => position.kind === 'carveOut')) return;
    out.push(...nested);
    return;
  }

  if (k === kind.array) {
    if (!Array.isArray(value) || !node.child) return;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) continue;
      walk(unwrap(node.child), value[i], [...path, i], out);
    }
    return;
  }

  if (k === kind.tuple) {
    if (!Array.isArray(value)) return;
    const members = (node.children ?? []) as RunType[];
    for (let i = 0; i < members.length; i++) {
      if (isRestMember(members[i])) continue; // rest positions shift — skip the tail
      if (i >= value.length || value[i] === undefined) continue;
      walk(unwrap(members[i]), value[i], [...path, i], out);
    }
    return;
  }

  if (k === kind.class) {
    const subKind = node.subKind as number | undefined;
    const args = (node.arguments ?? []) as RunType[];
    if (subKind === sub.map && value instanceof Map) {
      // `key` is the entry's iteration index and `failed` says which side —
      // exactly what unknownKeyErrors pushes for a Map entry.
      const keyType = args[0]?.child;
      const valueType = args[1]?.child;
      let index = 0;
      for (const [entryKey, entryValue] of value) {
        if (keyType) walk(unwrap(keyType), entryKey, [...path, {key: index, failed: 'mapKey'}], out);
        if (valueType) walk(unwrap(valueType), entryValue, [...path, {key: index, failed: 'mapValue'}], out);
        index++;
      }
      return;
    }
    if (subKind === sub.set && value instanceof Set) {
      const itemType = args[0]?.child;
      let index = 0;
      for (const item of value) {
        if (itemType) walk(unwrap(itemType), item, [...path, {key: index, failed: 'setKey'}], out);
        index++;
      }
      return;
    }
    return;
  }

  // Everything else — atomics, literals, natives, promises, opaque leaves —
  // is neither a position nor descended.
}

/** Plant ONE undeclared key at a randomly chosen position of a deep copy.
 *  One key, not several, so the reported path is unambiguous and a
 *  disagreement names the exact position that drifted. Returns null when the
 *  type offers no position at all (an atomic root, a bare Date, …). **/
export function plantUnknownKey(runType: RunType, value: unknown, rng: () => number): PlantedUnknownKey | null {
  const positions = collectUnknownKeyPositions(runType, value);
  if (positions.length === 0) return null;
  const position = positions[Math.floor(rng() * positions.length)];
  const copy = deepCopyValue(value);
  const target = atPath(copy, position.path);
  if (!isPlainRecordValue(target)) return null;
  const key = `${UNKNOWN_KEY_PREFIX}${Math.floor(rng() * 1000)}`;
  target[key] = 'fz';
  return {value: copy, key, path: [...position.path, key], kind: position.kind};
}

/** Follow a reported path through a value. Mirrors how a consumer reads an
 *  error path back: a Map / Set segment is the entry's iteration index. **/
export function atPath(root: unknown, path: readonly RTValidationErrorPathSegment[]): unknown {
  let cursor = root;
  for (const segment of path) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof segment === 'object') {
      const entries = cursor instanceof Map ? [...cursor] : cursor instanceof Set ? [...cursor] : undefined;
      if (!entries) return undefined;
      const entry = entries[segment.key];
      if (entry === undefined) return undefined;
      cursor =
        segment.failed === 'mapKey' ? (entry as unknown[])[0] : segment.failed === 'mapValue' ? (entry as unknown[])[1] : entry;
      continue;
    }
    cursor = (cursor as Record<string | number, unknown>)[segment];
  }
  return cursor;
}

/** A path rendered as one comparable string, so two sets of paths can be
 *  compared without a deep-equal walk. **/
export function pathKey(path: readonly RTValidationErrorPathSegment[]): string {
  return path
    .map((segment) => (typeof segment === 'object' ? `${segment.failed ?? 'entry'}[${segment.key}]` : String(segment)))
    .join('.');
}
