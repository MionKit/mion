// Public types for the mock-value generator. Surface mirrors the
// `MockOptions` shape. `createMockDataFn<T>()` merges caller options over
// `defaultMockOptions` before walking the runtype graph.

import type {MockData} from '../enrich/mockData.ts';
import type {MockRandom} from './mockRandom.ts';

/** Per-call options steering atomic-value generation and optional/recursive
 *  shape handling. Ported field-for-field from the reference implementation. **/
export interface MockOptions {
  /** Pool for `any` / `unknown` kinds. **/
  anyValuesList: unknown[];
  /** Inclusive bounds for `mockNumber` / `mockBigInt`. **/
  minNumber?: number;
  maxNumber?: number;
  /** Inclusive timestamp bounds for `mockDate`. **/
  minDate?: number | Date;
  maxDate?: number | Date;
  /** Force a specific enum branch. **/
  enumIndex?: number;
  /** Pool for the `object` kind. **/
  objectList: object[];
  /** Promise resolution delay (ms). 0 = synchronous (microtask). **/
  promiseTimeOut: number;
  /** When set the mocked Promise rejects with this value. **/
  promiseReject?: unknown;
  /** Pool for the `regexp` kind. **/
  regexpList: RegExp[];
  /** Upper bound used when `stringLength` is omitted. **/
  maxRandomStringLength: number;
  /** Force a specific string length. **/
  stringLength?: number;
  /** Character set used by `mockString`. **/
  stringCharSet: string;
  symbolLength?: number;
  symbolCharSet?: string;
  symbolName?: string;
  /** Upper bound for array / Map / Set / indexSignature sizes. **/
  maxRandomItemsLength: number;
  /** Force a specific length. **/
  arrayLength?: number;
  /** Probability (0..1) that an optional is included. Decays by depth. **/
  optionalProbability: number;
  /** Per-property override of `optionalProbability`. **/
  optionalPropertyProbability?: Record<string | number, number>;
  /** Pre-built object the walker mutates for cyclic-shape parents.
   *  The decay helper clears this on each recursion. **/
  parentObj?: Record<string | number | symbol, unknown>;
  /** Force a specific union branch. **/
  unionIndex?: number;
  tupleOptions?: MockOptions[];
  paramsOptions?: MockOptions[];
  /** Informational only — `maxMockRecursion` decay handles the practical case. **/
  maxStackDepth: number;
  /** Cap on stack re-entry count before mocking bails to `undefined`.
   *  Combined with the probability decay this guarantees termination. **/
  maxMockRecursion: number;
  /** Generate values for the DataOnly-stripped kinds — functions / methods /
   *  call signatures and the non-serialisable natives (`ArrayBuffer` /
   *  `SharedArrayBuffer` / typed arrays / `DataView`) — instead of skipping or
   *  throwing on them. Off by default (a mock is a DataOnly-shaped value); on,
   *  the mock also carries the non-data members, which is what exercises the
   *  serializers' drop / fail behaviour. **/
  nonDataTypes?: boolean;
  /** Generate a value that FAILS `validate<T>` instead of a valid one: a normal
   *  mock with ONE position replaced by a value of the wrong type (the inverse of
   *  what the type expects there — a number where a string is required, a value
   *  outside a union, a non-string for a regexp / formatted string, …). Handy for
   *  exercising validators, decoders and error paths in tests. Off by default. **/
  invalid?: boolean;
  /** When `invalid` is on, biases the DEPTH at which the wrong value lands
   *  (0..1) along the root→leaf axis. Every position is a candidate — the root,
   *  any intermediate object / array on any branch, and every leaf: `1` corrupts a
   *  leaf (a single primitive, the root and nested containers stay intact), `0`
   *  replaces the whole root, and values in between spread the break across all
   *  depths (a mid value can replace a whole nested object with a non-object).
   *  Default `0.85`, so the break is usually a deep field rather than the whole
   *  value. **/
  invalidLeafProbability?: number;
  /** Steer generation against the binary cold-start size estimate (see
   *  `createBinaryEncoderFn`'s `dynamic` strategy):
   *    - `true`  — the value fits the COLD BUFFER, so encoding it never resizes.
   *      Bounds target the per-write reserve (a string reserves `5 + 3*length`),
   *      not the wire size: collections capped at `sizeItems`, strings short
   *      enough that their reserve fits `sizeStringBytes`, bigints small, optionals
   *      omitted below bias 1, ASCII charset.
   *    - `false` — the value EXCEEDS the estimate: one unbounded position
   *      (array / string / bigint) is inflated past its budget, forcing a grow.
   *    - `undefined` (default) — no size-specific behaviour.
   *  Bounds are read from `binarySizingOptions`. **/
  respectBinarySize?: boolean;
  /** The size-estimate config `respectBinarySize` bounds against — mirrors the
   *  resolver's `--size-*` options / the Go `SizeEstimateConfig`. Omitted fields
   *  fall back to the binary defaults (bias 0.8, items 100, stringBytes 32). **/
  binarySizingOptions?: BinarySizingOptions;
  /** Draw credit-card mocks from the well-known sandbox numbers every payment
   *  gateway publishes (`4111111111111111`, `378282246310005`, ...) instead of
   *  generating a fresh one. Off by default: a generated number is a different
   *  value every run, which is what you want from a mock. Turn it on when the
   *  mocked data reaches a real gateway sandbox, which rejects anything else. **/
  testCreditCards?: boolean;
  /** Seed the value generator for repeatable output: the same seed always
   *  produces the same value for a given type (snapshot tests, deterministic
   *  fixtures, reproducible failures). Omitted (the default) keeps native
   *  randomness, unchanged. Settable at the factory or per call like every other
   *  option (a per-call seed overrides a factory seed). Time-based values
   *  (Date / Temporal / uuid v7) are pinned to a fixed reference instant under a
   *  seed so they don't drift. **/
  seed?: number;
  /** Internal: the `MockRandom` instance every random draw of a single
   *  generation shares. Built by `createMockDataFn` from `seed` (native when no
   *  seed) and carried here so it threads through the walker for free; not part
   *  of the caller-facing surface. Absent ⇒ the mock path falls back to the
   *  shared native instance. **/
  random?: MockRandom;
}

/** Tuning knobs for the binary cold-start size estimate, mirrored from the
 *  resolver's `--binary-sizing-bias` / `-items` / `-string-bytes` / `-max-bytes`
 *  options (and the Go `constants.DefaultSize*`). Used by `respectBinarySize`. **/
export interface BinarySizingOptions {
  sizeBias?: number;
  sizeItems?: number;
  sizeStringBytes?: number;
  sizeMaxBytes?: number;
}

/** Loose runtime view of a `MockNode` (../enrich/mockData.ts) — the walker
 *  reads pools / ranges / array controls structurally, descending by property
 *  name (objects) or `rt$items` (arrays). Typed permissively because the walker
 *  operates over erased `unknown` values; the typed surface is `MockData<T>` on
 *  the public `data` field. Every slot is optional, so an absent / partial node
 *  leaves the corresponding generation path untouched (strictly additive). **/
export interface MockDataNode {
  /** Value pool — leaf kinds draw `randomItem(pool)`. **/
  pool?: unknown[];
  /** Inclusive numeric / Date range bounds. **/
  min?: number | Date;
  max?: number | Date;
  /** Array element data node. **/
  rt$items?: MockDataNode;
  /** Array element count — fixed `n` or `[min, max]` range. **/
  rt$length?: number | [number, number];
  /** Present-probability for optional object members (reserved; not yet read). **/
  rt$optional?: number;
  /** Per-property child node (objects), descended by property name. **/
  [property: string]: unknown;
}

/** Wrapper bag passed at factory or call site. Reserved for future option
 *  groups (e.g. `validation`, `format`) without breaking the signature.
 *
 *  `data` is the optional `MockData<T>` enrichment map: per-field pools / ranges
 *  / element + length controls that steer value generation. Strictly additive —
 *  when absent the walker behaves byte-identically. `dataNode` is the internal
 *  current-node cursor the walker threads + descends; callers supply `data`. **/
export interface RunTypeMockOptions<T = unknown> {
  mock?: DeepPartial<MockOptions>;
  data?: MockData<T>;
  /** Internal: the current MockData node for the node being walked. Seeded
   *  from `data` at walk entry, descended by field name / `rt$items` / element.
   *  Not part of the caller-facing surface — set by the walker. **/
  dataNode?: MockDataNode;
}

/** Generator returned by `createMockDataFn<T>()`. Call-time options may carry a
 *  `data` enrichment map (typed loosely as `MockData<unknown>` here so the
 *  return type stays structurally stable across `T`; the precisely-typed
 *  `MockData<T>` surface is the factory's `options` param). **/
export type MockTypeFn<T = unknown> = (options?: DeepPartial<RunTypeMockOptions>) => T;

/** Recursive Partial — every object branch becomes optional. **/
export type DeepPartial<T> = T extends object ? (T extends ReadonlyArray<unknown> ? T : {[K in keyof T]?: DeepPartial<T[K]>}) : T;
