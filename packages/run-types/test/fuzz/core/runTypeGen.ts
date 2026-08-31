// Random RunType-graph generator for binary-free fuzzing.
//
// Unlike `core/typeGen.ts` (which emits TypeScript SOURCE that the Go binary
// compiles into runtypes via the real type→runtype projection), this builds
// `RunType` graphs DIRECTLY, so a fuzzer can exercise the runtime walkers (mock,
// …) in the UNIT lane with no binary. Like typeGen it draws from the global
// `Math.random`, so wrapping a run in `withSeededRandom(seed, …)` (seededRng.ts)
// replays it byte-for-byte.
//
// DELIBERATELY NARROW — and NOT a hand-built twin of the resolver's projection.
// It covers the serialisable-data shapes only: object / array / tuple /
// discriminated union / index-signature record, over number / string / bigint /
// boolean / literal / Date / uuid. For the FULL shape space (map / set / promise
// / class / enum / intersection / recursive / formats / non-data), emit SOURCE
// with `typeGen.ts` and compile it through the binary (`typeFuzzHarness.ts`) —
// that path runs the REAL projection, so its runtypes match production exactly.
// Reproducing that fidelity by hand here would just fork the resolver. Symbols
// and Temporal are excluded on purpose so generated values stay
// deep-equal-comparable.

import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';

/** Tuning knobs for `randomRunType` (mirrors typeGen's `GenOptions` shape). **/
export interface RunTypeGenOptions {
  /** Emit only leaves at or beyond this nesting depth (bounds the graph). **/
  maxDepth: number;
  /** Probability (0..1) of stopping at a leaf at each level below `maxDepth`. **/
  leafBias: number;
}

export const DEFAULT_RUNTYPE_GEN_OPTIONS: RunTypeGenOptions = {maxDepth: 3, leafBias: 0.45};

const rnd = (): number => Math.random();
const upTo = (n: number): number => Math.floor(rnd() * n);

let nextId = 0;
function rt(node: Partial<RunType>): RunType {
  return {id: `rt${nextId++}`, ...node} as RunType;
}

// Leaf runtypes over the serialisable-data space (no symbol / Temporal).
const LEAVES: Array<() => RunType> = [
  () => rt({kind: RunTypeKind.string}),
  () => rt({kind: RunTypeKind.number}),
  () => rt({kind: RunTypeKind.bigint}),
  () => rt({kind: RunTypeKind.boolean}),
  () => rt({kind: RunTypeKind.literal, literal: (['a', 1, true, 'kind'] as unknown[])[upTo(4)]}),
  () => rt({kind: RunTypeKind.class, subKind: RunTypeSubKind.date}),
  () => rt({kind: RunTypeKind.string, formatAnnotation: {name: 'uuid', params: {version: '4'}}}),
  () => rt({kind: RunTypeKind.string, formatAnnotation: {name: 'uuid', params: {version: '7'}}}),
];

const FIELD_NAMES = ['a', 'b', 'c', 'd', 'e', 'f'];

/** A random data runtype, depth-bounded. Composers: object, array, tuple,
 *  discriminated union, and index signature (record). Draws from the global
 *  `Math.random`; wrap in `withSeededRandom` to replay. **/
export function randomRunType(depth: number, opts: RunTypeGenOptions = DEFAULT_RUNTYPE_GEN_OPTIONS): RunType {
  if (depth >= opts.maxDepth || rnd() < opts.leafBias) return LEAVES[upTo(LEAVES.length)]();
  switch (upTo(5)) {
    case 0: {
      const count = 1 + upTo(4);
      const children: RunType[] = [];
      for (let i = 0; i < count; i++) {
        children.push(
          rt({
            kind: RunTypeKind.propertySignature,
            name: FIELD_NAMES[i],
            child: randomRunType(depth + 1, opts),
            optional: rnd() < 0.3,
          })
        );
      }
      return rt({kind: RunTypeKind.objectLiteral, children});
    }
    case 1:
      return rt({kind: RunTypeKind.array, child: randomRunType(depth + 1, opts)});
    case 2: {
      const count = 1 + upTo(3);
      const children: RunType[] = [];
      for (let i = 0; i < count; i++) children.push(rt({kind: RunTypeKind.tupleMember, child: randomRunType(depth + 1, opts)}));
      return rt({kind: RunTypeKind.tuple, children});
    }
    case 3: {
      // Discriminated union: each member is an object with a distinct `kind`
      // literal plus one payload field.
      const count = 2 + upTo(3);
      const members: RunType[] = [];
      for (let i = 0; i < count; i++) {
        members.push(
          rt({
            kind: RunTypeKind.objectLiteral,
            children: [
              rt({kind: RunTypeKind.propertySignature, name: 'kind', child: rt({kind: RunTypeKind.literal, literal: `k${i}`})}),
              rt({kind: RunTypeKind.propertySignature, name: 'payload', child: randomRunType(depth + 1, opts)}),
            ],
          })
        );
      }
      return rt({kind: RunTypeKind.union, children: members});
    }
    default:
      return rt({
        kind: RunTypeKind.indexSignature,
        index: rt({kind: rnd() < 0.5 ? RunTypeKind.string : RunTypeKind.number}),
        child: randomRunType(depth + 1, opts),
      });
  }
}
