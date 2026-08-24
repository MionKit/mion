// Hardened distribution test for `invalidLeafProbability`. The `invalid` mock
// corrupts exactly ONE position of a value; `invalidLeafProbability` (p) is meant
// to bias WHERE that break lands along the root→leaf axis while still being able
// to hit ANY node on ANY branch in between. The old logic could only ever hit a
// leaf OR the whole root (intermediate nodes were collected then discarded), so
// this suite pins the fixed behaviour:
//   • every depth — root, intermediate containers, and leaves — is reachable;
//   • the depth distribution tracks p (documented level-weight contract);
//   • p = 0 always hits the root, p = 1 always hits a leaf;
//   • the mean corruption depth rises monotonically with p across the interior.
//
// It drives the selection directly (`collectInvalidTargets` + `chooseInvalidTarget`)
// over a rich hand-built Model so the distribution can be measured without a
// validator, plus an end-to-end pass over `mockRunTypeInvalid` proving intermediate
// containers really are replaced in the produced value.

import {describe, it, expect} from 'vitest';
import {mockRunTypeInvalid, collectInvalidTargets, chooseInvalidTarget, type Target} from '../../../src/mocking/mockInvalid.ts';
import {mockRunType} from '../../../src/mocking/mockType.ts';
import {defaultMockOptions} from '../../../src/mocking/constants.mock.ts';
import type {RunTypeMockOptions, MockOptions} from '../../../src/mocking/mockTypes.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';

const K = RunTypeKind;

let nextId = 0;
const rt = (node: Partial<RunType>): RunType => ({id: `rt${nextId++}`, ...node}) as RunType;

// ── Graph builders ──────────────────────────────────────────────────────────
const str = (): RunType => rt({kind: K.string});
const num = (): RunType => rt({kind: K.number});
const bool = (): RunType => rt({kind: K.boolean});
const objectOf = (children: RunType[]): RunType => rt({kind: K.objectLiteral, children});
const prop = (name: string, child: RunType): RunType => rt({kind: K.propertySignature, name, child});
const arrayOf = (child: RunType): RunType => rt({kind: K.array, child});
const tupleOf = (children: RunType[]): RunType =>
  rt({kind: K.tuple, children: children.map((child) => rt({kind: K.tupleMember, child}))});
const unionOf = (children: RunType[]): RunType => rt({kind: K.union, children});
const literal = (value: unknown): RunType => rt({kind: K.literal, literal: value});
const dateType = (): RunType => rt({kind: K.class, subKind: RunTypeSubKind.date});
const mapType = (key: RunType, value: RunType): RunType =>
  rt({
    kind: K.class,
    subKind: RunTypeSubKind.map,
    arguments: [rt({kind: K.parameter, child: key}), rt({kind: K.parameter, child: value})],
  });
const setType = (element: RunType): RunType =>
  rt({kind: K.class, subKind: RunTypeSubKind.set, arguments: [rt({kind: K.parameter, child: element})]});

// A deep, mixed Model: primitives, a literal union, Date / Map / Set opaque
// leaves, arrays, a tuple, and nested objects three levels down. The value it
// mocks has positions at depths 0 (root) through 4, so the depth bias has real
// range to move across.
const Model = objectOf([
  prop('id', str()),
  prop('age', num()),
  prop('active', bool()),
  prop('status', unionOf([literal('active'), literal('inactive'), literal('pending')])),
  prop('createdAt', dateType()),
  prop('tags', arrayOf(str())),
  prop('scores', arrayOf(num())),
  prop('coords', tupleOf([num(), num()])),
  prop('metadata', mapType(str(), num())),
  prop('roles', setType(str())),
  prop(
    'address',
    objectOf([prop('street', str()), prop('city', str()), prop('geo', objectOf([prop('lat', num()), prop('lng', num())]))])
  ),
  prop('profile', objectOf([prop('settings', objectOf([prop('theme', objectOf([prop('name', str()), prop('dark', bool())]))]))])),
]);

// Fixed-structure options: arrays / maps / sets get a constant length and every
// optional is included, so the mocked value (and thus the target set) has the
// same shape every time — a stable base for measuring the selection distribution.
function stableOptions(): RunTypeMockOptions {
  const mock: MockOptions = {...defaultMockOptions, arrayLength: 2, optionalProbability: 1};
  return {mock};
}

// Category of a chosen target, for bucketing the distribution.
type Category = 'root' | 'intermediate' | 'leaf';
function categoryOf(target: Target): Category {
  if (target.parent === undefined) return 'root';
  return target.isLeaf ? 'leaf' : 'intermediate';
}

// Sample `chooseInvalidTarget` `n` times over a fixed target set and tally the
// chosen depth + category.
function sample(targets: Target[], p: number, n: number) {
  const byDepth = new Map<number, number>();
  const byCategory: Record<Category, number> = {root: 0, intermediate: 0, leaf: 0};
  let depthSum = 0;
  for (let i = 0; i < n; i++) {
    const chosen = chooseInvalidTarget(targets, p);
    if (!chosen) throw new Error('expected a target');
    byDepth.set(chosen.depth, (byDepth.get(chosen.depth) ?? 0) + 1);
    byCategory[categoryOf(chosen)]++;
    depthSum += chosen.depth;
  }
  return {byDepth, byCategory, meanDepth: depthSum / n, n};
}

// The documented level-weight contract, re-expressed here so the observed depth
// distribution can be checked against the probability setting: within (0,1) each
// depth LEVEL present in the value is weighted by a linear interpolation between
// "favour the root" (p→0) and "favour the leaves" (p→1), and a position is drawn
// uniformly within the chosen level. Returns the expected P(depth) map.
function expectedDepthDistribution(levels: number[], p: number): Map<number, number> {
  const maxDepth = Math.max(...levels);
  const weight = (depth: number) => (1 - p) * (1 - depth / maxDepth) + p * (depth / maxDepth);
  const total = levels.reduce((sum, depth) => sum + weight(depth), 0);
  return new Map(levels.map((depth) => [depth, weight(depth) / total]));
}

const N = 40000;

describe('invalidLeafProbability — target collection', () => {
  const base = mockRunType(Model, stableOptions()) as Record<string, unknown>;
  const targets = collectInvalidTargets(base, Model);
  const depths = [...new Set(targets.map((target) => target.depth))].sort((a, b) => a - b);
  const maxDepth = Math.max(...depths);

  it('collects every position — root, intermediate containers, and leaves — across all depths', () => {
    // Contiguous depths 0..maxDepth with real range, so the bias has somewhere to move.
    expect(maxDepth).toBeGreaterThanOrEqual(4);
    expect(depths).toEqual(Array.from({length: maxDepth + 1}, (_unused, depth) => depth));

    const roots = targets.filter((target) => target.parent === undefined);
    const intermediates = targets.filter((target) => target.parent !== undefined && !target.isLeaf);
    const leaves = targets.filter((target) => target.isLeaf);
    expect(roots).toHaveLength(1);
    expect(roots[0].depth).toBe(0);
    // Intermediate containers exist at more than one depth (nested objects/arrays).
    expect(intermediates.length).toBeGreaterThanOrEqual(5);
    expect(new Set(intermediates.map((target) => target.depth)).size).toBeGreaterThanOrEqual(2);
    // Leaves reach the deepest level.
    expect(leaves.some((target) => target.depth === maxDepth)).toBe(true);
  });
});

describe('invalidLeafProbability — crisp endpoints', () => {
  const base = mockRunType(Model, stableOptions()) as Record<string, unknown>;
  const targets = collectInvalidTargets(base, Model);

  it('p = 0 always corrupts the root (whole value replaced)', () => {
    const {byCategory} = sample(targets, 0, 2000);
    expect(byCategory.root).toBe(2000);
    expect(byCategory.intermediate).toBe(0);
    expect(byCategory.leaf).toBe(0);
  });

  it('p = 1 always corrupts a leaf (root and intermediate nodes survive)', () => {
    const {byCategory} = sample(targets, 1, 2000);
    expect(byCategory.leaf).toBe(2000);
    expect(byCategory.root).toBe(0);
    expect(byCategory.intermediate).toBe(0);
  });
});

describe('invalidLeafProbability — depth distribution tracks p', () => {
  const base = mockRunType(Model, stableOptions()) as Record<string, unknown>;
  const targets = collectInvalidTargets(base, Model);
  const levels = [...new Set(targets.map((target) => target.depth))].sort((a, b) => a - b);

  for (const p of [0.25, 0.5, 0.75]) {
    it(`p = ${p}: observed depth distribution matches the documented level-weight contract`, () => {
      const {byDepth, n} = sample(targets, p, N);
      const expected = expectedDepthDistribution(levels, p);
      for (const depth of levels) {
        const observed = (byDepth.get(depth) ?? 0) / n;
        // Generous tolerance: with N = 40000 the sampling error per bucket is well
        // under 0.01, so 0.04 comfortably absorbs Math.random non-ideality.
        expect(Math.abs(observed - (expected.get(depth) as number))).toBeLessThan(0.04);
      }
    });
  }

  it('every depth level is reachable at p = 0.5 (no branch is left out)', () => {
    const {byDepth} = sample(targets, 0.5, N);
    for (const depth of levels) expect(byDepth.get(depth) ?? 0).toBeGreaterThan(0);
  });

  it('intermediate containers are corrupted a meaningful fraction of the time at p = 0.5', () => {
    const {byCategory, n} = sample(targets, 0.5, N);
    // This is the crux of the fix: pre-fix this fraction was exactly 0.
    expect(byCategory.intermediate / n).toBeGreaterThan(0.1);
    expect(byCategory.root / n).toBeGreaterThan(0.05);
    expect(byCategory.leaf / n).toBeGreaterThan(0.3);
  });

  it('mean corruption depth rises monotonically with p across the interior', () => {
    const means = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => sample(targets, p, N).meanDepth);
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThan(means[i - 1]);
  });

  it('P(root) falls and P(leaf) rises as p increases', () => {
    const stats = [0.2, 0.5, 0.8].map((p) => {
      const {byCategory, n} = sample(targets, p, N);
      return {rootFreq: byCategory.root / n, leafFreq: byCategory.leaf / n};
    });
    expect(stats[0].rootFreq).toBeGreaterThan(stats[1].rootFreq);
    expect(stats[1].rootFreq).toBeGreaterThan(stats[2].rootFreq);
    expect(stats[0].leafFreq).toBeLessThan(stats[1].leafFreq);
    expect(stats[1].leafFreq).toBeLessThan(stats[2].leafFreq);
  });
});

describe('invalidLeafProbability — end-to-end corruption reaches intermediate nodes', () => {
  // Prove the whole pipeline (not just selection) can replace an intermediate
  // container. At a mid probability, over many runs, `address` / `address.geo` /
  // `profile` land as a non-object some of the time, alongside root and leaf hits.
  function run(p: number, runs: number) {
    let rootReplaced = 0;
    let intermediateReplaced = 0;
    let leafOnly = 0;
    for (let i = 0; i < runs; i++) {
      const options: RunTypeMockOptions = {
        mock: {...defaultMockOptions, arrayLength: 2, optionalProbability: 1, invalid: true, invalidLeafProbability: p},
      };
      const value = mockRunTypeInvalid(Model, options) as Record<string, unknown>;
      if (typeof value !== 'object' || value === null) {
        rootReplaced++;
        continue;
      }
      const address = value.address as Record<string, unknown> | undefined;
      const profile = value.profile;
      const geoBad = address !== undefined && typeof address === 'object' && typeof address.geo !== 'object';
      const addressBad = typeof address !== 'object' || address === null;
      const profileBad = typeof profile !== 'object' || profile === null;
      if (addressBad || profileBad || geoBad) intermediateReplaced++;
      else leafOnly++;
    }
    return {rootReplaced, intermediateReplaced, leafOnly};
  }

  it('p = 0.5 produces root, intermediate, and leaf corruptions', () => {
    const {rootReplaced, intermediateReplaced, leafOnly} = run(0.5, 3000);
    expect(rootReplaced).toBeGreaterThan(0);
    expect(intermediateReplaced).toBeGreaterThan(0);
    expect(leafOnly).toBeGreaterThan(0);
  });

  it('a corrupted intermediate object is a value validate<T> would reject', () => {
    // Force intermediate hits by focusing p in the mid range and asserting the
    // replaced container is no longer an object (so validate<T> fails on it).
    let sawIntermediate = false;
    for (let i = 0; i < 4000 && !sawIntermediate; i++) {
      const options: RunTypeMockOptions = {
        mock: {...defaultMockOptions, arrayLength: 2, optionalProbability: 1, invalid: true, invalidLeafProbability: 0.5},
      };
      const value = mockRunTypeInvalid(Model, options) as Record<string, unknown>;
      if (typeof value !== 'object' || value === null) continue;
      const address = value.address;
      if (typeof address !== 'object' || address === null) {
        sawIntermediate = true;
        expect(typeof address).not.toBe('object');
      }
    }
    expect(sawIntermediate).toBe(true);
  });
});
