import type {BinaryDecoderFn, BinaryEncoderFn, JsonDecoderFn, JsonEncoderFn} from '@ts-runtypes/core';

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
   *  Use it to explain a deliberate `'not-supported'` opt-out (e.g. a binary
   *  or value-first-schema variant a case can't express) or any non-obvious
   *  round-trip behavior. Single point → string; several → array. */
  serializeNotes?: string | string[];

  /** Encoder thunks — one per `createJsonEncoderFn` strategy exercised by the
   *  suite (the field name IS the strategy):
   *  - `cloneEncoder` — strategy 'clone' (shape-derived clone, strips extras; default).
   *  - `mutateEncoder` — strategy 'mutate' (mutate in place, preserves extras).
   *  - `directEncoder` — strategy 'direct' (single-pass, always strips).
   *  - `compactEncoder` — strategy 'compact' (declared object props as a
   *    positional array, no key names on the wire; strips extras like clone).
   *    Pairs ONLY with `compactDecoder` (the positional wire can't be read by the
   *    key-based strip/preserve decoders).
   *  Decoder pairing: every strip/direct encoder pairs with `stripDecoder`;
   *  `mutateEncoder` (preserve) pairs with `preserveDecoder` — the only path
   *  that preserves undeclared keys through the round-trip. **/
  cloneEncoder: () => JsonEncoderFn;
  directEncoder: () => JsonEncoderFn;
  mutateEncoder: () => JsonEncoderFn;
  compactEncoder: () => JsonEncoderFn;

  /** Direct-mode only: when set, the case's input produces a JSON string
   *  that is not parseable by `JSON.parse` — e.g. number-at-root with
   *  `Infinity` (`String(Infinity)` = `"Infinity"`). Mirrors the
   *  number-not-supported spec, which accepts either a throw OR
   *  a non-matching round-trip as a "value not supported by JSON"
   *  signal. Only the `direct + *` pairings consult this flag (direct
   *  uses single-pass `stringifyJson` which emits the unparseable
   *  literal). The mutate / clone paths all
   *  route through `JSON.stringify` where `JSON.stringify(Infinity)`
   *  returns `"null"` (not a throw) and `deserializedValues` already
   *  handles the round-trip. **/
  safeAdapterStringifyJsonNotParseable?: boolean;

  /** Decoder thunks. `stripDecoder` builds `createJsonDecoderFn<T>()`
   *  (default strategy 'strip': undeclared keys become `undefined` via
   *  ukuWire before restoreFromJson). `preserveDecoder` builds
   *  `createJsonDecoderFn<T>(undefined, {strategy: 'preserve'})` —
   *  undeclared keys on the parsed value pass through to the restored
   *  result untouched. The round-trip adapter pairs each encoder
   *  shape with its corresponding decoder. **/
  stripDecoder: () => JsonDecoderFn;
  preserveDecoder: () => JsonDecoderFn;

  /** Decoder for the `compact` (positional-array) wire — `createJsonDecoderFn<T>(undefined,
   *  {strategy: 'compact'})`. Rebuilds the keyed object from positions. Pairs ONLY
   *  with `compactEncoder`; round-trips strip undeclared keys (shape-derived). **/
  compactDecoder: () => JsonDecoderFn;

  /** Sample values to round-trip via the **mutate** path
   *  (`prepareForJson + JSON.stringify` / `JSON.parse + restoreFromJson`).
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

  /** Optional override consumed by the **clone** (shape-derived, strips)
   *  path adapter (`prepareForJsonSafe + JSON.stringify` /
   *  `JSON.parse + (stripUnknownKeys | unknownKeyErrors) + restoreFromJson`).
   *
   *  Provide only when the clone path produces a different observable
   *  than the mutate path — typically when an input carries extras
   *  that are stripped pre-serialise (so `deserializedValues`
   *  reflects the cleaned shape). For ~90% of cases (no extras,
   *  identical behaviour between paths) leave this unset; the clone
   *  adapter falls back to `getTestData`.
   *
   *  Mirrors the split between the jsonSpec (prepareForJson +
   *  JSON.stringify) and stringifySpec (stringifyJson) test
   *  helpers. **/
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
   *  round-trip. See docs/UNSUPPORTED-KINDS.md. **/
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

  /** Binary encoder thunk for this case. Mirrors the structure of the
   *  JSON encoder thunks (full type setup inline so the marker plugin
   *  can inject the runtype hash at the call site). The adapter pairs
   *  it with `binaryDecoder` for a deep-equal round-trip assertion.
   *  REQUIRED on every case: supply a thunk, or the `'not-supported'`
   *  sentinel to mark binary as a deliberate opt-out for this case
   *  (explain the reason in `serializeNotes`). **/
  binaryEncoder: SchemaThunk<BinaryEncoderFn>;

  /** Binary decoder thunk. Paired with `binaryEncoder`. Same REQUIRED +
   *  `'not-supported'` contract as `binaryEncoder`. **/
  binaryDecoder: SchemaThunk<BinaryDecoderFn>;

  /** Override `factoryThrows` for binary alone. Use only when binary
   *  has a different unsupported-kind contract than JSON (e.g. a kind
   *  binary refuses but JSON accepts, or vice versa). Falls back to
   *  `factoryThrows` when unset. **/
  binaryFactoryThrows?: boolean;

  /** Override `getTestData` for binary alone. Use only when binary's
   *  round-trip diverges from JSON — e.g. bigint extras that
   *  JSON.stringify rejects but binary encodes natively. Falls back
   *  to `getTestData` when unset. **/
  getBinaryTestData?: () => {values: unknown[]; deserializedValues?: unknown[]};

  /** Optional expected encoded byte length per value, index-parallel to
   *  the resolved binary test-data `values`. When present, the binary
   *  adapter asserts `encode(value).byteLength === size[i]` — this is what
   *  locks in the format binary optimization (number int8→1, int16→2,
   *  …float64→8; bigint 64-bit→8). Omit for variable-length encodings
   *  (string-fallback bigint, objects, arrays). **/
  getBinaryByteSizes?: () => number[];

  /** Value-first schema variants. Each builds its `RT.*` model inline and
   *  passes it to ONE factory via the value-first overload (`createJsonEncoderFn(rt)`),
   *  proving the value-first authoring path resolves the same compiled factory as
   *  the type-first `<T>` form. The model is duplicated across the four BY DESIGN —
   *  every thunk stays self-contained + single-purpose (benchmarking, code
   *  extraction, doc-gen). The JSON pair uses the default strategy (clone
   *  encoder / strip decoder), mirroring `cloneEncoder` / `stripDecoder`.
   *  REQUIRED on every case: supply a thunk, or the `'not-supported'` sentinel
   *  when no `RT.*` builder can express the type (note the reason in
   *  `serializeNotes`). **/
  schemaEncoder: SchemaThunk<JsonEncoderFn>;
  schemaDecoder: SchemaThunk<JsonDecoderFn>;
  schemaBinaryEncoder: SchemaThunk<BinaryEncoderFn>;
  schemaBinaryDecoder: SchemaThunk<BinaryDecoderFn>;
}
