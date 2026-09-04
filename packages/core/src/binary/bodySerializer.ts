import {createDataViewSerializer, createPooledDataViewSerializer, createSizingSerializer} from './dataView.ts';
import {acquireBuffer, isBufferPoolEnabled, sizeClassFor, type BufferLease} from './bufferPool.ts';
import {observationCount, predictSize, recordSize} from './sizeStats.ts';
import {StatusCodes} from '../constants.ts';
import {RpcError} from '../errors.ts';
import {getOrCreateGlobal} from '../utils.ts';
import type {DataViewSerializer, MionTypeFn, ToBinaryFn} from '../types/general.types.ts';
import type {MethodWithJitFns} from '../types/method.types.ts';

// ############# buffer strategy #############
//
// The buffer for a request comes from one of two places, and its SIZE from one of two methods.
//
// Where the bytes live:
//   adaptive — a freshly allocated GROWING buffer. An underestimate costs one in-place grow copy and
//              can never throw, so this is the fallback for everything.
//   pooled   — a size-classed buffer borrowed from ./bufferPool.ts. Upstream disables growth on a
//              buffer it does not own, so an underestimate fails and the envelope is re-encoded once
//              on the adaptive path. Only used where the platform gives us a safe release point.
//
// How the size is decided:
//   predicted — sum of each contributing method's own recent-size quantile (see ./sizeStats.ts).
//               One pass over the chain, no allocation, but it sizes for the worst recent case.
//   measured  — a MEASURE PASS (./dataView.ts) runs the same emitted toBinary against a no-op sink,
//               so the byte count is exact. Costs one extra traversal of the value graph.
//
// Measuring is gated on VOLATILITY, not on size: if a method's recent window is steady enough that
// its typical and worst-case envelopes land in the SAME pool size class, the buffer is identical
// either way and measuring is pure cost. They only diverge for payloads that swing across classes —
// which is exactly where summing per-method maxima over-allocates. Measured over a routesFlow whose
// membership and sizes both vary (packages/router/src/routes/routesFlowBuffer.bench.ts):
//
//   predicted-only  24.6x the payload in buffer bytes, 80 KB peak per request
//   measured-only    2.6x,  32 KB peak — but a measure pass on every response, ~30% slower
//   straddle gate    2.7x,  32 KB peak, and steady traffic never measures at all
//
// The same bench answers the other open question: giving each route its own buffer and merging them
// on the way out is worse on every axis (3.8x the allocations, 1.6x the peak, an extra memcpy of the
// whole payload, 10% slower), because every part rounds up to the pool's smallest class.
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
/** the typical envelope, used ONLY to decide whether the window straddles a size class */
const TYPICAL_QUANTILE = 0.5;
/** observations a method needs before its size window can be trusted to size a buffer at all */
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
  /** envelopes whose size came from a measure pass rather than from the size statistics */
  measured: number;
  /** pooled attempts that outran the borrowed buffer and were re-encoded on a growing one */
  retries: number;
}

// process-wide singleton, like the pool and the size stats it reports on
const strategyStats = getOrCreateGlobal<BinaryStrategyStats>('mion.core.binary.strategyStats', () => ({
  pooled: 0,
  adaptive: 0,
  measured: 0,
  retries: 0,
}));

export function getBinaryStrategyStats(): BinaryStrategyStats {
  return {...strategyStats};
}

export function resetBinaryStrategyStats(): void {
  strategyStats.pooled = 0;
  strategyStats.adaptive = 0;
  strategyStats.measured = 0;
  strategyStats.retries = 0;
}

/** Result of serializing a binary body. The payload is `view` (zero-copy, valid until `release()`);
 *  callers needing an owned copy use `serializer.getBuffer()`. */
export interface BinaryBodyResult {
  serializer: DataViewSerializer;
  /** zero-copy view of exactly the bytes written */
  view: Uint8Array;
  /** returns a pooled buffer to the pool. Idempotent, and a no-op for un-pooled buffers.
   *  A property, not a method: callers destructure it, which would unbind a method. */
  release: () => void;
}

/** Cold-start size for ONE method, from the compile-time per-type estimate its `tb` tuple carries,
 *  so an unseen method is sized to its TYPE rather than to a flat default. */
function coldStartSize(method: MethodWithJitFns, isResponse: boolean): number {
  const estimate = isResponse ? method.returnBinarySizeEstimate : method.paramsBinarySizeEstimate;
  return (estimate ?? 0) + KEY_OVERHEAD_BYTES;
}

/** The methods that will actually put bytes on the wire for THIS request, resolved once.
 *
 *  `willSerialize` is not expensive per method, but it was being re-evaluated on every walk over the
 *  chain — plan, measure and write — on a lane whose whole purpose is per-request cost. Resolving it
 *  once also caches what each walk would otherwise re-derive: the `toBinary` function for the
 *  direction, and the value out of `body`. Caching the VALUE additionally guarantees the measure
 *  pass and the write pass see the same object, which a getter that does not return the same thing
 *  twice could otherwise break — that was the one way a MEASURED pooled size could still overflow. */
interface WriteList {
  /** contributing methods, `length` entries valid */
  methods: MethodWithJitFns[];
  /** each method's compiled `toBinary` for this direction, same index */
  fns: ToBinaryFn[];
  /** each method's value out of `body`, same index */
  values: any[];
  length: number;
  /** the direction the list was resolved for */
  isResponse: boolean;
}

// Reused so the common request costs no allocation — the buffer pool exists to avoid exactly this
// kind of per-request garbage. Serialization is synchronous, so the only way a second list can be
// live at once is a compiled `toBinary` re-entering serializeBinaryBody; `inUse` catches that and
// hands the inner call a fresh list rather than letting it clobber the outer walk. Module-local on
// purpose: under a dual core load each copy gets its own scratch, which is still correct.
const scratchList: WriteList = {methods: [], fns: [], values: [], length: 0, isResponse: true};
let scratchInUse = false;

/** Resolves the contributing methods for this request into a reusable list. */
function acquireWriteList(executionChain: MethodWithJitFns[], body: Record<string, any>, isResponse: boolean): WriteList {
  let list: WriteList;
  if (scratchInUse) list = {methods: [], fns: [], values: [], length: 0, isResponse};
  else {
    scratchInUse = true;
    list = scratchList;
  }
  let n = 0;
  for (let i = 0; i < executionChain.length; i++) {
    const method = executionChain[i];
    const value = body[method.id];
    const toBinary = isResponse ? method.returnJitFns.toBinary : method.paramsJitFns.toBinary;
    if (!willSerialize(method, value, toBinary, isResponse)) continue;
    list.methods[n] = method;
    list.fns[n] = toBinary!.fn as ToBinaryFn;
    list.values[n] = value;
    n++;
  }
  list.length = n;
  list.isResponse = isResponse;
  return list;
}

/** Returns the scratch list, dropping the request's value references so nothing is retained. */
function releaseWriteList(list: WriteList): void {
  if (list !== scratchList) return;
  for (let i = 0; i < list.length; i++) {
    list.methods[i] = undefined as any;
    list.fns[i] = undefined as any;
    list.values[i] = undefined;
  }
  list.length = 0;
  scratchInUse = false;
}

/** How this envelope will be sized, decided in ONE pass over the chain. */
interface BufferPlan {
  /** bytes to ask for */
  size: number;
  /** true when `size` came from the measure pass, and so cannot be too small */
  measured: boolean;
  /** true when every contributing method has enough history to size a non-growing buffer */
  warm: boolean;
}

/** Plans the buffer for this request: the header plus every method that will actually be written,
 *  each predicted from its OWN recent sizes.
 *
 *  Summing per method is what makes routesFlow work — its merged chain is a combination the router
 *  may never have served before, but its parts have been. It is also why the whole chain must not be
 *  summed blindly: a binary route's chain carries the metadata middleFn, whose union return type
 *  estimates ~80 KiB but whose value is undefined on every normal request, so `willSerialize` skips
 *  it. Including it made a cold request allocate 82 KB for a 17-byte payload. */
function planBuffer(list: WriteList, isResponse: boolean, pooled: boolean): BufferPlan {
  const quantile = pooled ? POOLED_QUANTILE : ADAPTIVE_QUANTILE;
  const pad = pooled ? POOLED_PAD : ADAPTIVE_PAD;
  let worst = ENVELOPE_HEADER_BYTES;
  let typical = ENVELOPE_HEADER_BYTES;
  let warm = true;
  for (let i = 0; i < list.length; i++) {
    const method = list.methods[i];
    const cold = coldStartSize(method, isResponse);
    worst += predictSize(method.id, isResponse, quantile, pad, cold);
    typical += predictSize(method.id, isResponse, TYPICAL_QUANTILE, 1, cold);
    if (observationCount(method.id, isResponse) < POOL_WARMUP_OBSERVATIONS) warm = false;
  }
  worst = Math.max(worst, MIN_COLD_START_BYTES);
  // The adaptive buffer GROWS, so an underestimate there costs one in-place copy and an
  // overestimate is freed with the request — neither is worth an extra traversal to avoid.
  // Measuring is for the pooled buffer, which has to be right first time and whose over-allocation
  // is retained in a size class across requests.
  if (!pooled) return {size: worst, measured: false, warm};
  // A steady window puts both ends in the same size class, so an exact count would buy the same
  // buffer: only measure when the two disagree, or when there is no history to disagree with.
  if (warm && sizeClassFor(typical) === sizeClassFor(worst)) return {size: worst, measured: false, warm};
  const measured = measureEnvelope(list);
  strategyStats.measured++;
  return {size: measured, measured: true, warm};
}

/** Exact byte count for this envelope, from a measure pass over the same emitted encoders. */
function measureEnvelope(list: WriteList): number {
  const sizer = createSizingSerializer();
  writeEnvelope(sizer, list, false);
  return sizer.index;
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
  const list = acquireWriteList(executionChain, body, isResponse);
  try {
    if (isBufferPoolEnabled()) {
      const plan = planBuffer(list, isResponse, true);
      // a measured size cannot be too small, so it needs no warm-up: a cold route pools at once
      if (plan.measured || plan.warm) {
        const pooledResult = serializePooled(path, list, plan);
        if (pooledResult) return pooledResult;
        // The pooled attempt could not produce the envelope. It is an OPTIMISATION, so it
        // never decides the response: fall through and encode again on a growing buffer,
        // which is the reference path and cannot overflow. A failure there is the real
        // failure and is what surfaces. The sizes the failed attempt observed are real
        // bytes, so the next request is already sized for this payload — no fabricated
        // escalation needed.
        strategyStats.retries++;
      }
    }

    const plan = planBuffer(list, isResponse, false);
    const serializer = createDataViewSerializer(path, plan.size);
    try {
      writeEnvelope(serializer, list, true);
    } catch (err: any) {
      throw toRpcError(err, isResponse);
    }
    strategyStats.adaptive++;
    return finish(serializer, undefined);
  } finally {
    releaseWriteList(list);
  }
}

/** One attempt on a borrowed, non-growing buffer. Returns undefined (having returned the buffer) if
 *  the envelope could not be written — the caller re-encodes on the adaptive path rather than this
 *  code guessing from an error type whether the buffer was merely too small, which it cannot tell:
 *  a RangeError raised inside a compiled `toBinary` looks exactly like an out-of-bounds write. */
function serializePooled(path: string, list: WriteList, plan: BufferPlan): BinaryBodyResult | undefined {
  const lease = acquireBuffer(plan.size);
  const serializer = createPooledDataViewSerializer(path, lease.buffer);
  try {
    writeEnvelope(serializer, list, true);
  } catch {
    lease.release();
    return undefined;
  }
  // Not every overflow throws: upstream's varint writer drops out-of-range byte writes while the
  // cursor advances past the end, so a payload can outrun the buffer silently. This is the exact
  // signal for that, and it is checked BEFORE the view is taken (getBufferView would throw). A
  // MEASURED size can only land here if the value changed between the two passes — a getter that
  // does not return the same thing twice — which is exactly when the re-encode is what saves it.
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
    release: (): void => {
      if (released) return;
      released = true;
      lease?.release();
    },
  };
}

/** Writes the multi-method envelope: [uint32 item count, (key, value)...]. */
function writeEnvelope(
  serializer: DataViewSerializer,
  list: WriteList,
  /** false for the measure pass — it writes nothing, so it has nothing to observe */
  record: boolean
): DataViewSerializer {
  // Reserve space for items length at index 0 (will be written after counting)
  const itemsLengthIndex = serializer.index;
  serializer.ensureCapacity?.(ENVELOPE_HEADER_BYTES);
  serializer.index += ENVELOPE_HEADER_BYTES;

  // every method in the list contributes, so the count is known before the loop
  const isResponse = list.isResponse;
  for (let i = 0; i < list.length; i++) {
    const key = list.methods[i].id;
    const start = serializer.index;
    serializer.serString(key);
    list.fns[i](list.values[i], serializer);
    // Recorded HERE, per method and inline, so the next request benefits immediately rather
    // than waiting on the socket to drain — and so a routesFlow envelope teaches every route it
    // carried, not just the combination it happened to be.
    if (record) recordSize(key, serializer.index - start, isResponse);
  }
  // Write items length at reserved index 0
  serializer.view.setUint32(itemsLengthIndex, list.length, true);
  return serializer;
}

function toRpcError(err: any, isResponse: boolean): RpcError<string> {
  if (err instanceof RpcError) return err;
  return new RpcError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: isResponse ? 'binary-response-Serialization-error' : 'binary-request-Serialization-error',
    // Fixed text: the engine message stays on originalError for the server logs
    publicMessage: `Failed to serialize ${isResponse ? 'response' : 'request'} body to binary`,
    originalError: err,
  });
}

/** Whether a method contributes bytes to the envelope. Evaluated ONCE per request, when the write
 *  list is resolved, so the plan, measure and write passes cannot disagree about what is on the
 *  wire — they all read the same list. */
function willSerialize(
  method: MethodWithJitFns,
  value: any,
  toBinary: MionTypeFn<ToBinaryFn> | undefined,
  isResponse: boolean
): boolean {
  if (!toBinary?.fn || toBinary.isNoop) return false;
  // `@thrownErrors` is NOT skipped: it is not a member of any execution chain, so it reaches this
  // point only when the caller deliberately appended it (see the router's serializeBinaryBody),
  // and dropping it there is what left a binary client with an empty envelope for a thrown error.
  // skip methods without return data or undefined values (for responses)
  if (isResponse && (!method.hasReturnData || typeof value === 'undefined')) return false;
  // skip methods with no params (for requests) or noop serialization
  if (!isResponse && typeof value === 'undefined') return false;
  return true;
}
