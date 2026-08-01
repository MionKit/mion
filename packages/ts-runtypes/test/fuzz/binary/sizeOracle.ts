// The size oracle — DUMB by design. It does NO size arithmetic and knows nothing
// about kinds or reserves. It encodes a value into a COLD buffer (seeded at the
// compile-time estimate) and observes ONE bit: did the buffer resize?
//
//   in-bounds value (respectBinarySize:true)  -> MUST NOT resize, and round-trips
//   oversized value (respectBinarySize:false) -> MUST resize, and round-trips
//
// Everything that makes "an in-bounds value never resizes" TRUE lives elsewhere:
// the bounds in createMockDataFn's `respectBinarySize` (applyInBoundsSizing) and the
// matching cold-start estimate (binary_size_estimate.go). If those two agree, an
// in-bounds value fits the seeded buffer by construction and this oracle just
// confirms it. The runner owns WHICH types to feed (see sizeEligible.ts).
//
// `getBufferView()` returns `new Uint8Array(buffer, 0, index)`, so
// `view.buffer.byteLength` is the buffer's final capacity — and the cold buffer is
// allocated at exactly the seed (dataView.ts coldStartSize), so capacity === seed
// iff no resize fired.

import {isDeepStrictEqual} from 'node:util';
import {setSerializationOptions} from '../../../src/runtypes/dataView.ts';
import {snapshot} from '../value/fuzzOracle.ts';
import type {CompiledType} from '../type/typeFuzzHarness.ts';

export type SizeOracleId = 'O-SIZE-NOGROW' | 'O-SIZE-ROUNDTRIP' | 'O-SIZE-GREW';

export interface SizeViolation {
  oracle: SizeOracleId;
  type: string;
  /** The iteration seed — replay with `runSizeFuzz({seed})`. **/
  seed: number;
  message: string;
  value: string;
}

export interface SizeCtx {
  seed: number;
}

function violation(oracle: SizeOracleId, compiled: CompiledType, ctx: SizeCtx, message: string, value: unknown): SizeViolation {
  return {oracle, type: compiled.title, seed: ctx.seed, message, value: snapshot(value)};
}

/** Force a TRUE cold start — reset BOTH pieces of the serializer's warm module
 *  state so a checked encode behaves like a fresh process's first-ever encode:
 *   - `sizeHistory` empty       -> the `dynamic` strategy seeds the buffer from the
 *     compile-time estimate (the seed under test), not a warmed mean.
 *   - `stringBytesCache` empty  -> every string write reserves WORST-CASE UTF-8
 *     (`MAX_VARINT + 3*charLength`), as a cold cache must. A warm cache reserves the
 *     exact cached byte length instead, which is TIGHTER — so leaving it warm lets a
 *     later "cold" encode fit a buffer a true cold start would have grown, silently
 *     masking an under-allocation AND making the negative lane non-deterministic
 *     (first encode grows, the rest don't). **/
function coldStart(): void {
  setSerializationOptions({sizeHistory: new Map(), stringBytesCache: new Map()});
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Byte-stability: decoding then re-encoding `view` reproduces the same wire bytes
 *  (the metamorphic round-trip from typeFuzz's O6 — robust to the optional-`undefined`
 *  / key-order differences a decoded-vs-original compare trips on). Confirms the
 *  cold-start seeding / grow-in-place didn't corrupt the bytes. **/
function wireStable(
  oracle: SizeOracleId,
  compiled: CompiledType,
  view: Uint8Array,
  ctx: SizeCtx,
  value: unknown
): SizeViolation[] {
  if (!compiled.wired.binaryDecode || !compiled.wired.binaryEncode) return [];
  try {
    const reencoded = compiled.wired.binaryEncode(compiled.wired.binaryDecode(view));
    if (!isDeepStrictEqual(reencoded, view))
      return [violation(oracle, compiled, ctx, 'binary round-trip is not byte-stable', value)];
  } catch (err) {
    return [violation(oracle, compiled, ctx, `decode/re-encode threw: ${errMsg(err)}`, value)];
  }
  return [];
}

/** In-bounds lane: a cold encode MUST NOT grow the buffer, and must round-trip. **/
export function checkInBounds(compiled: CompiledType, value: unknown, ctx: SizeCtx): SizeViolation[] {
  const seed = compiled.seed as number;
  const encode = compiled.wired.binaryEncode!;
  coldStart();
  let view: Uint8Array;
  try {
    view = encode(value);
  } catch (err) {
    return [violation('O-SIZE-ROUNDTRIP', compiled, ctx, `encode threw on an in-bounds value: ${errMsg(err)}`, value)];
  }
  const out: SizeViolation[] = [];
  if (view.buffer.byteLength !== seed) {
    out.push(
      violation(
        'O-SIZE-NOGROW',
        compiled,
        ctx,
        `cold buffer grew on an in-bounds value: capacity ${view.buffer.byteLength} != seed ${seed}`,
        value
      )
    );
  }
  out.push(...wireStable('O-SIZE-ROUNDTRIP', compiled, view, ctx, value));
  return out;
}

export interface OversizedResult {
  violation: SizeViolation | null;
  /** True when the oversized value actually grew the buffer — used to confirm the
   *  negative lane isn't vacuous. **/
  exercised: boolean;
}

/** Oversized (negative-control) lane: a cold encode SHOULD grow the buffer and
 *  still round-trip. If it did NOT grow, the inflation couldn't exceed this type's
 *  seed (no inflatable position) — not a violation, just not exercised. **/
export function checkOversized(compiled: CompiledType, value: unknown, ctx: SizeCtx): OversizedResult {
  const seed = compiled.seed as number;
  const encode = compiled.wired.binaryEncode!;
  coldStart();
  let view: Uint8Array;
  try {
    view = encode(value);
  } catch (err) {
    return {
      violation: violation('O-SIZE-GREW', compiled, ctx, `oversized value threw instead of growing: ${errMsg(err)}`, value),
      exercised: true,
    };
  }
  if (view.buffer.byteLength <= seed) return {violation: null, exercised: false};
  const rt = wireStable('O-SIZE-GREW', compiled, view, ctx, value);
  return {violation: rt[0] ?? null, exercised: true};
}
