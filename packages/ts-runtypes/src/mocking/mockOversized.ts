// The `respectBinarySize: false` generator — make a value that EXCEEDS the
// binary cold-start estimate so a `dynamic` buffer must grow. The size
// counterpart of mockInvalid.ts: generate an in-bounds mock, co-walk the RunType
// alongside it, and inflate ONE unbounded position past its budget.
//
// Only an UNBOUNDED position can grow while staying valid — a `string` / `array`
// / `bigint` with no length-bounding format. A formatted node (maxLength /
// maxItems / fixed bigint width / uuid …) can't exceed its bound without becoming
// invalid, so it is never a target. `string` / `bigint` overshoots are guaranteed
// past the budget; an array-count overshoot is best-effort (an array of zero-byte
// elements may not), which the caller's size oracle confirms.

import {RunTypeKind} from '../go-generated/runTypeKind.generated.ts';
import type {RunType} from '../runtypes/types.ts';
import type {MockOptions, RunTypeMockOptions} from './mockTypes.ts';
import {nativeMockRandom} from './mockRandom.ts';
import type {MockRandom} from './mockRandom.ts';
import {mockRunType} from './mockType.ts';
import {randomAscii, resolveSizing} from './binarySize.ts';

const K = RunTypeKind;
const kindOf = (node: RunType): number => node.kind as number;

type TargetKind = 'string' | 'array' | 'bigint';

interface Target {
  kind: TargetKind;
  node: RunType;
  set: (value: unknown) => void;
}

function inflatableKind(node: RunType | undefined): TargetKind | null {
  if (!node || node.formatAnnotation) return null; // formatted -> possibly bounded/fixed, skip
  const kind = kindOf(node);
  if (kind === K.string || kind === K.templateLiteral) return 'string';
  if (kind === K.array) return 'array';
  if (kind === K.bigint) return 'bigint';
  return null;
}

function propChildNode(node: RunType | undefined, key: string): RunType | undefined {
  for (const member of node?.children ?? []) {
    if ((kindOf(member) === K.property || kindOf(member) === K.propertySignature) && member.name === key) return member.child;
  }
  return undefined;
}

function tupleMemberNode(node: RunType | undefined, index: number): RunType | undefined {
  const member = (node?.children ?? [])[index];
  return member?.child ?? member;
}

function isStructuralObject(kind: number): boolean {
  return kind === K.objectLiteral || kind === K.object || kind === K.intersection || kind === K.class;
}

// Co-walk node + value; `set` replaces the value at this position in its parent.
// Descends arrays / tuples / plain objects; union / Map / Set / record internals
// are not descended (their element node isn't 1:1 with the value position).
function collect(node: RunType | undefined, value: unknown, set: (v: unknown) => void, out: Target[]): void {
  const kind = inflatableKind(node);
  if (kind) out.push({kind, node: node as RunType, set});
  if (!node) return;
  const nodeKind = kindOf(node);
  if (nodeKind === K.array && Array.isArray(value)) {
    value.forEach((element, i) => collect(node.child, element, (r) => ((value as unknown[])[i] = r), out));
  } else if (nodeKind === K.tuple && Array.isArray(value)) {
    (node.children ?? []).forEach((_member, i) =>
      collect(tupleMemberNode(node, i), (value as unknown[])[i], (r) => ((value as unknown[])[i] = r), out)
    );
  } else if (isStructuralObject(nodeKind) && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      collect(propChildNode(node, key), obj[key], (r) => (obj[key] = r), out);
    }
  }
}

function bigOverBudget(random: MockRandom): bigint {
  const digits = 28 + Math.floor(random.float() * 12); // well past the 20-digit budget
  let mag = 9n; // leading non-zero
  for (let i = 1; i < digits; i++) mag = mag * 10n + BigInt(Math.floor(random.float() * 10));
  return random.float() < 0.5 ? mag : -mag;
}

function inflate(target: Target, mock: MockOptions, options: RunTypeMockOptions, random: MockRandom): void {
  const {items, stringBytes} = resolveSizing(mock.binarySizingOptions);
  if (target.kind === 'string') {
    target.set(randomAscii(stringBytes * 2 + 1 + Math.floor(random.float() * stringBytes * 2), random));
  } else if (target.kind === 'bigint') {
    target.set(bigOverBudget(random));
  } else {
    const count = items + 1 + Math.floor(random.float() * Math.max(1, items));
    const child = target.node.child;
    const arr: unknown[] = [];
    for (let i = 0; i < count; i++) arr.push(child ? mockRunType(child, options, []) : null);
    target.set(arr);
  }
}

/** Generate an in-bounds mock (options already steered by applyInBoundsSizing),
 *  then inflate ONE unbounded position past the estimate. Returns the plain
 *  in-bounds value when the type has no inflatable position. **/
export function mockRunTypeOversized(runType: RunType, options: RunTypeMockOptions, stack: RunType[] = []): unknown {
  const mock = options.mock as MockOptions;
  const random = mock.random ?? nativeMockRandom;
  const holder = {root: mockRunType(runType, options, stack)};
  const targets: Target[] = [];
  collect(runType, holder.root, (v) => (holder.root = v), targets);
  if (targets.length === 0) return holder.root;
  // Prefer a guaranteed overshoot (string / bigint) over a best-effort array.
  const guaranteed = targets.filter((t) => t.kind !== 'array');
  const pool = guaranteed.length ? guaranteed : targets;
  inflate(pool[random.int(0, pool.length - 1)], mock, options, random);
  return holder.root;
}
