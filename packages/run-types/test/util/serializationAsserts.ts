// One helper per JSON pairing plus binary, shared by the serialization and format-serialization suites.

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

type JsonEncoderKey = 'mutateEncoder' | 'cloneEncoder' | 'compactEncoder';
type JsonDecoderKey = 'mutateDecoder' | 'cloneDecoder' | 'compactDecoder';

interface JsonRoundTripOpts {
  /** Skipped when `structuredClone` refuses the input (cycles, symbols, …). **/
  assertNoMutation: boolean;
  /** Honour `c.jsonStringifyThrows`: mutate keeps extras, so `JSON.stringify` throws on a bigint extra. **/
  jsonStringifyMayThrow: boolean;
  /** False only for mutate + mutate, the one pairing that strips extras nowhere. **/
  useStringifyTestData: boolean;
}

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

    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- JSON pairings (encoder × decoder) -------------------

/** The only pairing where undeclared keys survive end to end. **/
export function assertMutateMutateRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'mutateEncoder', 'mutateDecoder', 'mutate', 'mutate', {
    assertNoMutation: false,
    jsonStringifyMayThrow: true,
    useStringifyTestData: false,
  });
}

/** The encoder keeps extras and the decoder drops them. **/
export function assertMutateCloneRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'mutateEncoder', 'cloneDecoder', 'mutate', 'clone', {
    assertNoMutation: false,
    jsonStringifyMayThrow: true,
    useStringifyTestData: true,
  });
}

/** clone strips extras at encode, so the mutate decoder has nothing extra to keep. **/
export function assertCloneMutateRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'cloneEncoder', 'mutateDecoder', 'clone', 'mutate', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    useStringifyTestData: true,
  });
}

/** The default pair, extras stripped at both ends. **/
export function assertCloneCloneRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'cloneEncoder', 'cloneDecoder', 'clone', 'clone', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    useStringifyTestData: true,
  });
}

/** The only decoder that reads the positional wire; like clone it strips undeclared keys. **/
export function assertCompactRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'compactEncoder', 'compactDecoder', 'compact', 'compact', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
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

/** No-op when either schema thunk is omitted or 'not-supported'. **/
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
