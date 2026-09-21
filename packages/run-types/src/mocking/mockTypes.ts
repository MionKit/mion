// Public types for the mock-value generator; `createMockDataFn<T>()` merges caller options over
// `defaultMockOptions` before walking the runtype graph.

import type {MockData} from '../enrich/mockData.ts';
import type {MockRandom} from './mockRandom.ts';

/** Per-call options for value generation, ported field-for-field from the reference implementation. **/
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
  /** Pool for the `regexp` kind, drawn only when `nonDataTypes` is on (a RegExp is not data). **/
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
  /** Pre-built object the walker mutates for cyclic-shape parents; the decay helper clears it on each recursion. **/
  parentObj?: Record<string | number | symbol, unknown>;
  /** Force a specific union branch. **/
  unionIndex?: number;
  tupleOptions?: MockOptions[];
  paramsOptions?: MockOptions[];
  /** Informational only — `maxMockRecursion` decay handles the practical case. **/
  maxStackDepth: number;
  /** Cap on stack re-entry before mocking bails to `undefined`; with the probability decay it guarantees termination. **/
  maxMockRecursion: number;
  /** Generate values for the DataOnly-stripped kinds (functions / methods / call signatures, `RegExp`, and the
   *  non-serialisable natives) instead of skipping or throwing on them. Off by default, since a mock is a
   *  DataOnly-shaped value; on, the mock carries the non-data members and exercises the serializers' drop / fail. **/
  nonDataTypes?: boolean;
  /** Generate a value that FAILS `validate<T>`: a normal mock with ONE position replaced by a value of the wrong
   *  type (a number where a string is required, a value outside a union, …). Off by default. **/
  invalid?: boolean;
  /** When `invalid` is on, biases the DEPTH (0..1) at which the wrong value lands, every position being a
   *  candidate: `1` corrupts a leaf, `0` replaces the whole root, values in between spread the break across all
   *  depths (a mid value can replace a whole nested object with a non-object). Default `0.85`, usually a deep field. **/
  invalidLeafProbability?: number;
  /** Steer generation against the binary cold-start size estimate (`createBinaryEncoderFn`'s `dynamic` strategy):
   *    - `true`: the value fits the COLD BUFFER, so encoding never resizes. Bounds target the per-write reserve
   *      (a string reserves `5 + 3*length`), not the wire size.
   *    - `false`: an in-bounds value with one unbounded position (string / bigint, else array) inflated past
   *      `sizeMaxBytes`, the cap every estimate stays under, forcing a grow.
   *    - `undefined` (default): no size-specific behaviour.
   *  Bounds are read from `binarySizingOptions`. **/
  respectBinarySize?: boolean;
  /** Mirrors the resolver's `--size-*` options / the Go `SizeEstimateConfig`; omitted fields fall back to the
   *  binary defaults (bias 0.8, items 100, stringBytes 32, maxBytes 65536). **/
  binarySizingOptions?: BinarySizingOptions;
  /** Draw credit-card mocks from the published gateway sandbox numbers (`4111111111111111`, ...) instead of
   *  generating a fresh one. Off by default; turn it on when the mocked data reaches a real gateway sandbox,
   *  which rejects anything else. **/
  testCreditCards?: boolean;
  /** Seed the value generator so the same seed always produces the same value for a given type; omitted keeps
   *  native randomness. Settable at the factory or per call, and a per-call seed overrides a factory seed.
   *  Time-based values (Date / Temporal / uuid v7) are pinned to a fixed reference instant under a seed. **/
  seed?: number;
  /** Internal, not caller-facing: the `MockRandom` every draw of one generation shares, built by
   *  `createMockDataFn` from `seed` and carried here so it threads through the walker.
   *  Absent ⇒ the mock path falls back to the shared native instance. **/
  random?: MockRandom;
}

/** Mirrors the resolver's `--binary-sizing-bias` / `-items` / `-string-bytes` / `-max-bytes` options and the Go
 *  `constants.DefaultSize*`; used by `respectBinarySize`. **/
export interface BinarySizingOptions {
  sizeBias?: number;
  sizeItems?: number;
  sizeStringBytes?: number;
  sizeMaxBytes?: number;
}

/** Loose runtime view of a `MockNode` (../enrich/mockData.ts), read structurally by the walker and typed
 *  permissively because it operates over erased `unknown` values; the typed surface is `MockData<T>` on the
 *  public `data` field. Every slot is optional, so an absent / partial node leaves its generation path untouched. **/
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

/** Wrapper bag passed at factory or call site, so future option groups (e.g. `validation`) don't break the signature.
 *  `data` is the optional `MockData<T>` enrichment map (per-field pools / ranges / element + length controls) and
 *  is strictly additive: when absent the walker behaves byte-identically.
 *  `dataNode` is the internal current-node cursor the walker threads and descends; callers supply `data`. **/
export interface RunTypeMockOptions<T = unknown> {
  mock?: DeepPartial<MockOptions>;
  data?: MockData<T>;
  /** Internal, set by the walker: seeded from `data` at walk entry, descended by field name / `rt$items` / element. **/
  dataNode?: MockDataNode;
}

/** The call-time `data` map is typed loosely so the return type stays structurally stable across `T`; the
 *  precisely-typed `MockData<T>` surface is the factory's `options` param. **/
export type MockTypeFn<T = unknown> = (options?: DeepPartial<RunTypeMockOptions>) => T;

/** Recursive Partial — every object branch becomes optional. **/
export type DeepPartial<T> = T extends object ? (T extends ReadonlyArray<unknown> ? T : {[K in keyof T]?: DeepPartial<T[K]>}) : T;
