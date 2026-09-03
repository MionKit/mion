// JSON-tree attacks for the secjson lane: apply one dictionary entry at one
// position, or one blind mutation (a random junk subtree, the value lane's
// `randomJunk`) anywhere in the tree.
//
// Every attack yields the JSON TEXT the decoders read and the re-parsed tree
// `parse` reads, built from one `JSON.stringify` so both sides see the same
// bytes (and an own `__proto__` key survives as an own key on both).

import {applyMutation} from '../value/invalidValue.ts';
import {randomJunk} from '../value/fuzzRunner.ts';
import {attacksFor, type AttackEntry, type Expect, type JsonAttackCtx} from './attackDictionary.ts';
import type {Position} from './positions.ts';

export interface TreeAttack {
  /** Dictionary id, or `blind.<n>` for a random mutation. **/
  id: string;
  /** The attack class for the report. **/
  class: string;
  expect: Expect;
  path: Array<string | number>;
  /** JSON text as the decoders see it. **/
  text: string;
  /** `JSON.parse(text)`, as `parse` sees it. **/
  tree: unknown;
}

const bigintSafe = (_key: string, value: unknown): unknown => (typeof value === 'bigint' ? value.toString() : value);

/** Splice `payload` at `position` and serialise. Returns null when the payload
 *  cannot be represented as JSON text (a stray `undefined` root). **/
export function spliceAttack(tree: unknown, position: Position, entry: AttackEntry, rng: () => number): TreeAttack | null {
  const node = readPath(tree, position.path);
  const ctx: JsonAttackCtx = {rng, node, members: position.members, literal: position.literal, enumValues: position.enumValues};
  const payload = entry.json ? entry.json(ctx) : undefined;
  const mutated = applyMutation(tree, position.path, payload);
  const text = JSON.stringify(mutated, bigintSafe);
  if (text === undefined) return null;
  const expect: Expect = position.underCatchAll ? 'any' : entry.expect;
  return {id: entry.id, class: entry.class, expect, path: position.path, text, tree: JSON.parse(text)};
}

/** Every dictionary attack for one position. **/
export function dictionaryAttacks(tree: unknown, position: Position, rng: () => number): TreeAttack[] {
  const out: TreeAttack[] = [];
  for (const entry of attacksFor(position.kind)) {
    const attack = spliceAttack(tree, position, entry, rng);
    if (attack) out.push(attack);
  }
  return out;
}

/** One blind mutation: a random junk subtree at a random position. Draws from
 *  the global `Math.random` (wrap in `withSeededRandom`). **/
export function blindAttack(tree: unknown, positions: Position[], index: number): TreeAttack | null {
  if (positions.length === 0) return null;
  const position = positions[Math.floor(Math.random() * positions.length)];
  const mutated = applyMutation(tree, position.path, randomJunk(0));
  const text = JSON.stringify(mutated, bigintSafe);
  if (text === undefined) return null;
  return {id: `blind.${index}`, class: 'blind', expect: 'any', path: position.path, text, tree: JSON.parse(text)};
}

function readPath(tree: unknown, path: Array<string | number>): unknown {
  let cursor: unknown = tree;
  for (const step of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string | number, unknown>)[step];
  }
  return cursor;
}
