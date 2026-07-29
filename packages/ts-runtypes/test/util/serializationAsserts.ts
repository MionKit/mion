// Shared assertion helpers for the serialization adapters. Extracted so
// the atomic/collection serialization adapters and the format
// serialization adapters run the exact same round-trip logic against
// the `SerializationCase` shape — every JSON encoder × decoder pairing
// (3 encoders × 2 decoders = 6 combinations) plus the binary round-trip —
// with no copy-pasted assertion bodies. Each pairing is its own exported
// helper so the per-subgroup test files declare one `it()` per pairing.

import {expect} from 'vitest';
import type {SchemaThunk, SerializationCase} from '../suites/serialization/types.ts';
import {deepCloneForRoundTrip, isTemporalInstance, normalizeForComparison} from './equalsHelpers.ts';

/** Resolve a schema thunk to its factory, or `undefined` when omitted /
 *  'not-supported' (the variant then no-ops, like the validation suite). **/
function resolveSchemaThunk<F>(thunk: SchemaThunk<F> | undefined): (() => F) | undefined {
  if (!thunk || thunk === 'not-supported') return undefined;
  return thunk;
}

function safeStructuredClone(input: unknown): {ok: true; snapshot: unknown} | {ok: false} {
  // `structuredClone` doesn't throw on a Temporal instance but produces a
  // lossy `{}` (the value lives in internal slots it can't see), which would
  // make the no-mutation snapshot compare unequal to the original. Temporal
  // values are immutable, so there's no mutation to catch — skip the snapshot,
  // same as the throw path below (cycles, symbols, …).
  if (isTemporalInstance(input)) return {ok: false};
  try {
    return {ok: true, snapshot: structuredClone(input)};
  } catch {
    return {ok: false};
  }
}

type JsonEncoderKey = 'mutateEncoder' | 'cloneEncoder' | 'directEncoder' | 'compactEncoder';
type JsonDecoderKey = 'preserveDecoder' | 'stripDecoder' | 'compactDecoder';

interface JsonRoundTripOpts {
  /** Assert input is unchanged after encode. True for non-mutating
   *  encoders (clone, direct). Skipped automatically when
   *  `structuredClone` refuses the input (cycles, symbols, …). **/
  assertNoMutation: boolean;
  /** Honour `c.jsonStringifyThrows`. True for mutate — it preserves extras
   *  and routes through `JSON.stringify`, which throws on bigint extras.
   *  False for clone (shape-derived, extras dropped before stringify) and
   *  direct (single-pass stringifyJson). **/
  jsonStringifyMayThrow: boolean;
  /** Honour `c.safeAdapterStringifyJsonNotParseable`. True only for the
   *  direct strategy — single-pass `stringifyJson` at root for Infinity /
   *  NaN emits `"Infinity"` which `JSON.parse` rejects. **/
  stringifyJsonMayBeUnparseable: boolean;
  /** When true, resolve test data as `getTestDataForStringify ?? getTestData`.
   *  When false, always use `getTestData` (extras-preserving paths). Only
   *  the one end-to-end preserving pairing — mutate+preserve — uses raw
   *  `getTestData`; every other pairing strips extras somewhere in the
   *  pipeline. **/
  useStringifyTestData: boolean;
}

// Shared encode→parse→decode loop. Each of the 10 JSON helpers below is
// a thin wrapper over this function, supplying the pairing-specific
// thunk keys + opts. Keeps the per-pairing surface small (one named
// exported helper, matching the helper-per-function form introduced in
// commit 8c95ad7) while sharing the contract handling.
function jsonRoundTrip(
  c: SerializationCase,
  encKey: JsonEncoderKey,
  decKey: JsonDecoderKey,
  encLabel: string,
  decLabel: string,
  opts: JsonRoundTripOpts
): void {
  const pair = `${encLabel} - ${decLabel}`;

  if (c.factoryThrows) {
    expect(() => c[encKey](), `${c.title} [${pair}]: ${encKey} factory must throw`).toThrow();
    expect(() => c[decKey](), `${c.title} [${pair}]: ${decKey} factory must throw`).toThrow();
    return;
  }

  const label = `${c.title} [${pair}]`;

  if (opts.jsonStringifyMayThrow && c.jsonStringifyThrows) {
    const encode = c[encKey]();
    const {values} = c.getTestData();
    values.forEach((reference, i) => {
      const input = deepCloneForRoundTrip(reference);
      expect(() => encode(input), `${label}: ${encKey}(values[${i}]) must throw`).toThrow();
    });
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = c[encKey]();
  const decode = c[decKey]();
  const getTestData = opts.useStringifyTestData ? (c.getTestDataForStringify ?? c.getTestData) : c.getTestData;
  const {values, deserializedValues} = getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const preSnapshot = opts.assertNoMutation ? safeStructuredClone(input) : undefined;

    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }

    if (preSnapshot?.ok) {
      expect(input, `${label}: values[${i}] — ${encLabel} encoder must not mutate input`).toEqual(preSnapshot.snapshot);
    }

    if (serialized === undefined) return;
    if (bestEffort) return;

    if (opts.stringifyJsonMayBeUnparseable && c.safeAdapterStringifyJsonNotParseable) {
      expect(() => decode(serialized as string), `${label}: values[${i}] expected decoder to throw (not valid JSON)`).toThrow();
      return;
    }

    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- 6 JSON pairings (encoder × decoder) -------------------

/** mutate encoder + preserve decoder — only pairing where extras survive
 *  end-to-end (encoder keeps them via prepareForJson, decoder keeps them). **/
export function assertMutatePreserveRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'mutateEncoder', 'preserveDecoder', 'mutate', 'preserve', {
    assertNoMutation: false,
    jsonStringifyMayThrow: true,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: false,
  });
}

/** mutate encoder + strip decoder — encoder preserves extras, decoder
 *  drops them. Uses the stringify test data (decoded shape is cleaned). **/
export function assertMutateStripRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'mutateEncoder', 'stripDecoder', 'mutate', 'strip', {
    assertNoMutation: false,
    jsonStringifyMayThrow: true,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** clone encoder + preserve decoder — clone is shape-derived so it strips
 *  extras at encode (the preserve decoder then has nothing extra to keep).
 *  Non-mutating. **/
export function assertClonePreserveRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'cloneEncoder', 'preserveDecoder', 'clone', 'preserve', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** clone encoder + strip decoder — non-mutating, extras stripped at both
 *  ends (clone strips by construction). The default serialization pair. **/
export function assertCloneStripRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'cloneEncoder', 'stripDecoder', 'clone', 'strip', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** direct encoder + preserve decoder — direct strategy always strips at
 *  encode via single-pass stringifyJson, so the preserve decoder has
 *  nothing to preserve. Observationally identical to direct+strip. **/
export function assertDirectPreserveRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'directEncoder', 'preserveDecoder', 'direct', 'preserve', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: true,
    useStringifyTestData: true,
  });
}

/** direct encoder + strip decoder — single-pass stringifyJson, decoder
 *  strips at decode. **/
export function assertDirectStripRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'directEncoder', 'stripDecoder', 'direct', 'strip', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: true,
    useStringifyTestData: true,
  });
}

/** compact encoder + compact decoder — the positional-array wire (declared
 *  object props by position, no key names). The only correct pairing for the
 *  compact strategy: the positional payload can't be read by the key-based
 *  strip/preserve decoders. Shape-derived like clone (non-mutating, strips
 *  undeclared keys by construction), so it uses the stringify test data. **/
export function assertCompactRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'compactEncoder', 'compactDecoder', 'compact', 'compact', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

// ---------- BINARY round-trip -------------------------------------

/** Drives a case through `binaryEncoder` → `binaryDecoder` and asserts
 *  the decoded value deep-equals the original (or the per-case
 *  `deserializedValues` override when the round-trip is asymmetric).
 *  Requires `binaryEncoder` + `binaryDecoder` thunks to be present. **/
export function assertBinaryRoundTrip(c: SerializationCase): void {
  const encThunk = resolveSchemaThunk(c.binaryEncoder);
  const decThunk = resolveSchemaThunk(c.binaryDecoder);
  if (!encThunk || !decThunk) return; // 'not-supported' → binary opted out for this case

  const factoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
  if (factoryThrows) {
    expect(() => encThunk(), `${c.title}: binaryEncoder factory must throw`).toThrow();
    expect(() => decThunk(), `${c.title}: binaryDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = encThunk();
  const decode = decThunk();
  const testDataThunk = c.getBinaryTestData ?? c.getTestDataForStringify ?? c.getTestData;
  const {values, deserializedValues} = testDataThunk();
  const byteSizes = c.getBinaryByteSizes?.();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let buf;
    try {
      buf = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (bestEffort) return;
    if (byteSizes && byteSizes[i] !== undefined) {
      expect(buf.byteLength, `${c.title}: values[${i}] encoded byte length`).toBe(byteSizes[i]);
    }
    const restored = decode(buf);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title}: values[${i}] binary round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- value-first SCHEMA round-trips -------------------------
// The schema thunks (`schemaEncoder` / `schemaDecoder` / `schemaBinaryEncoder`
// / `schemaBinaryDecoder`) build their `RT.*` model inline and feed it through
// the factory's value-first overload. These two helpers pair them for a
// representative round-trip — proving the value-first path resolves a working
// factory — without re-testing every strategy (those are covered type-first).

/** Value-first JSON round-trip — pairs `schemaEncoder` (default clone) +
 *  `schemaDecoder` (default strip) and asserts a deep-equal round-trip on the
 *  case's samples. No-op when either thunk is omitted or 'not-supported'. **/
export function assertSchemaJsonRoundTrip(c: SerializationCase): void {
  const encThunk = resolveSchemaThunk(c.schemaEncoder);
  const decThunk = resolveSchemaThunk(c.schemaDecoder);
  if (!encThunk || !decThunk) return;

  if (c.factoryThrows) {
    expect(() => encThunk(), `${c.title} [schema/json]: schemaEncoder factory must throw`).toThrow();
    expect(() => decThunk(), `${c.title} [schema/json]: schemaDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = encThunk();
  const decode = decThunk();
  // clone strips extras at encode (shape-derived), so the decoded shape matches
  // the cleaned stringify test data (same resolution as the clone pairings).
  const {values, deserializedValues} = (c.getTestDataForStringify ?? c.getTestData)();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (serialized === undefined || bestEffort) return;
    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title} [schema/json]: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- JSON-SCHEMA round-trips --------------------------------
// The jsonSchema thunks (`jsonSchemaEncoder` / `jsonSchemaDecoder` /
// `jsonSchemaBinaryEncoder` / `jsonSchemaBinaryDecoder`) build the draft
// 2020-12 schema literal inline and feed it through the factory's value-first
// overload (`createJsonEncoderFn(jsonSchema({…}))`) — the third authoring form.
// Same representative-pairing philosophy as the value-first schema helpers.

/** The two jsonSchema pairings the serialization drivers register. **/
export type JsonSchemaSerializationKey = 'jsonschema/json' | 'jsonschema/binary';

/** Build the it() title for a jsonSchema pairing, mirroring the validation
 *  suite's `titleFor` three-state protocol so the serialization test tree also
 *  self-documents the column's drain state (the thunk protocol itself is
 *  unchanged — omitted and `'not-supported'` both no-op in the assert). State is
 *  derived from the pairing's ENCODER thunk; the four jsonSchema thunks are
 *  filled or opted out together (the completion meta-check enforces it). **/
export function titleForJsonSchema(c: SerializationCase, key: JsonSchemaSerializationKey): string {
  const thunk = key === 'jsonschema/json' ? c.jsonSchemaEncoder : c.jsonSchemaBinaryEncoder;
  const base = `${key === 'jsonschema/json' ? 'jsonschema - json' : 'jsonschema - binary'} - ${c.title}`;
  if (thunk === 'not-supported') return `${base} (not supported)`;
  if (!thunk) return `${base} (not implemented)`;
  return base;
}

/** JSON-Schema JSON round-trip — pairs `jsonSchemaEncoder` (default clone) +
 *  `jsonSchemaDecoder` (default strip) and asserts a deep-equal round-trip on
 *  the case's samples. No-op when either thunk is omitted or 'not-supported'. **/
export function assertJsonSchemaJsonRoundTrip(c: SerializationCase): void {
  const encThunk = resolveSchemaThunk(c.jsonSchemaEncoder);
  const decThunk = resolveSchemaThunk(c.jsonSchemaDecoder);
  if (!encThunk || !decThunk) return;

  if (c.factoryThrows) {
    expect(() => encThunk(), `${c.title} [jsonschema/json]: jsonSchemaEncoder factory must throw`).toThrow();
    expect(() => decThunk(), `${c.title} [jsonschema/json]: jsonSchemaDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = encThunk();
  const decode = decThunk();
  // clone strips extras at encode (shape-derived), so the decoded shape matches
  // the cleaned stringify test data (same resolution as the clone pairings).
  const {values, deserializedValues} = (c.getTestDataForStringify ?? c.getTestData)();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (serialized === undefined || bestEffort) return;
    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title} [jsonschema/json]: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

/** JSON-Schema binary round-trip — pairs `jsonSchemaBinaryEncoder` +
 *  `jsonSchemaBinaryDecoder`. No-op when either thunk is omitted or
 *  'not-supported'. **/
export function assertJsonSchemaBinaryRoundTrip(c: SerializationCase): void {
  const encThunk = resolveSchemaThunk(c.jsonSchemaBinaryEncoder);
  const decThunk = resolveSchemaThunk(c.jsonSchemaBinaryDecoder);
  if (!encThunk || !decThunk) return;

  const factoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
  if (factoryThrows) {
    expect(() => encThunk(), `${c.title} [jsonschema/binary]: jsonSchemaBinaryEncoder factory must throw`).toThrow();
    expect(() => decThunk(), `${c.title} [jsonschema/binary]: jsonSchemaBinaryDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = encThunk();
  const decode = decThunk();
  const testDataThunk = c.getBinaryTestData ?? c.getTestDataForStringify ?? c.getTestData;
  const {values, deserializedValues} = testDataThunk();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let buf;
    try {
      buf = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (bestEffort) return;
    const restored = decode(buf);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title} [jsonschema/binary]: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

/** Value-first binary round-trip — pairs `schemaBinaryEncoder` +
 *  `schemaBinaryDecoder`. No-op when either thunk is omitted or 'not-supported'. **/
export function assertSchemaBinaryRoundTrip(c: SerializationCase): void {
  const encThunk = resolveSchemaThunk(c.schemaBinaryEncoder);
  const decThunk = resolveSchemaThunk(c.schemaBinaryDecoder);
  if (!encThunk || !decThunk) return;

  const factoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
  if (factoryThrows) {
    expect(() => encThunk(), `${c.title} [schema/binary]: schemaBinaryEncoder factory must throw`).toThrow();
    expect(() => decThunk(), `${c.title} [schema/binary]: schemaBinaryDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = encThunk();
  const decode = decThunk();
  const testDataThunk = c.getBinaryTestData ?? c.getTestDataForStringify ?? c.getTestData;
  const {values, deserializedValues} = testDataThunk();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let buf;
    try {
      buf = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (bestEffort) return;
    const restored = decode(buf);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title} [schema/binary]: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}
