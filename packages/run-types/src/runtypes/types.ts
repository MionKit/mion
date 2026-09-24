/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Local type surface for the RT utils, kept dependency-free: only the symbols `rtUtils.ts` reaches.

import type {RTUtils} from './rtUtils.ts';
import type {FormatAnnotation} from './formatAnnotation.ts';
// Type-only (no runtime cycle): each family's fn signature comes from the module that owns it, so the
// cache-entry typedefs below stay a single source of truth.
import type {
  ValidateFn,
  GetValidationErrorsFn,
  HasUnknownKeysFn,
  RemoveUnknownKeysFn,
  UnknownKeyErrorsFn,
  PrepareForJsonFn,
  RestoreFromJsonFn,
  StringifyJsonFn,
} from '../createRTFunctions.ts';
import type {ToBinaryFn, FromBinaryFn} from '../createRTFBinary.ts';

// ########################################### Pure functions #########################################

export type PureFunction = (...args: any[]) => any;

export type PureFunctionFactory = (rtUtils: RTUtils) => PureFunction;

export interface PureFunctionData {
  /** Where this pure function lives (`@acme/text/src/slug#slugify`), or a hash of its body when it is bound to
   *  no name. The build computes it, and it is the cache key. */
  readonly id: string;
  readonly paramNames: string[];
  /** The factory body string: present in `code`/`both` emit modes, undefined in `functions` mode where the live
   *  `createPureFn` ships instead (mirrors the type-fn `CompiledFnData.code`). */
  readonly code?: string;
  /** Ids of every pure function this one and its children use. */
  readonly pureFnDependencies?: Array<string>;
}

export interface CompiledPureFunction extends PureFunctionData {
  /** Factory closure `(utl) => fn`. Optional: in `code` mode (default) the Go renderer drops it and
   *  `initPureFunction` rebuilds it on first lookup; `functions`/`both` ship the live literal for runtimes that
   *  can't use `new Function` (mirrors the type-fn `createRTFn` slot). */
  createPureFn?: PureFunctionFactory;
  fn?: PureFunction;
}

// ########################################### Run types ##############################################

/** The sentinel-lifted structural constraint checks a RunType can carry — the runtime mirror of the Go-side
 *  SchemaChecks group (internal/reflection/runtype.go). Every member comes from a `__rt…` sentinel, folds into
 *  the structural id, and drives validate/validationErrors only; the runtime cache also reads them for mocking.
 *  Declaration-level grouping only: RunType extends this, so the runtime objects stay flat. */
export interface SchemaChecks {
  /** Contains assertions (the `__rtContains` sentinel): at least `min`, and at most `max` when `max` ≥ 0, of
   *  the array's items validate against `child`. Mocking splices `min` child mocks among non-matching fillers. */
  contains?: {child: RunType; min: number; max: number}[];
  /** patternProperties entries: keys matching `source` must have values valid against `value`; `key` is the
   *  pattern-branded string child whose build-time sample pool powers key mocking. */
  patternProps?: {source: string; key?: RunType; value: RunType}[];
  /** propertyNames children: every key validates as a string against EVERY entry (allOf-stacked propertyNames
   *  conjoin, matching the id fold). */
  propNames?: RunType[];
}

/** Runtime representation of a reflected type. Identification fields are set at construction; ref slots
 *  (`child`, `parameters`, …) start as `undefined` and are patched afterwards by the emitter's footer
 *  assignments. Fields are typed permissively — the concrete schema lives on the Go side. `T` is a PHANTOM type
 *  parameter (carried on the never-set `__rtType`, erased at runtime) so a value-first builder can return
 *  `RunType<String<P>>` and `InferType<…>` can recover the original type; it defaults to `unknown`, so every
 *  plain `RunType` reference is unaffected. */
export interface RunType<T = unknown> extends SchemaChecks {
  id: string;
  kind: unknown;
  subKind?: unknown;
  typeName?: unknown;
  name?: unknown;
  literal?: unknown;
  optional?: unknown;
  readonly?: unknown;
  /** True when this property's by-name serialization is gated by a runtime own-enumerability check: a member
   *  inherited from a default-lib global type (Error's name/message/stack, …) or one tagged `@nonEnumerable` in
   *  JSDoc. Such a member is also `optional` in the projected shape — the wire may omit it. */
  nonEnumerable?: boolean;
  isAbstract?: unknown;
  isStatic?: unknown;
  visibility?: unknown;
  isSafeName?: unknown;
  position?: unknown;
  isCircular?: boolean;
  /** True for the "non-data" kinds (function / method / call-signature / symbol / never / non-serialisable
   *  class) the validators and serializers ignore. The node is kept in the reflected tree so reflection stays
   *  complete; only the node itself is flagged, never its children. */
  notSupported?: boolean;
  /** The largest compact-JSON byte size a valid value of this type can have, computed at build time (the Go
   *  `jsonsize` walk). Present only on a reflection ROOT whose type is fully bounded (every string, array, Map
   *  and Set carries a maximum); absent on nested nodes and on any type with an unbounded part. The mion router
   *  derives per-route request and response limits from it. */
  jsonMaxBytes?: number;
  flags?: unknown;
  description?: unknown;
  defaultVal?: unknown;
  enumVal?: unknown;
  values?: unknown;
  child?: RunType;
  index?: RunType;
  return?: RunType;
  indexType?: RunType;
  parameters?: RunType[];
  children?: RunType[];
  safeUnionChildren?: RunType[];
  unionDiscriminators?: unknown;
  /** The OPEN metadata extension point: user-space annotation objects from an `atomic & { obj }` intersection
   *  (e.g. `number & {dbIndex: true}`), carried through reflection untouched so consumers can read their own
   *  metadata back at runtime. The engine NEVER acts on its contents — engine-recognised behavior lives only
   *  behind the symbol-keyed sentinels (`formatAnnotation` below, the SchemaChecks members above). */
  typeMeta?: unknown;
  /** Populated for a TypeFormat-branded primitive; drives mock generation and format-formatter lookup. The
   *  CLOSED counterpart of `typeMeta`: only a real TypeFormat brand (the `__rtFormatName` / `__rtFormatParams`
   *  sentinels) produces it, and the engine acts on it. */
  formatAnnotation?: FormatAnnotation;
  typeArguments?: RunType[];
  arguments?: RunType[];
  extendsArguments?: RunType[];
  implements?: RunType[];
  extends?: RunType;
  classType?: RunType;
  /** Phantom carrier of the source TS type `T`. Never set at runtime; exists only so `InferType<RunType<T>>`
   *  recovers `T` by indexed access (no `infer`). `T` rides INSIDE a `{t: T}` wrapper so the optional `?` adds
   *  `| undefined` to the WRAPPER, not to `T`, preserving an intentional `null`/`undefined` `T` (a bare-`T`
   *  carrier + `NonNullable` would collapse those to `never`, dropping e.g. a `literal(null)` arm from a
   *  composed union). The explicit member wins over the index signature below. */
  readonly __rtType?: {t: T};
  [extra: string]: unknown;
}

/** Flat run-type cache keyed by canonical type id. */
export type RunTypesCache = Record<string, RunType>;

// ########################################### RT functions ##########################################

export type AnyFn = (...args: any[]) => any;

/** One emitted-function parameter table, keyed by CONCEPTUAL SLOT (`vλl`, `pλth`, `εrr`, `θpts`, `sεr`, `dεs`) —
 *  the Go-side mirror of `typefunctions.ArgSpec`. ⚠️ Every value is a JS-SOURCE FRAGMENT, never a runtime value:
 *  `args` holds identifiers, `defaultParamValues` holds default EXPRESSIONS (`''` for no default), and both are
 *  spliced back into a signature when a consumer rebuilds the function via `new Function(...)`. That is what
 *  keeps `CompiledFnData` JSON-serializable with NO conversion step — put a real `undefined` / `[]` / `{}` in
 *  here and `JSON.stringify` emits invalid JSON (`"vλl":undefined`) for a required slot. **/
export type CompiledFnArgs = {
  /** The value parameter — present in every family. */
  vλl: string;
  /** The remaining slots, family-dependent. */
  [key: string]: string;
};

export interface CompiledFnData {
  readonly typeName: string;
  /** The operation family (`it`, `te`, `pj`, `rj`, …). */
  readonly fnID: string;
  /** The tuple's slot-0 family tag (`pj`, `jeMU`, `jdST`, …). Unlike `fnID`, which composites HOST on (`jeMU`
   *  carries fnID `pj`), this is the exact emitting family, so consumers can tell primitive from composite. */
  readonly familyTag?: string;
  readonly rtFnHash: string;
  /** Slot → the JS IDENTIFIER it takes in the emitted signature (`{vλl: 'v', pλth: 'pth', εrr: 'er'}` →
   *  `function verr_x(v, pth, er)`). */
  readonly args: CompiledFnArgs;
  /** Slot → that parameter's DEFAULT EXPRESSION as JS source, `''` when it has none: `{vλl: '', pλth: '[]',
   *  εrr: '[]'}` is what makes the emitted `function verr_x(v, pth=[], er=[])`. Text, not values — see the
   *  CompiledFnArgs contract above. */
  readonly defaultParamValues: CompiledFnArgs;
  /** True for collapsed-to-identity compilations. */
  readonly isNoop?: boolean;
  /** The factory body string: present in `code`/`both` emit modes, undefined in `functions` mode where the live
   *  `createRTFn` ships instead and `code` is derived lazily from it (see `entryCode`) only if read. **/
  readonly code?: string;
  /** Sibling rt-fn hashes this entry calls into. */
  readonly rtDependencies?: Array<string>;
  /** Ids of the pure functions this entry reaches. */
  readonly pureFnDependencies?: Array<string>;
  paramNames?: string[];
  /** Complete runtime throw message (`[code] headline (at file:line:col)`) when this entry is an alwaysThrow
   *  factory: the Go compiler reached an unsupported leaf and rendered the message at build time, and the JS
   *  side throws it verbatim with no diagnostic catalog of its own. Undefined for normal and noop entries. */
  readonly alwaysThrowMessage?: string;
  /** `tb` (binary-encoder) entries only: the cold-start buffer-size estimate in bytes, emitted only for an
   *  un-varianted `toBinary` entry. `createBinaryEncoderFn`'s `dynamic` strategy seeds the buffer with it so a
   *  cold encode is sized to the type instead of the flat `defaultBufferSize`. **/
  readonly binarySizeEstimate?: number;
}

export interface CompiledTypeFn<Fn extends AnyFn = AnyFn> extends CompiledFnData {
  /** Factory closure wrapping the rt function with its context-code prologue. Optional: in `code` mode (default)
   *  the Go renderer emits `undefined` and `materializeRTFn` rebuilds it on first lookup, while
   *  `--emit-mode functions|both` emits the closure eagerly for runtimes that can't use `new Function`. Always
   *  set on alwaysThrow entries; always undefined on noop entries. **/
  readonly createRTFn?: (utl: RTUtils) => Fn;
  /** The materialised RT function. */
  readonly fn?: Fn;
}

/** `CompiledTypeFn` after `materializeRTFn` — `createRTFn` and `fn` are
 *  guaranteed to be set. */
export type InitializedTypeFn<Fn extends AnyFn = AnyFn> = CompiledTypeFn<Fn> &
  Required<Pick<CompiledTypeFn<Fn>, 'createRTFn' | 'fn'>>;

// ############################# RT CACHES ###################################

// Per-family aliases. Several families share an fn shape but occupy distinct cache slots (`pjs` vs `pj`).

export type ValidateRTFn = CompiledTypeFn<ValidateFn>;
export type GetValidationErrorsRTFn = CompiledTypeFn<GetValidationErrorsFn>;
export type HasUnknownKeysRTFn = CompiledTypeFn<HasUnknownKeysFn>;
export type RemoveUnknownKeysRTFn = CompiledTypeFn<RemoveUnknownKeysFn>;
export type UnknownKeyErrorsRTFn = CompiledTypeFn<UnknownKeyErrorsFn>;
// ukuw is decoder-internal (the `strip` decode strategy's pre-pass): an in-place value mutator.
export type UnknownKeysToUndefinedWireRTFn = CompiledTypeFn<(value: unknown) => unknown>;
export type PrepareForJsonRTFn = CompiledTypeFn<PrepareForJsonFn>;
export type PrepareForJsonSafeRTFn = CompiledTypeFn<PrepareForJsonFn>;
export type RestoreFromJsonRTFn = CompiledTypeFn<RestoreFromJsonFn>;
export type StringifyJsonRTFn = CompiledTypeFn<StringifyJsonFn>;
export type ToBinaryRTFn = CompiledTypeFn<ToBinaryFn>;
export type FromBinaryRTFn = CompiledTypeFn<FromBinaryFn>;

export type TypesFunctionsCache = Record<string, CompiledTypeFn>;
/** Flat pure-function cache keyed by pure-fn id. */
export type PureFunctionsCache = Record<string, CompiledPureFunction>;

// ########################################### Classes / helpers #########################################

// `AnyClass`, `SerializableClass` and `DeserializeClassFn` live next to the public registry in
// ./classSerializerRegistry.ts.

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export type DeepRequired<T> = T extends object
  ? {
      [P in keyof T]?: DeepRequired<T[P]>;
    }
  : T;

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;
