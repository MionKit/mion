import type {JsonDecoderFn, JsonEncoderFn} from '@mionjs/run-types';

/** A value-first schema thunk: either builds the function from an `RT.*` model
 *  or is `'not-supported'` (no value-first builder can express the case's type).
 *  Mirrors the validation suite's `Thunk`. **/
export type SchemaThunk<F> = (() => F) | 'not-supported';

/** One case in the JSON serialization suite. Mirrors the `SingleTest`
 *  shape but with our marker-based thunks in place of the raw RunType. **/
export interface SerializationCase {
  title: string;
  description?: string;

  /** User-facing notes about this case's serialization behavior — the
   *  serialization counterpart of the validation suite's `validateNotes`.
   *  Use it to explain a deliberate `'not-supported'` opt-out (e.g. a
   *  value-first-schema variant a case can't express) or any non-obvious
   *  round-trip behavior. Single point → string; several → array. */
  serializeNotes?: string | string[];

  /** One thunk per strategy, named for it; only `mutateEncoder` + `mutateDecoder` keeps undeclared keys. **/
  cloneEncoder: () => JsonEncoderFn;
  mutateEncoder: () => JsonEncoderFn;
  compactEncoder: () => JsonEncoderFn;

  /** `cloneDecoder` drops undeclared keys; `mutateDecoder` passes them through untouched. **/
  cloneDecoder: () => JsonDecoderFn;
  mutateDecoder: () => JsonDecoderFn;

  /** Decoder for the `compact` (positional-array) wire — `createJsonDecoderFn<T>(undefined,
   *  {strategy: 'compact'})`. Rebuilds the keyed object from positions. Pairs ONLY
   *  with `compactEncoder`; round-trips strip undeclared keys (shape-derived). **/
  compactDecoder: () => JsonDecoderFn;

  /** Sample values to round-trip via the **mutate** path
   *  (`prepareForJson + JSON.stringify` / `JSON.parse + restoreFromJsonMutate`).
   *  Required for every case.
   *
   *  Returns valid inputs for `prepareForJson`: the mutate path
   *  mutates `v` in place, walks declared children only, and lets
   *  `JSON.stringify` see any extras (which then pass through,
   *  throw on bigint extras, or get silently dropped for
   *  symbol/function-valued extras).
   *
   *  `deserializedValues` is set only when the restored shape is
   *  asymmetric — class instances decode to plain objects,
   *  functions in tuples decode to undefined, JSON.stringify drops
   *  symbol-keyed extras, etc.
   *
   *  Mirrors the `getTestData` shape. **/
  getTestData: () => {values: unknown[]; deserializedValues?: unknown[]};

  /** Test data for the paths that strip extras; set only when stripping changes the result. **/
  getTestDataForStringify?: () => {values: unknown[]; deserializedValues?: unknown[]};

  /** Broad types (any / unknown / object) where the round-trip is
   *  best-effort via JSON. The adapter weakens the assertion: succeed
   *  when JSON.stringify(prepared) is a non-undefined string, without
   *  requiring deep-equal back to the original. **/
  roundTripBestEffort?: boolean;

  /** Opt a case out of the serializer id-integrity suite
   *  (`assertSerializerIdIntegrity`): its value-first schema encoder and the
   *  type-first encoder are KNOWN not to resolve the same structural id, by
   *  design — so their wire output may differ. Reserved for genuinely
   *  non-convergent cases (e.g. a TS `enum`, which the value-first builder can
   *  only express as the structurally-distinct value-union); leave UNSET where
   *  convergence should hold so a regression surfaces as a failure. **/
  idDivergent?: boolean;

  /** When `createXxx<T>()` is rendered as an alwaysThrow cache entry
   *  by the Go pipeline (e.g. `never`, root `symbol`, function-typed
   *  tuple slot, Promise root, …). Calling the factory throws at the
   *  first lookup — the materialised throwing stub fires inside
   *  `lookupRTFn` before returning to the caller. Tests assert the
   *  throw at the thunk-invocation site rather than a successful
   *  round-trip. **/
  factoryThrows?: boolean;

  /** When the factory builds successfully but `JSON.stringify(prepared)`
   *  is expected to throw at runtime. Documents the "extras pass
   *  through" semantic: prepareForJson does NOT strip structural extras
   *  (see comment in `jsonSpec/03JsonObjects.spec.ts` strip
   *  extra params test — "native JSON.stringify do not strip extra
   *  params"). When an input carries an extra prop holding a
   *  non-serializable value (bigint, symbol, circular ref), prepareForJson
   *  preserves it and JSON.stringify throws. The contract: shape inputs
   *  to match the declared type, or apply a future `stripUnknownProps`
   *  pass before serialize. Tests assert the throw at JSON.stringify
   *  time instead of attempting a round-trip. **/
  jsonStringifyThrows?: boolean;

  /** Value-first variants (`createJsonEncoderFn(rt)`), the JSON pair on the default clone strategy. Each thunk builds
   *  its `RT.*` model inline BY DESIGN, staying self-contained for benchmarks, code extraction and doc-gen.
   *  REQUIRED: a thunk, or `'not-supported'` when no `RT.*` builder can express it (say why in `serializeNotes`). **/
  schemaEncoder: SchemaThunk<JsonEncoderFn>;
  schemaDecoder: SchemaThunk<JsonDecoderFn>;
}
