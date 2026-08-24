// The all-strategy round-trip oracle.
//
// One conforming, data-only value is generated per random type and run through
// every wired lane (clone / mutate / direct / compact / binary). The invariants:
//
//   RT-VALIDATE   both ends validate: validate(value) and validate(roundtrip)
//                 are both true.
//   RT-AGREE      round-trip identity + cross-strategy agreement: re-encoding
//                 each lane's decoded value through the canonical CLONE encoder
//                 reproduces the clone wire of the ORIGINAL value — every lane
//                 round-trips to the same DataOnly value (the O12 cross-wire
//                 pattern, generalised to all lanes). This is how round-trip
//                 identity (todo invariant 1) is expressed: a WIRE comparison,
//                 not a raw deep-equal of the decoded value, since JSON
//                 representation normalisation (dropped `undefined`, vanished
//                 optionals, -0 → 0) is correct but not structurally identical.
//   RT-STABLE     wire stability: encode(decode(encode v)) == encode(v) on the
//                 lane's own wire (string for JSON, bytes for binary).
//   RT-FAILAGREE  serialize-vs-alwaysThrow agreement: a type one lane refuses,
//                 every lane refuses.
//   RT-NATIVE     trusted source: for a JSON-safe value the keyed encoders
//                 (clone / mutate / direct) emit JSON that NATIVE JSON.parse
//                 reads back to the same value — an encoder check independent of
//                 our own decoders.
//   RT-THROW      no lane throws an uncontrolled error on a valid value.
//
// Per-codec exceptions handled (see JsonEncoderStrategy docs):
//   - compact collapses a present `null` in an OPTIONAL field to absent, so the
//     lane is skipped for types whose optionals can be null (compactNullRisk).
//   - mutate mutates its input in place, so every lane encodes a fresh clone.
//   - native JSON drops bigint / Date / Map / Set / undefined / symbol, so the
//     RT-NATIVE check only runs on JSON-safe values (jsonRoundTripSafe).

import {normalizeForComparison, deepCloneForRoundTrip} from '../../util/equalsHelpers.ts';
import type {Decl, GeneratedType, PropShape, TypeShape} from '../core/typeGen.ts';
import {JSON_LANES, ALL_LANES, type CompiledCodecs, type LaneId, type WiredCodec} from './roundtripHarness.ts';

export type RoundtripOracleId = 'RT-VALIDATE' | 'RT-AGREE' | 'RT-STABLE' | 'RT-FAILAGREE' | 'RT-NATIVE' | 'RT-THROW';

export interface RoundtripViolation {
  oracle: RoundtripOracleId;
  lane: LaneId | 'all';
  target: string;
  seed: number;
  message: string;
  value: string;
}

const MAX_SNAPSHOT = 500;

/** bigint/symbol-safe short render for the report. **/
export function snapshot(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? v.toString() : v));
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > MAX_SNAPSHOT ? text.slice(0, MAX_SNAPSHOT) + '…' : text;
}

// alwaysThrow messages are rendered by the Go binary as `[CODE] …` (internal/diagnostics).
function isControlledThrow(message: string): boolean {
  return /^\[[A-Z][A-Z0-9]*\]/.test(message);
}

interface Ctx {
  target: string;
  seed: number;
}

function record(
  out: RoundtripViolation[],
  oracle: RoundtripOracleId,
  lane: LaneId | 'all',
  ctx: Ctx,
  message: string,
  value: unknown
): void {
  out.push({oracle, lane, target: ctx.target, seed: ctx.seed, message, value: snapshot(value)});
}

/** Check one (type, value) across every wired lane. `value` must be a value the
 *  shape generator produced for `compiled.gen` (data-only, conforming). **/
export function checkRoundtrip(compiled: CompiledCodecs, value: unknown, seed: number, out: RoundtripViolation[]): void {
  const ctx: Ctx = {target: compiled.title, seed};
  const validate = compiled.validate;
  if (!validate) return; // gated upstream; nothing to police without a validator

  // RT-VALIDATE (input): the generated value must validate.
  const inputValid = runValidate(validate, value);
  if (inputValid.threw) record(out, 'RT-THROW', 'all', ctx, `validate threw on the generated value: ${inputValid.threw}`, value);
  else if (!inputValid.ok) record(out, 'RT-VALIDATE', 'all', ctx, 'validate rejected the generated value', value);

  // Lanes to exercise: every wired lane, minus compact when an optional field
  // could carry a present `null` (the compact wire can't distinguish it).
  const compactExcluded = compactNullRisk(compiled.gen);
  const lanes = ALL_LANES.filter((id) => compiled.codecs[id] && !(id === 'compact' && compactExcluded));

  // Encode each lane once, classifying serialize / controlled-refuse / threw.
  interface LaneRun {
    id: LaneId;
    codec: WiredCodec;
    wire?: unknown;
    refused: boolean;
    undefinedRoot: boolean;
  }
  const runs: LaneRun[] = [];
  for (const id of lanes) {
    const codec = compiled.codecs[id]!;
    try {
      const wire = codec.encode(deepCloneForRoundTrip(value));
      const undefinedRoot = isJsonLane(id) && wire === undefined;
      runs.push({id, codec, wire, refused: false, undefinedRoot});
    } catch (err) {
      const message = errMsg(err);
      if (isControlledThrow(message)) {
        runs.push({id, codec, refused: true, undefinedRoot: false});
      } else {
        record(out, 'RT-THROW', id, ctx, `${id} encode threw an uncontrolled error: ${message}`, value);
      }
    }
  }

  // RT-FAILAGREE: every attempted lane must agree on serialize-vs-refuse.
  const attempted = runs.length;
  const refusedCount = runs.filter((r) => r.refused).length;
  if (attempted > 0 && refusedCount > 0 && refusedCount < attempted) {
    const serializers = runs.filter((r) => !r.refused).map((r) => r.id);
    const refusers = runs.filter((r) => r.refused).map((r) => r.id);
    record(out, 'RT-FAILAGREE', 'all', ctx, `lanes disagree: [${serializers}] serialized but [${refusers}] alwaysThrew`, value);
  }
  if (refusedCount === attempted) return; // all lanes refuse — nothing to round-trip

  // Canonical reference wire (clone) for RT-AGREE. Undefined when the clone lane
  // refused / produced an undefined root — RT-AGREE then no-ops.
  const cloneRun = runs.find((r) => r.id === 'clone' && !r.refused && !r.undefinedRoot);
  const cloneCodec = compiled.codecs.clone;
  const refWire = cloneRun?.wire as string | undefined;

  // Native ground truth for RT-NATIVE (JSON-safe values only).
  const nativeSafe = jsonRoundTripSafe(value);
  let nativeRT: unknown;
  if (nativeSafe) {
    try {
      nativeRT = JSON.parse(JSON.stringify(deepCloneForRoundTrip(value)));
    } catch {
      // unreachable for a JSON-safe value, but never let it abort the run
    }
  }

  for (const run of runs) {
    if (run.refused || run.undefinedRoot) continue;
    const {id, codec, wire} = run;

    // Decode the lane's wire.
    let decoded: unknown;
    try {
      decoded = codec.decode(wire);
    } catch (err) {
      record(out, 'RT-THROW', id, ctx, `${id} decode threw on a valid wire: ${errMsg(err)}`, value);
      continue;
    }

    // RT-VALIDATE (output): the round-tripped value must validate.
    const outValid = runValidate(validate, decoded);
    if (outValid.threw) record(out, 'RT-THROW', id, ctx, `validate threw on the ${id} round-trip: ${outValid.threw}`, decoded);
    else if (!outValid.ok) record(out, 'RT-VALIDATE', id, ctx, `validate rejected the ${id} round-trip`, decoded);

    // Round-trip identity (todo invariant 1) is expressed as WIRE agreement +
    // stability, NOT a raw deep-equal of the decoded value against the generated
    // value. JSON normalises representation in ways that are correct but not
    // structurally identical — `undefined` inside an object / Map value / Set
    // element is dropped, optional keys vanish, -0 collapses to 0 — and those
    // are consistent across every lane, so a ground-truth compare would false-
    // positive on them. RT-AGREE (below) ties each lane's round-trip to the
    // canonical clone encoding of the ORIGINAL value, and RT-NATIVE pins true
    // value identity on the JSON-safe subset where it IS sound. This mirrors the
    // existing serialization oracles (O5/O6/O12), which are all wire-based.

    // RT-AGREE: re-encode through the clone reference and compare wires — every
    // lane must land on the same DataOnly value (and the clone wire encodes the
    // ORIGINAL value, so this also catches a lane that drops or reshapes data).
    if (cloneCodec && refWire !== undefined) {
      try {
        const viaClone = cloneCodec.encode(deepCloneForRoundTrip(decoded)) as string | undefined;
        // Compare STRUCTURALLY, not as raw strings: the clone wire is always
        // valid JSON, and object key order legitimately differs between lanes
        // (binary reconstructs required-before-optional, clone keeps declaration
        // order) — that is not a data disagreement. deepEq on the parsed wires is
        // order-insensitive for objects and order-sensitive for arrays.
        if (viaClone === undefined || !cloneWiresAgree(viaClone, refWire)) {
          record(
            out,
            'RT-AGREE',
            id,
            ctx,
            `${id} disagrees with clone on the decoded value:\n  clone =${cut(refWire)}\n  ${id} =${cut(String(viaClone))}`,
            decoded
          );
        }
      } catch (err) {
        record(out, 'RT-THROW', id, ctx, `clone re-encode of the ${id} round-trip threw: ${errMsg(err)}`, decoded);
      }
    }

    // RT-NATIVE: for a JSON-safe value, every lane must decode to the same value
    // that plain native JSON.stringify/parse yields (the trusted source). Note
    // our JSON WIRE is a shape-coupled tagged envelope (unions / ambiguous scalar
    // unions ride `[tag, …]`), NOT plain JSON — so we compare the DECODED value
    // to the native projection, never the wire itself.
    if (nativeSafe && !deepEqualNormalized(decoded, nativeRT)) {
      record(out, 'RT-NATIVE', id, ctx, `${id} decoded value disagrees with the native JSON projection`, decoded);
    }

    // RT-STABLE: the lane's own wire is stable under re-encode of its decode.
    try {
      const wire2 = codec.encode(deepCloneForRoundTrip(decoded));
      if (!wireEqual(id, wire2, wire)) {
        record(out, 'RT-STABLE', id, ctx, `${id} round-trip wire is not stable`, decoded);
      }
    } catch (err) {
      record(out, 'RT-THROW', id, ctx, `${id} re-encode threw on a valid round-trip: ${errMsg(err)}`, decoded);
    }
  }
}

interface ValidateResult {
  ok: boolean;
  threw?: string;
}
function runValidate(validate: (v: unknown) => boolean, value: unknown): ValidateResult {
  try {
    return {ok: validate(value) === true};
  } catch (err) {
    return {ok: false, threw: errMsg(err)};
  }
}

function isJsonLane(id: LaneId): boolean {
  return (JSON_LANES as readonly LaneId[]).includes(id);
}

// JSON lanes compare wires as strings; binary as bytes.
function wireEqual(id: LaneId, a: unknown, b: unknown): boolean {
  if (id === 'binary') {
    const x = a as Uint8Array;
    const y = b as Uint8Array;
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  return a === b;
}

// =============================================================================
// Structural deep-equality over the normalised comparison forms.
// =============================================================================
//
// normalizeForComparison reduces class instances / Map / Set / Temporal /
// symbols to plain comparable shapes and pads arrays; deepEq then compares with
// `===` at the leaves. `===` treats -0 and 0 as equal (JSON collapses -0 to 0),
// which a Object.is-based isDeepStrictEqual would wrongly flag. NaN is never
// generated by the value layer, so the `NaN !== NaN` gap is moot.

function deepEqualNormalized(a: unknown, b: unknown): boolean {
  const {actual, expected} = normalizeForComparison(a, b);
  return deepEq(actual, expected);
}

// Two CLONE wires agree when they parse to structurally-equal JSON. Both are
// always valid JSON (the clone strategy routes through JSON.stringify); parsing
// + deepEq makes the comparison object-key-order insensitive while staying
// array-order sensitive, so a benign field-ordering difference between lanes
// isn't reported as a data disagreement.
function cloneWiresAgree(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return deepEq(JSON.parse(a), JSON.parse(b));
  } catch {
    return false;
  }
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!deepEq(x[i], y[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, key)) return false;
    if (!deepEq(ao[key], bo[key])) return false;
  }
  return true;
}

// =============================================================================
// jsonRoundTripSafe — true when native JSON.stringify/parse round-trips the
// value without loss, so RT-NATIVE can use it as ground truth.
// =============================================================================

export function jsonRoundTripSafe(value: unknown): boolean {
  return safe(value, new Set());
}

function safe(value: unknown, seen: Set<object>): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value as number); // Infinity / NaN → null on the wire
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'bigint' || t === 'symbol' || t === 'function' || t === 'undefined') return false;
  if (t !== 'object') return false;
  if (value instanceof Date || value instanceof RegExp || value instanceof Map || value instanceof Set) return false;
  if (seen.has(value as object)) return false; // a cycle would throw in JSON.stringify
  seen.add(value as object);
  if (Array.isArray(value)) return value.every((v) => safe(v, seen));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false; // class instance / exotic
  for (const key of Reflect.ownKeys(value as object)) {
    if (typeof key === 'symbol') return false; // symbol-keyed prop
    if (!safe((value as Record<string, unknown>)[key], seen)) return false;
  }
  return true;
}

// =============================================================================
// compactNullRisk — STATIC over-approximation: true when the type has any
// optional property whose declared type can be `null`. Sound (no false
// positives in the oracle): compact's absent-placeholder is `null`, so a present
// `null` in an optional position decodes to undefined. Over-excludes types that
// merely COULD carry such a null even when this value doesn't, which only costs
// the compact lane on those types.
// =============================================================================

export function compactNullRisk(gen: GeneratedType): boolean {
  const decls = new Map<string, Decl>();
  for (const decl of gen.decls) decls.set(decl.name, decl);
  return walkRisk(gen.root, decls, new Set());
}

// True when some optional property reachable from `shape` admits a null value.
function walkRisk(shape: TypeShape, decls: Map<string, Decl>, seen: Set<string>): boolean {
  switch (shape.kind) {
    case 'array':
    case 'set':
      return walkRisk(shape.elem, decls, seen);
    case 'record':
      return walkRisk(shape.value, decls, seen);
    case 'map':
      return walkRisk(shape.key, decls, seen) || walkRisk(shape.value, decls, seen);
    case 'tuple':
      return shape.elems.some((s) => walkRisk(s, decls, seen));
    case 'union':
    case 'intersection':
      return shape.members.some((s) => walkRisk(s, decls, seen));
    case 'object':
      if (shape.index && walkRisk(shape.index, decls, seen)) return true;
      return propsRisk(shape.props, decls, seen);
    case 'ref': {
      if (seen.has(shape.name)) return false;
      const decl = decls.get(shape.name);
      if (!decl) return false;
      const next = new Set(seen).add(shape.name);
      if (decl.kind === 'type') return walkRisk(decl.shape, decls, next);
      if (decl.kind === 'interface' || decl.kind === 'class') return propsRisk(decl.props, decls, next);
      return false; // enum
    }
    default:
      return false; // scalars / literal / date / regexp / null / non-serialisable leaves
  }
}

function propsRisk(props: PropShape[], decls: Map<string, Decl>, seen: Set<string>): boolean {
  for (const prop of props) {
    if (prop.optional && shapeCanBeNull(prop.shape, decls, seen)) return true;
    if (walkRisk(prop.shape, decls, seen)) return true; // nested optionals
  }
  return false;
}

// True when a value of `shape` can be exactly `null`.
function shapeCanBeNull(shape: TypeShape, decls: Map<string, Decl>, seen: Set<string>): boolean {
  switch (shape.kind) {
    case 'null':
    case 'any':
    case 'unknown':
      return true;
    // a `literal` is a string/number/boolean literal, never bare null (that is
    // its own `null` kind), so it can never be exactly null.
    case 'union':
      return shape.members.some((s) => shapeCanBeNull(s, decls, seen));
    case 'ref': {
      if (seen.has(shape.name)) return false;
      const decl = decls.get(shape.name);
      if (!decl) return false;
      if (decl.kind === 'type') return shapeCanBeNull(decl.shape, decls, new Set(seen).add(shape.name));
      return false; // interface / class / enum produce objects or scalar enum members, not bare null
    }
    default:
      return false;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function cut(text: string): string {
  return text.length > 200 ? text.slice(0, 200) + '…' : text;
}
