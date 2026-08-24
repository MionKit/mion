// Negative ("invalid") mock generation — the `invalid` mock option. Generates a
// normal valid mock, then walks the RunType graph alongside that value and
// replaces ONE position with a value the type rejects: the inverse of what the
// mock would produce there (a number for a string, a value outside a union, a
// non-string for a regexp / formatted string, an object where a primitive is
// required, …).
//
// `invalidLeafProbability` biases the DEPTH at which the break lands. Every
// position is a candidate — the root, any intermediate object / array on any
// branch, and every leaf — each tagged with its depth (root = 0, deeper = more).
// The probability slides the corruption along that root→leaf axis: `1` corrupts a
// (deep) leaf, `0` replaces the whole root, and values in between spread the break
// across all depths (a mid value can land on an intermediate node, e.g. replace a
// whole nested object with a non-object). This is the fix for the old behaviour,
// which only ever hit a leaf OR the root and never a node in between.
//
// Type-accurate by construction (it reads each node's kind / literal / union
// members), so the corrupted position fails `validate<T>` without needing to run
// the validator. The only positions it cannot make invalid are `any` / `unknown`
// (nothing fails them); those are dropped from the candidate set so the break
// always lands on a position that can actually be made invalid.

import {RunTypeKind} from '../go-generated/runTypeKind.generated.ts';
import type {RunType} from '../runtypes/types.ts';
import type {MockOptions, RunTypeMockOptions} from './mockTypes.ts';
import {nativeMockRandom} from './mockRandom.ts';
import type {MockRandom} from './mockRandom.ts';
import {mockRunType} from './mockType.ts';

const K = RunTypeKind;

const kindOf = (node: RunType): number => node.kind as number;

// A corruptible position in the mocked value. `parent`/`key` are undefined for
// the root (it has no container to mutate — corrupting it replaces the value
// wholesale). `depth` is the value-nesting level (root = 0), used to bias WHERE
// the break lands. `isLeaf` is true for a non-descended position (a primitive, or
// an opaque native like Date / Map / Set / RegExp / typed array).
export interface Target {
  parent: Record<string | number, unknown> | undefined;
  key: string | number | undefined;
  node: RunType | undefined;
  value: unknown;
  depth: number;
  isLeaf: boolean;
}

// Containers we recurse into. Date / typed arrays / Map / Set / RegExp are opaque
// leaves (corrupted whole, never descended); plain objects and arrays descend.
function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return true;
  return !(
    value instanceof Date ||
    value instanceof Uint8Array ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof RegExp
  );
}

// Does `node` accept a value of `candidate`'s runtime shape? Used both to pick the
// in-play arm of a union (for descent) and to find a type no union member accepts.
function kindMatchesValue(node: RunType, candidate: unknown): boolean {
  switch (kindOf(node)) {
    case K.string:
    case K.regexp:
    case K.templateLiteral:
      return typeof candidate === 'string';
    case K.number:
      return typeof candidate === 'number';
    case K.bigint:
      return typeof candidate === 'bigint';
    case K.boolean:
      return typeof candidate === 'boolean';
    case K.literal:
      return candidate === node.literal;
    case K.null:
      return candidate === null;
    case K.undefined:
    case K.void:
      return candidate === undefined;
    case K.array:
    case K.tuple:
      return Array.isArray(candidate);
    case K.object:
    case K.objectLiteral:
    case K.intersection:
    case K.class:
      return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
    case K.enum:
      return true;
    default:
      return false;
  }
}

// Resolve a union to the member matching `value` (best effort) so descent finds
// the right children; pass other kinds through unchanged.
function memberForValue(node: RunType | undefined, value: unknown): RunType | undefined {
  if (!node || kindOf(node) !== K.union) return node;
  const members = (node.children ?? []).filter((member) => !member.notSupported);
  return members.find((member) => kindMatchesValue(member, value)) ?? members[0] ?? node;
}

// The node describing `obj[key]`, walking object / intersection members (and
// falling back to an index signature). Undefined when not found.
function propChildNode(node: RunType | undefined, key: string | number): RunType | undefined {
  const children = node?.children ?? [];
  for (const member of children) {
    if ((kindOf(member) === K.property || kindOf(member) === K.propertySignature) && member.name === String(key)) {
      return member.child;
    }
  }
  for (const member of children) {
    if (kindOf(member) === K.indexSignature) return member.child;
  }
  return undefined;
}

// The node describing element `i` of an array / tuple value.
function elemNodeAt(node: RunType | undefined, i: number): RunType | undefined {
  if (!node) return undefined;
  if (kindOf(node) === K.tuple) {
    const member = (node.children ?? [])[i];
    return member?.child ?? member;
  }
  return node.child;
}

// A runtime-type inverse used when no graph node is available: a value whose
// typeof differs from `value`'s.
function typeofInverse(value: unknown): unknown {
  if (typeof value === 'string') return 123;
  if (typeof value === 'number' || typeof value === 'bigint') return 'not-a-number';
  if (typeof value === 'boolean') return 'not-a-boolean';
  if (value === null || value === undefined) return 'unexpected';
  if (Array.isArray(value)) return 'not-an-array';
  return 'not-an-object';
}

// Candidate values spanning the runtime types; negativeForUnion returns the first
// one no member of the union accepts.
const UNION_CANDIDATES: readonly unknown[] = ['rt-invalid', 1234.5, true, {rtInvalid: true}, [], null];

// A value outside the whole union (rejected by every member). Falls back to a
// runtime-type inverse for a union that somehow accepts all candidate shapes.
function negativeForUnion(members: RunType[], value: unknown): unknown {
  const live = members.filter((member) => !member.notSupported);
  for (const candidate of UNION_CANDIDATES) {
    if (!live.some((member) => kindMatchesValue(member, candidate))) return candidate;
  }
  return typeofInverse(value);
}

// A value != `lit` and of a different type, so a literal node rejects it.
function literalInverse(lit: unknown): unknown {
  if (typeof lit === 'string') return 1;
  return 'not-the-literal';
}

// negativeFor produces a value that should FAIL validation for `node` — the
// per-kind switch. Falls back to a runtime-type inverse for kinds with no
// specific rule (or a missing node).
export function negativeFor(node: RunType | undefined, value: unknown): unknown {
  if (!node) return typeofInverse(value);
  const kind = kindOf(node);
  if (kind === K.union) return negativeForUnion(node.children ?? [], value);
  switch (kind) {
    case K.string:
    case K.regexp:
    case K.templateLiteral:
    case K.symbol:
      return 123; // not a string
    case K.number:
    case K.bigint:
      return 'not-a-number';
    case K.boolean:
      return 'not-a-boolean';
    case K.literal:
      return literalInverse(node.literal);
    case K.enum:
      return {}; // not a valid enum primitive
    case K.null:
      return 'not-null';
    case K.undefined:
    case K.void:
      return 'should-be-undefined';
    case K.object:
    case K.objectLiteral:
    case K.intersection:
    case K.class:
      return 'not-an-object';
    case K.array:
    case K.tuple:
      return 'not-an-array';
    case K.any:
    case K.unknown:
      return value; // nothing fails `any` — leave it; the break lands elsewhere
    default:
      return typeofInverse(value);
  }
}

// Co-walk `value` with its node, recording EVERY position (the root, every
// intermediate container, and every leaf) as a corruption target tagged with its
// depth. Each target keeps its ORIGINAL node (which may be a union) so negativeFor
// can pick a value outside it. Containers are descended with their union-resolved
// node so children map to the in-play arm.
function collect(
  value: unknown,
  node: RunType | undefined,
  parent: Record<string | number, unknown> | undefined,
  key: string | number | undefined,
  depth: number,
  out: Target[]
): void {
  const leaf = !isContainer(value);
  out.push({parent, key, node, value, depth, isLeaf: leaf});
  if (leaf) return;
  const resolved = memberForValue(node, value);
  if (Array.isArray(value)) {
    const arr = value as unknown as Record<string | number, unknown>;
    value.forEach((child, index) => collect(child, elemNodeAt(resolved, index), arr, index, depth + 1, out));
    return;
  }
  const container = value as Record<string, unknown>;
  for (const childKey of Object.keys(container)) {
    collect(container[childKey], propChildNode(resolved, childKey), container, childKey, depth + 1, out);
  }
}

// collectInvalidTargets walks the mocked value and returns every position that
// could be corrupted, rooted at depth 0. Exposed for tests that assert the
// selection distribution over depths (see mockInvalidDistribution.test.ts).
export function collectInvalidTargets(root: unknown, rootNode: RunType | undefined): Target[] {
  const out: Target[] = [];
  collect(root, rootNode, undefined, undefined, 0, out);
  return out;
}

// A position is corruptible unless its node is `any` / `unknown` — nothing fails
// those, so negativeFor would return the value unchanged and the "invalid" mock
// would actually validate. A missing node falls back to a runtime-type inverse,
// which always corrupts, so it counts as corruptible.
function canCorrupt(target: Target): boolean {
  if (!target.node) return true;
  const kind = kindOf(target.node);
  return kind !== K.any && kind !== K.unknown;
}

// The per-level selection weight at normalized depth `nd` (0 = root, 1 = deepest)
// for probability `p`: a linear interpolation between "favour the root" (p→0) and
// "favour the leaves" (p→1). At p = 0.5 every depth is equally likely.
function levelWeight(nd: number, p: number): number {
  return (1 - p) * (1 - nd) + p * nd;
}

// chooseInvalidTarget picks ONE position to corrupt from `targets`, biased by
// depth via `invalidLeafProbability` (p). It does NOT mutate — it only selects,
// so tests can sample the distribution. Selection:
//   • p >= 1  → a uniformly random leaf (the root and intermediate nodes survive);
//   • p <= 0  → the root (the whole value is replaced);
//   • 0 < p < 1 → every corruptible position is in play, weighted by depth so the
//     break slides from the root (low p) to the leaves (high p) and can land on
//     any intermediate node in between. Each depth LEVEL is weighted by
//     `levelWeight`, then a position is drawn uniformly within the chosen level,
//     so the depth distribution is independent of a level's branching factor.
// Returns undefined only when nothing is corruptible (e.g. an `any` root).
export function chooseInvalidTarget(
  targets: Target[],
  invalidLeafProbability: number,
  random: MockRandom = nativeMockRandom
): Target | undefined {
  const corruptible = targets.filter(canCorrupt);
  if (corruptible.length === 0) return undefined;
  const root = corruptible.find((target) => target.parent === undefined);

  if (invalidLeafProbability >= 1) {
    const leaves = corruptible.filter((target) => target.isLeaf);
    if (leaves.length > 0) return leaves[random.int(0, leaves.length - 1)];
    return root ?? corruptible[0];
  }
  if (invalidLeafProbability <= 0) return root ?? corruptible[0];

  const maxDepth = corruptible.reduce((max, target) => Math.max(max, target.depth), 0);
  if (maxDepth === 0) return root ?? corruptible[0];

  const countAtDepth = new Map<number, number>();
  for (const target of corruptible) countAtDepth.set(target.depth, (countAtDepth.get(target.depth) ?? 0) + 1);

  // Weight each target by its level weight spread evenly across that level, so the
  // total weight of a level is `levelWeight` regardless of how many nodes it holds.
  const weights = corruptible.map(
    (target) => levelWeight(target.depth / maxDepth, invalidLeafProbability) / (countAtDepth.get(target.depth) as number)
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random.float() * total;
  for (let i = 0; i < corruptible.length; i++) {
    roll -= weights[i];
    if (roll < 0) return corruptible[i];
  }
  return corruptible[corruptible.length - 1];
}

// injectInvalid corrupts ONE position of `root` so the value fails validation:
// it collects every corruptible position, picks one biased by
// `invalidLeafProbability` (see chooseInvalidTarget), and replaces it with a
// type-aware wrong value. Corrupting the root replaces the whole value (returned);
// corrupting any other position mutates its parent in place. When nothing is
// corruptible it falls back to replacing the root wholesale.
function injectInvalid(
  root: unknown,
  rootNode: RunType | undefined,
  invalidLeafProbability: number,
  random: MockRandom
): unknown {
  const targets = collectInvalidTargets(root, rootNode);
  const chosen = chooseInvalidTarget(targets, invalidLeafProbability, random);
  if (!chosen || chosen.parent === undefined) return negativeFor(rootNode, root);
  chosen.parent[chosen.key as string | number] = negativeFor(chosen.node, chosen.value);
  return root;
}

// mockRunTypeInvalid is the `invalid` counterpart of mockRunType: a fresh valid
// mock with one type-aware position corrupted (see injectInvalid).
export function mockRunTypeInvalid(runType: RunType, options: RunTypeMockOptions, stack: RunType[] = []): unknown {
  const base = mockRunType(runType, options, stack);
  const mockOptions = options.mock as MockOptions;
  const random = mockOptions.random ?? nativeMockRandom;
  return injectInvalid(base, runType, mockOptions.invalidLeafProbability ?? 0.85, random);
}
