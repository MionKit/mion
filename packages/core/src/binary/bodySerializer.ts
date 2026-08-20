import {createDataViewSerializer, createPooledDataViewSerializer} from './dataView.ts';
import {acquireBuffer, isBufferPoolEnabled, sizeClassFor, type BufferLease} from './bufferPool.ts';
import {observationCount, predictSize, recordSize} from './sizeStats.ts';
import {MION_ROUTES, StatusCodes} from '../constants.ts';
import {RpcError} from '../errors.ts';
import type {DataViewSerializer} from '../types/general.types.ts';
import type {MethodWithJitFns} from '../types/method.types.ts';

// ############# buffer strategy #############
//
// Two strategies, both sized from mion's own per-route statistics (see ./sizeStats.ts):
//
//   adaptive — allocate an exact-size GROWING buffer. An underestimate costs one in-place grow
//              copy and can never throw, so this is the default and the fallback for everything.
//   pooled   — borrow a size-classed buffer from ./bufferPool.ts. Upstream disables growth on a
//              buffer it does not own, so an underestimate THROWS and we re-encode once through
//              the adaptive path. Only used where the platform gives us a safe release point.
//
// A route is only pooled once it has enough observations to support a high quantile: the
// compile-time cold-start estimate is tight (8 bytes for a `number` return), so pooling a cold
// route would guarantee an overflow-retry on its first requests.

/** quantile + headroom for the growing strategy — a miss is cheap, so size for the common case */
const ADAPTIVE_QUANTILE = 0.9;
const ADAPTIVE_PAD = 1.25;
/** quantile + headroom for the pooled strategy — a miss costs a re-encode, so cover the tail */
const POOLED_QUANTILE = 0.99;
const POOLED_PAD = 1.25;
/** observations required before a route may use a pooled (non-growing) buffer */
const POOL_WARMUP_OBSERVATIONS = 8;
/** per-method framing allowance for the cold-start estimate: the key string + its varint prefix */
const KEY_OVERHEAD_BYTES = 24;
/** the envelope's own uint32 item count */
const ENVELOPE_HEADER_BYTES = 4;
/** floor for a cold buffer, so a tiny estimate still absorbs framing jitter */
const MIN_COLD_START_BYTES = 64;

/** Result of serializing a binary body. The payload is `view` (zero-copy, valid until `release()`);
 *  callers needing an owned copy use `serializer.getBuffer()`. */
export interface BinaryBodyResult {
    serializer: DataViewSerializer;
    /** zero-copy view of exactly the bytes written */
    view: Uint8Array;
    /** returns a pooled buffer to the pool. Idempotent, and a no-op for un-pooled buffers. */
    release(): void;
}

/** Cold-start size from the compile-time per-type estimates the `tb` tuples carry, so an unseen
 *  route is sized to its TYPE rather than to a flat default.
 *
 *  Counts ONLY the methods that will actually be written — using the same predicate the write loop
 *  uses. Summing the whole chain blindly is badly wrong: a binary route's chain carries the metadata
 *  middleFn, whose union return type estimates ~80 KiB but whose value is undefined on every normal
 *  request, so it is skipped. Including it made a cold request allocate 82 KB for a 17-byte payload. */
function coldStartSize(executionChain: MethodWithJitFns[], body: Record<string, any>, isResponse: boolean): number {
    let total = ENVELOPE_HEADER_BYTES;
    for (let i = 0; i < executionChain.length; i++) {
        const method = executionChain[i];
        if (!willSerialize(method.id, method, body[method.id], isResponse)) continue;
        const estimate = isResponse ? method.returnBinarySizeEstimate : method.paramsBinarySizeEstimate;
        if (estimate === undefined) continue;
        total += estimate + KEY_OVERHEAD_BYTES;
    }
    return Math.max(total, MIN_COLD_START_BYTES);
}

/** Predicted buffer size for this request, from mion's own recent-size ring. For routesFlow the
 *  member routes are summed — upstream's relatedKeys path would fall back to a full default buffer
 *  PER cold member. */
function predictBufferSize(
    path: string,
    executionChain: MethodWithJitFns[],
    body: Record<string, any>,
    isResponse: boolean,
    pooled: boolean,
    workflowRouteIds?: string[]
): number {
    const quantile = pooled ? POOLED_QUANTILE : ADAPTIVE_QUANTILE;
    const pad = pooled ? POOLED_PAD : ADAPTIVE_PAD;
    const cold = coldStartSize(executionChain, body, isResponse);
    if (workflowRouteIds?.length) {
        let total = ENVELOPE_HEADER_BYTES;
        for (const routeId of workflowRouteIds) total += predictSize(routeId, quantile, pad, cold, pooled);
        return total;
    }
    return predictSize(path, quantile, pad, cold, pooled);
}

/** True when this route may use a pooled, non-growing buffer. */
function shouldPool(path: string, workflowRouteIds?: string[]): boolean {
    if (!isBufferPoolEnabled()) return false;
    // routesFlow spans several keys; require every member to be warm before trusting the sum
    if (workflowRouteIds?.length) {
        return workflowRouteIds.every((id) => observationCount(id) >= POOL_WARMUP_OBSERVATIONS);
    }
    return observationCount(path) >= POOL_WARMUP_OBSERVATIONS;
}

/**
 * Serializes API body to binary format using JIT-compiled serialization functions.
 * Combines the results of all body methods into a single binary buffer.
 *
 * Note: This function assumes all methods in executionChain have valid JIT functions.
 * Methods with noop JIT functions or undefined values should be filtered out before calling this function,
 * or handled by the caller. Any serialization errors will be thrown as RpcError.
 */
export function serializeBinaryBody(
    path: string,
    executionChain: MethodWithJitFns[],
    body: Record<string, any>,
    isResponse: boolean,
    workflowRouteIds?: string[]
): BinaryBodyResult {
    if (shouldPool(path, workflowRouteIds)) {
        const size = predictBufferSize(path, executionChain, body, isResponse, true, workflowRouteIds);
        const lease = acquireBuffer(size);
        const capacity = lease.buffer.byteLength;
        try {
            const serializer = createPooledDataViewSerializer(path, lease.buffer);
            return finish(path, writeEnvelope(serializer, executionChain, body, isResponse), lease);
        } catch (err: any) {
            lease.release();
            // An overflow means the prediction was too tight for THIS payload. Anything else is a
            // real failure and must not be retried into silence.
            if (!isCapacityOverflow(err)) throw toRpcError(err, isResponse);
            // Escalate the route's class so the next request does not repeat the miss, then fall
            // through and re-encode once on a growing buffer, which cannot overflow.
            recordSize(path, sizeClassFor(capacity + 1));
        }
    }

    const size = predictBufferSize(path, executionChain, body, isResponse, false, workflowRouteIds);
    try {
        const serializer = createDataViewSerializer(path, size);
        return finish(path, writeEnvelope(serializer, executionChain, body, isResponse), undefined);
    } catch (err: any) {
        throw toRpcError(err, isResponse);
    }
}

/** Records the observed size and builds the result. Recording happens HERE, not in release(), so
 *  the next request benefits immediately rather than waiting on the socket to drain. */
function finish(path: string, serializer: DataViewSerializer, lease: BufferLease | undefined): BinaryBodyResult {
    recordSize(path, serializer.getLength());
    let released = false;
    return {
        serializer,
        view: serializer.getBufferView(),
        release(): void {
            if (released) return;
            released = true;
            lease?.release();
        },
    };
}

/** Writes the multi-method envelope: [uint32 item count, (key, value)...]. */
function writeEnvelope(
    serializer: DataViewSerializer,
    executionChain: MethodWithJitFns[],
    body: Record<string, any>,
    isResponse: boolean
): DataViewSerializer {
    // Reserve space for items length at index 0 (will be written after counting)
    const itemsLengthIndex = serializer.index;
    serializer.index += 4;

    let itemsLength = 0;
    // serialize each method's value (return value for responses, params for requests)
    for (let i = 0; i < executionChain.length; i++) {
        const method = executionChain[i];
        const key = method.id;
        const value = body[key];
        if (serializeMethod(key, method, value, serializer, isResponse)) {
            itemsLength++;
        }
    }
    // Write items length at reserved index 0
    serializer.view.setUint32(itemsLengthIndex, itemsLength, true);
    return serializer;
}

/** True for the out-of-bounds errors a non-growing buffer raises when the payload outruns it.
 *  Deliberately narrow — a failure from anywhere else must surface, not be retried away. Upstream
 *  raises RangeError from DataView/TypedArray out-of-bounds writes and from its own encodeInto
 *  truncation guard; all of them mean "this buffer was too small". */
function isCapacityOverflow(err: unknown): boolean {
    return err instanceof RangeError;
}

function toRpcError(err: any, isResponse: boolean): RpcError {
    if (err instanceof RpcError) return err;
    return new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: isResponse ? 'binary-response-Serialization-error' : 'binary-request-Serialization-error',
        publicMessage: `Failed to serialize body to binary: ${err?.message || 'unknown error'}`,
        originalError: err,
    });
}

/**
 * Serializes a single method's value to binary format.
 * Returns true if the method was serialized, false if it was skipped.
 */
function serializeMethod(
    key: string,
    method: MethodWithJitFns,
    value: any,
    serializer: DataViewSerializer,
    isResponse: boolean
): boolean {
    if (!willSerialize(key, method, value, isResponse)) return false;
    const toBinary = isResponse ? method.returnJitFns.toBinary : method.paramsJitFns.toBinary;
    // serialize key
    serializer.serString(key);
    // serialize value
    toBinary!.fn(value, serializer);
    return true;
}

/** Whether a method contributes bytes to the envelope. Single source of truth, shared by the write
 *  loop and the cold-start estimate so the two can never disagree about what is on the wire. */
function willSerialize(key: string, method: MethodWithJitFns, value: any, isResponse: boolean): boolean {
    const toBinary = isResponse ? method.returnJitFns.toBinary : method.paramsJitFns.toBinary;
    if (!toBinary?.fn || toBinary.isNoop) return false;
    // skip @thrownErrors - should be handled separately by the caller if needed
    if (key === MION_ROUTES.thrownErrors) return false;
    // skip methods without return data or undefined values (for responses)
    if (isResponse && (!method.hasReturnData || typeof value === 'undefined')) return false;
    // skip methods with no params (for requests) or noop serialization
    if (!isResponse && typeof value === 'undefined') return false;
    return true;
}
