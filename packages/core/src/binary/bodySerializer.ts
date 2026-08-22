import {createDataViewSerializer, createPooledDataViewSerializer} from './dataView.ts';
import {acquireBuffer, isBufferPoolEnabled, type BufferLease} from './bufferPool.ts';
import {observationCount, predictSize, recordSize} from './sizeStats.ts';
import {MION_ROUTES, StatusCodes} from '../constants.ts';
import {RpcError} from '../errors.ts';
import {getOrCreateGlobal} from '../utils.ts';
import type {DataViewSerializer} from '../types/general.types.ts';
import type {MethodWithJitFns} from '../types/method.types.ts';

// ############# buffer strategy #############
//
// Two strategies, both sized from mion's own per-METHOD statistics (see ./sizeStats.ts):
//
//   adaptive — allocate an exact-size GROWING buffer. An underestimate costs one in-place grow
//              copy and can never throw, so this is the default and the fallback for everything.
//   pooled   — borrow a size-classed buffer from ./bufferPool.ts. Upstream disables growth on a
//              buffer it does not own, so an underestimate fails and we re-encode once through the
//              adaptive path. Only used where the platform gives us a safe release point.
//
// A method is only pooled once it has enough observations to support a high quantile: the
// compile-time cold-start estimate is tight (8 bytes for a `number` return), so pooling a cold
// route would guarantee a miss on its first requests.
//
// Sizing is per METHOD, never per request path. A routesFlow request merges several routes into ONE
// envelope, and the combination is usually new even when every member route is well observed — only
// per-method statistics can size it, by summing the parts.

/** quantile + headroom for the growing strategy — a miss is cheap, so size for the common case */
const ADAPTIVE_QUANTILE = 0.9;
const ADAPTIVE_PAD = 1.25;
/** quantile + headroom for the pooled strategy — a miss costs a re-encode and the buffer is reused
 *  anyway, so size for the largest payload in the window */
const POOLED_QUANTILE = 1;
const POOLED_PAD = 1.25;
/** observations a method needs before it may be written into a pooled (non-growing) buffer */
const POOL_WARMUP_OBSERVATIONS = 8;
/** per-method framing allowance for the cold-start estimate: the key string + its varint prefix */
const KEY_OVERHEAD_BYTES = 24;
/** the envelope's own uint32 item count */
const ENVELOPE_HEADER_BYTES = 4;
/** floor for a cold buffer, so a tiny estimate still absorbs framing jitter */
const MIN_COLD_START_BYTES = 64;

/** Counters for how the binary lane actually behaved. Real observability, and what the pooled
 *  specs assert against so a test cannot pass without exercising the path it claims to cover. */
export interface BinaryStrategyStats {
    /** envelopes written into a pooled (non-growing) buffer */
    pooled: number;
    /** envelopes written into a freshly allocated growing buffer */
    adaptive: number;
    /** pooled attempts that outran the borrowed buffer and were re-encoded on a growing one */
    retries: number;
}

// process-wide singleton, like the pool and the size stats it reports on
const strategyStats = getOrCreateGlobal<BinaryStrategyStats>('mion.core.binary.strategyStats', () => ({
    pooled: 0,
    adaptive: 0,
    retries: 0,
}));

export function getBinaryStrategyStats(): BinaryStrategyStats {
    return {...strategyStats};
}

export function resetBinaryStrategyStats(): void {
    strategyStats.pooled = 0;
    strategyStats.adaptive = 0;
    strategyStats.retries = 0;
}

/** Result of serializing a binary body. The payload is `view` (zero-copy, valid until `release()`);
 *  callers needing an owned copy use `serializer.getBuffer()`. */
export interface BinaryBodyResult {
    serializer: DataViewSerializer;
    /** zero-copy view of exactly the bytes written */
    view: Uint8Array;
    /** returns a pooled buffer to the pool. Idempotent, and a no-op for un-pooled buffers. */
    release(): void;
}

/** Cold-start size for ONE method, from the compile-time per-type estimate its `tb` tuple carries,
 *  so an unseen method is sized to its TYPE rather than to a flat default. */
function coldStartSize(method: MethodWithJitFns, isResponse: boolean): number {
    const estimate = isResponse ? method.returnBinarySizeEstimate : method.paramsBinarySizeEstimate;
    return (estimate ?? 0) + KEY_OVERHEAD_BYTES;
}

/** Predicted envelope size for this request: the header plus every method that will actually be
 *  written, each predicted from its OWN recent sizes.
 *
 *  Summing per method is what makes routesFlow work — its merged chain is a combination the router
 *  may never have served before, but its parts have been. It is also why the whole chain must not
 *  be summed blindly: a binary route's chain carries the metadata middleFn, whose union return type
 *  estimates ~80 KiB but whose value is undefined on every normal request, so `willSerialize` skips
 *  it. Including it made a cold request allocate 82 KB for a 17-byte payload. */
function predictBufferSize(
    executionChain: MethodWithJitFns[],
    body: Record<string, any>,
    isResponse: boolean,
    pooled: boolean
): number {
    const quantile = pooled ? POOLED_QUANTILE : ADAPTIVE_QUANTILE;
    const pad = pooled ? POOLED_PAD : ADAPTIVE_PAD;
    let total = ENVELOPE_HEADER_BYTES;
    for (let i = 0; i < executionChain.length; i++) {
        const method = executionChain[i];
        if (!willSerialize(method.id, method, body[method.id], isResponse)) continue;
        total += predictSize(method.id, isResponse, quantile, pad, coldStartSize(method, isResponse));
    }
    return Math.max(total, MIN_COLD_START_BYTES);
}

/** True when every method this envelope will carry has enough history to size a non-growing buffer.
 *  Per method, so a routesFlow envelope is pool-eligible as soon as its members are — the merged
 *  combination itself never needs to have been served before. */
function isWarm(executionChain: MethodWithJitFns[], body: Record<string, any>, isResponse: boolean): boolean {
    for (let i = 0; i < executionChain.length; i++) {
        const method = executionChain[i];
        if (!willSerialize(method.id, method, body[method.id], isResponse)) continue;
        if (observationCount(method.id, isResponse) < POOL_WARMUP_OBSERVATIONS) return false;
    }
    return true;
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
    isResponse: boolean
): BinaryBodyResult {
    if (isBufferPoolEnabled() && isWarm(executionChain, body, isResponse)) {
        const pooledResult = serializePooled(path, executionChain, body, isResponse);
        if (pooledResult) return pooledResult;
        // The pooled attempt could not produce the envelope. It is an OPTIMISATION, so it never
        // decides the response: fall through and encode again on a growing buffer, which is the
        // reference path and cannot overflow. A failure there is the real failure and is what
        // surfaces. The sizes the failed attempt observed are real bytes, so the next request is
        // already sized for this payload — no fabricated escalation needed.
        strategyStats.retries++;
    }

    const size = predictBufferSize(executionChain, body, isResponse, false);
    const serializer = createDataViewSerializer(path, size);
    try {
        writeEnvelope(serializer, executionChain, body, isResponse);
    } catch (err: any) {
        throw toRpcError(err, isResponse);
    }
    strategyStats.adaptive++;
    return finish(serializer, undefined);
}

/** One attempt on a borrowed, non-growing buffer. Returns undefined (having returned the buffer) if
 *  the envelope could not be written — the caller re-encodes on the adaptive path rather than this
 *  code guessing from an error type whether the buffer was merely too small, which it cannot tell:
 *  a RangeError raised inside a compiled `toBinary` looks exactly like an out-of-bounds write. */
function serializePooled(
    path: string,
    executionChain: MethodWithJitFns[],
    body: Record<string, any>,
    isResponse: boolean
): BinaryBodyResult | undefined {
    const size = predictBufferSize(executionChain, body, isResponse, true);
    const lease = acquireBuffer(size);
    const serializer = createPooledDataViewSerializer(path, lease.buffer);
    try {
        writeEnvelope(serializer, executionChain, body, isResponse);
    } catch {
        lease.release();
        return undefined;
    }
    // Not every overflow throws: upstream's varint writer drops out-of-range byte writes while the
    // cursor advances past the end, so a payload can outrun the buffer silently. This is the exact
    // signal for that, and it is checked BEFORE the view is taken (getBufferView would throw).
    if (serializer.index > serializer.buffer.byteLength) {
        lease.release();
        return undefined;
    }
    strategyStats.pooled++;
    return finish(serializer, lease);
}

/** Builds the result over whatever buffer the serializer ended up on. */
function finish(serializer: DataViewSerializer, lease: BufferLease | undefined): BinaryBodyResult {
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
    serializer.ensureCapacity?.(ENVELOPE_HEADER_BYTES);
    serializer.index += ENVELOPE_HEADER_BYTES;

    let itemsLength = 0;
    // serialize each method's value (return value for responses, params for requests)
    for (let i = 0; i < executionChain.length; i++) {
        const method = executionChain[i];
        const key = method.id;
        const value = body[key];
        const start = serializer.index;
        if (serializeMethod(key, method, value, serializer, isResponse)) {
            itemsLength++;
            // Recorded HERE, per method and inline, so the next request benefits immediately rather
            // than waiting on the socket to drain — and so a routesFlow envelope teaches every
            // route it carried, not just the combination it happened to be.
            recordSize(key, serializer.index - start, isResponse);
        }
    }
    // Write items length at reserved index 0
    serializer.view.setUint32(itemsLengthIndex, itemsLength, true);
    return serializer;
}

function toRpcError(err: any, isResponse: boolean): RpcError<string> {
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
 *  loop and the size prediction so the two can never disagree about what is on the wire. */
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
