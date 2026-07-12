/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ts-runtypes migration: the in-house seqproto-based implementation was replaced by
// the @ts-runtypes/core DataView serializer — the compiled toBinary/fromBinary functions
// are emitted against ITS wire protocol (varint lengths, string cache, Temporal support),
// so the serializer objects must come from the same package. This module keeps mion's
// historical creation signatures as thin proxies.

import {
    createDataViewSerializer as rtCreateDataViewSerializer,
    createDataViewDeserializer as rtCreateDataViewDeserializer,
    setSerializationOptions as rtSetSerializationOptions,
} from '@ts-runtypes/core';
import type {BinaryInput, DataViewSerializer, DataViewDeserializer} from '../types/general.types.ts';

/** Legacy mion serialization options, mapped onto the ts-runtypes equivalents. */
export interface SerializationOptions {
    /** initial buffer size when a route has no recorded size history (ts-runtypes defaultBufferSize) */
    bufferSize: number;
    /** stddev multiplier for the per-route predicted buffer size (ts-runtypes sizeMultiplier) */
    averageResponseSizeMultiplier: number;
    /** strings longer than this are never cached (ts-runtypes maxStrCacheLength) */
    maxStrCacheLength: number;
    /** max entries in the encoded-string cache (ts-runtypes maxCacheSize) */
    maxCacheSize: number;
}

/** Applies serialization options (proxied to the ts-runtypes DataView serializer). */
export function setSerializationOptions(options: Partial<SerializationOptions>) {
    rtSetSerializationOptions({
        ...(options.bufferSize !== undefined ? {defaultBufferSize: options.bufferSize} : {}),
        ...(options.averageResponseSizeMultiplier !== undefined ? {sizeMultiplier: options.averageResponseSizeMultiplier} : {}),
        ...(options.maxStrCacheLength !== undefined ? {maxStrCacheLength: options.maxStrCacheLength} : {}),
        ...(options.maxCacheSize !== undefined ? {maxCacheSize: options.maxCacheSize} : {}),
    });
}

/**
 * Creates a DataView-based serializer for binary serialization.
 * Buffer size is predicted from the route's recorded response sizes; for routesFlow
 * requests pass the involved route ids so their sizes are summed.
 */
export function createDataViewSerializer(routeId: string, workflowRouteIds?: string[]): DataViewSerializer {
    const options = workflowRouteIds?.length ? {relatedKeys: workflowRouteIds} : undefined;
    return rtCreateDataViewSerializer(routeId, options) as unknown as DataViewSerializer;
}

/** Creates a deserializer from ArrayBuffer or any typed array view (including Node.js Buffer) */
export function createDataViewDeserializer(routeId: string, input: BinaryInput): DataViewDeserializer {
    return rtCreateDataViewDeserializer(routeId, input as ArrayBuffer) as unknown as DataViewDeserializer;
}
