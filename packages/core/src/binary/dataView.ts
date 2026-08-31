/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ts-runtypes migration: the in-house seqproto-based implementation was replaced by
// the @mionjs/run-types DataView serializer — the compiled toBinary/fromBinary functions
// are emitted against ITS wire protocol (varint lengths, string cache, Temporal support),
// so the serializer objects must come from the same package.
//
// mion decides the BUFFER, ts-runtypes does the ENCODING. Every serializer created here is given
// an explicit `size` or a caller-owned `buffer`, so upstream's own predictor is never consulted and
// its module-global `sizeHistory` is never written to (mion never calls the serializer's
// markAsEnded, which is what records into it). Sizing lives in ./sizeStats.ts, buffer reuse in
// ./bufferPool.ts.

import {
  createDataViewSerializer as rtCreateDataViewSerializer,
  createDataViewDeserializer as rtCreateDataViewDeserializer,
} from '@mionjs/run-types';
import type {BinaryInput, DataViewSerializer, DataViewDeserializer} from '../types/general.types.ts';
// NOTE: those types ARE @mionjs/run-types's (re-exported), so no casting is needed below.

/** Creates a growing serializer over a freshly allocated buffer of exactly `size` bytes.
 *  An underestimate costs one in-place grow copy, never a throw. */
export function createDataViewSerializer(routeId: string, size: number): DataViewSerializer {
  return rtCreateDataViewSerializer(routeId, {size, grow: true});
}

/** Creates a NON-growing serializer over a caller-owned (pooled) buffer. Upstream cannot resize a
 *  buffer it does not own, so a payload that outruns the buffer fails instead of growing — callers
 *  must be prepared to re-encode (see serializeBinaryBody).
 *
 *  mion deliberately does NOT install its own grow reserve here, even though it owns the buffer and
 *  could move the serializer off it: upstream reserves the WORST-CASE UTF-8 size for a string it has
 *  not cached (`MAX_VARINT + charLength * 3`, since `encodeInto` must not be allowed to truncate).
 *  A reserve-driven grow would therefore fire on any payload carrying a string of 64 chars or more —
 *  measured: a 50 KB string reserves 150 KB and grows off a 64 KiB class that its real bytes fit in
 *  three times over, on every single request. The optimistic non-growing write keeps the pooled
 *  buffer for every payload that genuinely fits, and the rare miss costs one re-encode. */
export function createPooledDataViewSerializer(routeId: string, buffer: ArrayBuffer): DataViewSerializer {
  return rtCreateDataViewSerializer(routeId, {buffer});
}

// ############# measure pass #############
//
// Upstream builds one of these internally for `sizeStrategy: 'precalculate'` but does not export it,
// so mion assembles the same thing from the PUBLIC DataViewSerializer surface:
//
//   - created with {size: 0, grow: false}, so `ensureCapacity` is undefined and every inherited
//     writer's reserve short-circuits — the measure pass never allocates;
//   - `view` points at a sink whose writes are no-ops, so the Go-emitted body's fused writes
//     (`Ser.view.setFloat64(Ser.index, v, 1, (Ser.index += 8))`) still advance the cursor and touch
//     nothing. `getUint8` returns 0 for setBitMask's read-modify-write;
//   - `serString` / `serLength` are the only methods that would otherwise touch the buffer, so they
//     are replaced by their exact byte-width equivalents.
//
// Everything else — framing, formats, Temporal packing, union arms — runs the SAME emitted code as
// the real encode, which is what makes the count exact rather than an estimate. mion only
// reimplements the two methods that would touch the buffer, so drift can only come from the LEB128
// width or the UTF-8 count — `packages/router/src/routes/measurePass.spec.ts` pins measured ==
// written on real compiled encoders across both, so a change upstream fires the tripwire instead of
// silently handing out a buffer that comes up short.

const sizingView = {
  setUint8() {},
  setUint16() {},
  setUint32() {},
  setInt8() {},
  setInt16() {},
  setInt32() {},
  setFloat64() {},
  setBigInt64() {},
  setBigUint64() {},
  getUint8() {
    return 0;
  },
} as unknown as DataView;

/** Byte width of the unsigned LEB128 encoding of `n` — the wire's length-prefix width. */
function varintLen(n: number): number {
  if (n < 0x80) return 1;
  if (n < 0x4000) return 2;
  if (n < 0x200000) return 3;
  if (n < 0x10000000) return 4;
  return 5;
}

/** UTF-8 byte length of `str` WITHOUT encoding it — matches TextEncoder exactly (a surrogate pair
 *  counts as one 4-byte code point). */
function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: pair with the next unit into one 4-byte code point.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function sizingSerString(this: DataViewSerializer, str: string): void {
  const bytes = utf8ByteLength(str);
  this.index += varintLen(bytes) + bytes;
}

function sizingSerLength(this: DataViewSerializer, value: number): void {
  this.index += varintLen(value);
}

/** Creates a measure-pass serializer: running a compiled `toBinary` against it leaves `getLength()`
 *  holding EXACTLY the bytes the real encoder would write, having allocated and written nothing. */
export function createSizingSerializer(): DataViewSerializer {
  const serializer = rtCreateDataViewSerializer('mion-sizing', {size: 0, grow: false});
  serializer.view = sizingView;
  serializer.resize = () => {};
  serializer.serString = sizingSerString;
  serializer.serLength = sizingSerLength;
  return serializer;
}

/** Creates a deserializer from ArrayBuffer or any typed array view (including Node.js Buffer) */
export function createDataViewDeserializer(routeId: string, input: BinaryInput): DataViewDeserializer {
  return rtCreateDataViewDeserializer(routeId, input as ArrayBuffer);
}

/**
 * Narrows a serializer's buffer view to the `Uint8Array<ArrayBuffer>` that `BodyInit` accepts.
 *
 * `getBufferView()` is typed `Uint8Array`, which since TS 5.7 means `Uint8Array<ArrayBufferLike>` --
 * and `ArrayBufferLike` admits `SharedArrayBuffer`, which `BodyInit` rejects. The DataView
 * serializer always allocates a plain `ArrayBuffer` (`new ArrayBuffer(size)`, and `resize()` does
 * the same), so the narrowing is sound. Used by the fetch-style platform adapters, which all pass
 * this straight into `new Response(...)`.
 */
export function toResponseBody(view: Uint8Array): Uint8Array<ArrayBuffer> {
  return view as Uint8Array<ArrayBuffer>;
}
