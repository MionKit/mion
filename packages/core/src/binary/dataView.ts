/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ts-runtypes migration: the in-house seqproto-based implementation was replaced by
// the @ts-runtypes/core DataView serializer — the compiled toBinary/fromBinary functions
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
} from '@ts-runtypes/core';
import type {BinaryInput, DataViewSerializer, DataViewDeserializer} from '../types/general.types.ts';
// NOTE: those types ARE @ts-runtypes/core's (re-exported), so no casting is needed below.

/** Creates a growing serializer over a freshly allocated buffer of exactly `size` bytes.
 *  An underestimate costs one in-place grow copy, never a throw. */
export function createDataViewSerializer(routeId: string, size: number): DataViewSerializer {
    return rtCreateDataViewSerializer(routeId, {size, grow: true});
}

/** Creates a NON-growing serializer over a caller-owned (pooled) buffer. Upstream cannot resize a
 *  buffer it does not own, so overflow throws — callers must be prepared to re-encode. */
export function createPooledDataViewSerializer(routeId: string, buffer: ArrayBuffer): DataViewSerializer {
    return rtCreateDataViewSerializer(routeId, {buffer});
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
