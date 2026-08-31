// DataView-based binary serializer + deserializer ported from the reference
// implementation. Wire format:
//   - Little-endian.
//   - Strings: `[varint length (LEB128), utf8 bytes]`.
//   - Numbers: float64.
//   - Enums: `[uint32 typeTag (1=string, 2=number), value]`.
//   - Optional-property bitmaps: 1 bit per optional prop, 8 per byte.
//
// Two ported optimisations:
//   - String bytes cache — short strings (<64 chars) are UTF-8-encoded once
//     and blitted on repeat encodes. Bounded with half-LRU eviction.
//   - Adaptive buffer sizing — pre-allocates from per-key Welford statistics
//     (running mean + variance), allocating `mean + sizeMultiplier × stddev`
//     so the headroom tracks the observed payload spread instead of a fixed
//     multiple of the average. Falls back to `defaultBufferSize` on a cold
//     cache. Keyed on the caller-supplied `cacheKey`.
//
// The serializer also GROWS IN PLACE: write methods reserve capacity via
// `ensureCapacity`, which copies the written prefix into a larger buffer when a
// payload exceeds the prediction. An above-average payload therefore costs one
// buffer copy, never a throw + re-encode-from-scratch.
//
// Tune via `setSerializationOptions({...})`. The `sizeHistory` and
// `stringBytesCache` overrides let tests / multi-tenant consumers scope state.

const STR = 1;
const NUM = 2;
const POW_2_32 = 2 ** 32;
const LE = true;

// String length prefixes use an unsigned LEB128 varint instead of a fixed
// uint32, so a string of N UTF-8 bytes costs ceil(7-bit groups) length bytes:
// 1 byte for N < 128 (the common short-string case — names, ids, enum values),
// 2 for N < 16384, up to 5 at the 2**32 ceiling. This trims 3 bytes off every
// short string versus the old 4-byte prefix. MAX_VARINT bounds the gap the
// encode-in-place path leaves before back-shifting the bytes.
const MAX_VARINT = 5;

/** Byte width of the unsigned LEB128 encoding of `n` (n < 2**32). **/
function varintLen(n: number): number {
  if (n < 0x80) return 1;
  if (n < 0x4000) return 2;
  if (n < 0x200000) return 3;
  if (n < 0x10000000) return 4;
  return 5;
}

/** UTF-8 byte length of `str` WITHOUT encoding it — matches `TextEncoder` output
 *  exactly (a surrogate pair counts as one 4-byte code point). Used by the sizing
 *  serializer so a measure pass needs no allocation. **/
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

// Ambient declarations — the package's tsconfig sets `types: []` so DOM
// globals aren't visible. TextEncoder/Decoder are universally available.
declare const TextEncoder: {
  new (): {encodeInto(input: string, dest: Uint8Array): {written?: number; read?: number}};
};
declare const TextDecoder: {
  new (): {decode(input?: ArrayBufferView | ArrayBuffer): string};
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ── Temporal binary packing ──
//
// The Temporal types with a fixed, ISO-representable layout are packed as
// integers instead of the wide toJSON() string (the most space-inefficient
// binary encoding possible). The value shapes are declared structurally and
// the runtime constructors reached through a loosely-typed global, so this
// file stays independent of whether the consuming tsconfig's `lib` declares
// the Temporal types — real Temporal (native Node 26+ or the test polyfill)
// backs them at runtime.
//
// Layouts (little-endian, encode order == decode order):
//   Instant         int64 seconds + int32 sub-second nanoseconds (12 B)
//   PlainTime       u8 hour/minute/second + u16 ms/us/ns (9 B)
//   PlainDate       u8 isoDisc, (iso) i32 year + u8 month + u8 day
//                               (non-iso) serString(toJSON())
//   PlainDateTime   u8 isoDisc, (iso) date + time, (non-iso) string
//   PlainYearMonth  u8 isoDisc, (iso) i32 year + u8 month, (non-iso) string
//
// PlainDate/PlainDateTime/PlainYearMonth carry a 1-byte ISO-calendar
// discriminator so a non-ISO calendar (Hebrew, Islamic, …) round-trips
// losslessly via the string fallback without forcing every value onto the
// wide encoding.
const NANOS_PER_SECOND = 1_000_000_000n;
const ISO_CALENDAR = 'iso8601';

interface InstantValue {
  epochNanoseconds: bigint;
}
interface PlainTimeValue {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  microsecond: number;
  nanosecond: number;
}
interface CalendarValue {
  calendarId: string;
  toJSON(): string;
}
interface PlainDateValue extends CalendarValue {
  year: number;
  month: number;
  day: number;
}
interface PlainDateTimeValue extends CalendarValue, PlainTimeValue {
  year: number;
  month: number;
  day: number;
}
interface PlainYearMonthValue extends CalendarValue {
  year: number;
  month: number;
}

// Temporal constructors used to rebuild values on decode — only the
// statics/constructors the packer calls.
interface TemporalConstructors {
  Instant: {fromEpochNanoseconds(ns: bigint): unknown};
  PlainTime: new (
    hour: number,
    minute: number,
    second: number,
    millisecond: number,
    microsecond: number,
    nanosecond: number
  ) => unknown;
  PlainDate: {from(iso: string): unknown; new (year: number, month: number, day: number): unknown};
  PlainDateTime: {
    from(iso: string): unknown;
    new (
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
      millisecond: number,
      microsecond: number,
      nanosecond: number
    ): unknown;
  };
  PlainYearMonth: {from(iso: string): unknown; new (year: number, month: number): unknown};
}

// lazy global accessor — resolved per call so module load order (the test
// setup installs the polyfill global before any test) never matters
const temporalRuntime = (): TemporalConstructors => (globalThis as unknown as {Temporal: TemporalConstructors}).Temporal;

/** Tagged ArrayBuffer with the SharedArrayBuffer carve-out. **/
export type StrictArrayBuffer = ArrayBuffer & {__brand?: 'StrictArrayBuffer'};

/** Buffer-like input for the deserializer. **/
export type BinaryInput = StrictArrayBuffer | ArrayBufferView;

/** Per-key Welford accumulator over observed payload sizes. `mean` is the
 *  running average bytes-written; `m2` is the sum of squared deviations from
 *  which sample variance (and thus stddev) is derived. **/
export interface SizeStats {
  count: number;
  mean: number;
  m2: number;
}

/** Tunable serializer behaviour. **/
export interface SerializationOptions {
  /** Cold-start buffer size, used until a key has size history AND no
   *  compile-time estimate was supplied. Default 16 KiB (`2 ** 14`). The
   *  `dynamic` binary encoder normally seeds from the per-type estimate
   *  instead, so this only applies to value-first / plugin-inactive paths. **/
  defaultBufferSize: number;
  /** Sigma multiplier for headroom: `allocSize = mean + sizeMultiplier * stddev`.
   *  Default 2 (≈ covers payloads up to two standard deviations above the mean
   *  in one shot; larger ones grow in place). **/
  sizeMultiplier: number;
  /** Strings shorter than this bypass the bytes cache. Default 64. **/
  maxStrCacheLength: number;
  /** Half-LRU eviction triggers above this. Default 1000. **/
  maxCacheSize: number;
  /** Cache-key → Welford size statistics. Pass a fresh `Map` to scope. **/
  sizeHistory: Map<string, SizeStats>;
  /** Source-string → cached UTF-8 bytes. Pass a fresh `Map` to scope. **/
  stringBytesCache: Map<string, Uint8Array>;
}

const moduleSizeHistory = new Map<string, SizeStats>();
const moduleStringBytesCache = new Map<string, Uint8Array>();

const DEFAULTS: SerializationOptions = {
  defaultBufferSize: 2 ** 14,
  sizeMultiplier: 2,
  maxStrCacheLength: 64,
  maxCacheSize: 1000,
  sizeHistory: moduleSizeHistory,
  stringBytesCache: moduleStringBytesCache,
};

let opts: SerializationOptions = {...DEFAULTS};

/** Patches the active serialization options. Unspecified fields keep their
 *  current value. **/
export function setSerializationOptions(patch: Partial<SerializationOptions>): void {
  opts = {...opts, ...patch};
}

/** Public interface implemented by DataViewSerializerImpl. **/
export interface DataViewSerializer {
  readonly buffer: ArrayBuffer;
  /** Stable string used for size-history bucketing — typically the runtype hash. **/
  readonly cacheKey: string;
  index: number;
  view: DataView;
  hasEnded: boolean;
  /** Per-write capacity reserve, used by the Go-emitted body and the serializer's
   *  own writers as `Ser.ensureCapacity?.(n)`. Present (a grow function) only in
   *  'dynamic' mode; `undefined` in 'precalculate' / 'initial', so every reserve
   *  site short-circuits. **/
  ensureCapacity?: (this: DataViewSerializer, extraBytes: number) => void;
  reset(): void;
  resize(size: number): void;
  getBuffer(): StrictArrayBuffer;
  getBufferView(): Uint8Array;
  markAsEnded(): void;
  getLength(): number;
  serLength(value: number): void;
  serString(str: string, skipCache?: boolean): void;
  serFloat64(n: number): void;
  serEnum(n: number | string): void;
  setBitMask(bitMaskIndex: number, bitIndex: number): void;
  serTemporalInstant(value: InstantValue): void;
  serTemporalPlainTime(value: PlainTimeValue): void;
  serTemporalPlainDate(value: PlainDateValue): void;
  serTemporalPlainDateTime(value: PlainDateTimeValue): void;
  serTemporalPlainYearMonth(value: PlainYearMonthValue): void;
}

/** Public interface implemented by DataViewDeserializerImpl. **/
export interface DataViewDeserializer {
  readonly buffer: StrictArrayBuffer;
  readonly cacheKey: string;
  index: number;
  view: DataView;
  hasEnded: boolean;
  reset(): void;
  setBuffer(buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number): void;
  markAsEnded(): void;
  getLength(): number;
  desLength(): number;
  desString(): string;
  desSafePropName(): string;
  desFloat64(): number;
  desEnum(): number | string;
  desTemporalInstant(): unknown;
  desTemporalPlainTime(): unknown;
  desTemporalPlainDate(): unknown;
  desTemporalPlainDateTime(): unknown;
  desTemporalPlainYearMonth(): unknown;
}

/** Optional args for `createDataViewSerializer`. `size` is an explicit
 *  override; `relatedKeys` predicts via sum-of-averages; `grow` (default `true`)
 *  arms in-place growth — pass `false` for the fixed-size strategies
 *  ('precalculate' / 'initialSize' / 'intoBuffer') so the serializer never reserves or
 *  reallocates. `buffer` wraps a caller-supplied `ArrayBuffer` (the `intoBuffer` strategy)
 *  instead of allocating one; growth is always off for it (we cannot resize a
 *  caller's buffer without breaking their reference). **/
export interface CreateSerializerOptions {
  size?: number;
  relatedKeys?: string[];
  grow?: boolean;
  buffer?: ArrayBuffer;
  /** Cold-start buffer size used when the key has NO history yet — the
   *  compile-time per-type estimate the `dynamic` binary encoder passes,
   *  replacing the `defaultBufferSize` fallback. History still refines from the
   *  first real encode (estimate seeds, never overrides). **/
  coldStartSize?: number;
}

/** Creates a DataView-based serializer. **/
export function createDataViewSerializer(cacheKey: string, options?: CreateSerializerOptions | number): DataViewSerializer {
  // Caller-supplied buffer (the `intoBuffer` strategy): wrap it, never grow it.
  if (typeof options === 'object' && options.buffer !== undefined) {
    return new DataViewSerializerImpl(cacheKey, options.buffer.byteLength, false, options.buffer);
  }
  // Number overload kept for back-compat with standard callers.
  const explicitSize = typeof options === 'number' ? options : options?.size;
  const relatedKeys = typeof options === 'object' ? options.relatedKeys : undefined;
  const coldStartSize = typeof options === 'object' ? options.coldStartSize : undefined;
  const grow = typeof options === 'object' && options.grow !== undefined ? options.grow : true;
  const size = explicitSize ?? predictBufferSize(cacheKey, relatedKeys, coldStartSize);
  if (size >= POW_2_32) throw new Error('bufferSize must be strictly less than 2 ** 32');
  return new DataViewSerializerImpl(cacheKey, size, grow);
}

/** Creates a deserializer from ArrayBuffer or any typed-array view. **/
export function createDataViewDeserializer(cacheKey: string, input: BinaryInput): DataViewDeserializer {
  if (ArrayBuffer.isView(input)) {
    const buffer = input.buffer as StrictArrayBuffer;
    return new DataViewDeserializerImpl(cacheKey, buffer, input.byteOffset, input.byteLength);
  }
  return new DataViewDeserializerImpl(cacheKey, input as StrictArrayBuffer);
}

/** Sum of historical averages for related keys, or the single key's average,
 *  falling back to `coldStartSize` (the compile-time estimate) then
 *  `defaultBufferSize` on a cold cache. **/
function predictBufferSize(cacheKey: string, relatedKeys?: string[], coldStartSize?: number): number {
  if (relatedKeys && relatedKeys.length) {
    let total = 0;
    for (const key of relatedKeys) total += sizeForKey(key);
    return total;
  }
  return sizeForKey(cacheKey, coldStartSize);
}

/** Predict from Welford stats: `mean + sizeMultiplier * stddev`. A tight
 *  prediction is safe because the serializer grows in place on a miss — under-
 *  allocation costs one buffer copy, not a throw. Until the key has been
 *  observed, falls back to `coldStartSize` (the compile-time per-type estimate)
 *  when supplied, else the cold-start `defaultBufferSize`. **/
function sizeForKey(key: string, coldStartSize?: number): number {
  const stats = opts.sizeHistory.get(key);
  if (stats === undefined || stats.count === 0) return coldStartSize ?? opts.defaultBufferSize;
  // Sample variance (Bessel-corrected); zero for a single observation.
  const variance = stats.count > 1 ? stats.m2 / (stats.count - 1) : 0;
  const stddev = Math.sqrt(variance);
  return Math.ceil(stats.mean + opts.sizeMultiplier * stddev);
}

/** Welford online update of the per-key mean + variance accumulator. Unlike the
 *  previous EMA it keeps an unbiased running mean/variance over ALL observations
 *  (see SizeStats); regime-shift responsiveness is the documented trade-off. **/
function recordObservedSize(cacheKey: string, observed: number): void {
  const stats = opts.sizeHistory.get(cacheKey) ?? {count: 0, mean: 0, m2: 0};
  stats.count += 1;
  const delta = observed - stats.mean;
  stats.mean += delta / stats.count;
  stats.m2 += delta * (observed - stats.mean);
  opts.sizeHistory.set(cacheKey, stats);
}

/** Half-LRU eviction. **/
function evictStringBytesCache(): void {
  const cache = opts.stringBytesCache;
  const entries = Array.from(cache.entries());
  cache.clear();
  for (let i = Math.floor(entries.length / 2); i < entries.length; i++) {
    cache.set(entries[i][0], entries[i][1]);
  }
}

/** The grow function assigned to a serializer's `ensureCapacity` member in
 *  'dynamic' mode. A single shared reference, so `Ser.ensureCapacity?.(n)` call
 *  sites stay monomorphic. 'precalculate' / 'initial' leave the member `undefined`,
 *  so the same call sites short-circuit (never invoked, the size arg never
 *  evaluated). Grows geometrically but at least to the exact deficit, so a one-off
 *  large payload settles in a single copy; throws only at the `2 ** 32` ceiling. **/
function growEnsureCapacity(this: DataViewSerializer, extraBytes: number): void {
  const required = this.index + extraBytes;
  if (required <= this.buffer.byteLength) return;
  if (required >= POW_2_32)
    throw new RangeError(`DataViewSerializer: payload exceeds max buffer size (need ${required} bytes, max ${POW_2_32}).`);
  let nextSize = this.buffer.byteLength * 2;
  if (nextSize < required) nextSize = required;
  if (nextSize >= POW_2_32) nextSize = required;
  this.resize(nextSize);
}

class DataViewSerializerImpl implements DataViewSerializer {
  buffer: ArrayBuffer;
  private uint8View: Uint8Array;
  readonly cacheKey: string;
  index: number = 0;
  view: DataView;
  hasEnded: boolean = false;
  // Per-instance capacity reserve. Set to the shared `growEnsureCapacity` only in
  // 'dynamic' mode; left `undefined` for 'precalculate' / 'initial' so every
  // `this.ensureCapacity?.(n)` / `Ser.ensureCapacity?.(n)` reserve short-circuits
  // (the call is not made and `n` is not evaluated).
  ensureCapacity?: (this: DataViewSerializer, extraBytes: number) => void;
  constructor(cacheKey: string, size: number, grow: boolean = true, existingBuffer?: ArrayBuffer) {
    this.cacheKey = cacheKey;
    // `existingBuffer` is a caller-supplied buffer (the `intoBuffer` strategy) we wrap
    // instead of allocating; otherwise allocate `size` bytes.
    this.buffer = existingBuffer ?? new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.uint8View = new Uint8Array(this.buffer);
    if (grow) this.ensureCapacity = growEnsureCapacity;
  }
  reset(): void {
    this.index = 0;
    this.hasEnded = false;
  }
  resize(size: number): void {
    // Preserve the already-written prefix (up to the new size) so a grow never
    // discards work — callers no longer have to re-encode from a clean index.
    const old = this.uint8View;
    const keep = Math.min(this.index, size);
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.uint8View = new Uint8Array(this.buffer);
    if (keep > 0) this.uint8View.set(old.subarray(0, keep));
  }
  /** Reserve room for a string write. Worst-case UTF-8 is 3 bytes per UTF-16
   *  code unit, plus the max-width varint gap the encode-in-place path leaves
   *  before the bytes; reserving it up front means `encodeInto` can never
   *  truncate. When that worst case would top the `2 ** 32` ceiling (only for
   *  multi-GB strings whose real UTF-8 size may still fit) grow as far as the
   *  ceiling allows and let the post-encode guard reject a genuinely
   *  unencodable one. **/
  private reserveForString(charLength: number): void {
    const worstCase = MAX_VARINT + charLength * 3;
    if (this.index + worstCase < POW_2_32) this.ensureCapacity?.(worstCase);
    else this.ensureCapacity?.(POW_2_32 - 1 - this.index);
  }
  /** Write `value` as an unsigned LEB128 varint at the cursor, advancing it. **/
  private writeVarint(value: number): void {
    while (value > 0x7f) {
      this.uint8View[this.index++] = (value & 0x7f) | 0x80;
      value = value >>> 7;
    }
    this.uint8View[this.index++] = value;
  }
  /** Write a length / count / size prefix as an unsigned LEB128 varint. Reserves
   *  exactly `varintLen(value)` — the width `writeVarint` is about to emit, since
   *  `value` is known here — rather than the worst-case `MAX_VARINT`. The tight
   *  reserve still can't overflow (it equals the write) and keeps a cold dynamic
   *  buffer (seeded at the per-type estimate, which budgets the same varint width)
   *  from growing on the framing of an in-bounds collection. One byte for values
   *  < 128 — the common small-collection case — versus the old fixed 4. **/
  serLength(value: number): void {
    this.ensureCapacity?.(varintLen(value));
    this.writeVarint(value);
  }
  /** Encode `str` into the buffer immediately after an OPTIMISTIC 1-byte varint
   *  slot, then write the actual length prefix. A string whose UTF-8 length is
   *  < 128 (the common case) needs only that 1 byte, so the bytes already sit in
   *  the right place and no shift happens. Only a longer string (varint > 1 byte)
   *  shifts its bytes right to open room for the wider prefix. Returns the UTF-8
   *  byte count. Callers MUST have reserved `MAX_VARINT + str.length * 3` first. **/
  private encodeStringAtCursor(str: string): number {
    const dataStart = this.index + 1;
    const result = textEncoder.encodeInto(str, this.uint8View.subarray(dataStart));
    const read = result.read ?? 0;
    // `encodeInto` silently truncates on small destinations; the reservation
    // above prevents that, so this guard only catches an internal accounting bug.
    if (read < str.length)
      throw new RangeError(`DataViewSerializer: buffer too small to encode string (wrote ${read}/${str.length} chars).`);
    const written = result.written ?? 0;
    const vlen = varintLen(written);
    // Wider prefix than the 1-byte slot: shift the bytes right to make room
    // (copyWithin is memmove-safe for the overlapping right shift).
    if (vlen > 1) this.uint8View.copyWithin(this.index + vlen, dataStart, dataStart + written);
    this.writeVarint(written);
    this.index += written;
    return written;
  }
  getBuffer(): StrictArrayBuffer {
    return this.buffer.slice(0, this.index) as StrictArrayBuffer;
  }
  getBufferView(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.index);
  }
  markAsEnded(): void {
    this.hasEnded = true;
    recordObservedSize(this.cacheKey, this.index);
  }
  getLength(): number {
    return this.index;
  }
  serString(str: string, skipCache?: boolean): void {
    // Long strings or explicit bypass: encode straight into the buffer. Reserve
    // the worst-case UTF-8 size (≤3 bytes per UTF-16 code unit) up front so
    // `encodeInto` never truncates and we never re-encode on a buffer miss.
    if (str.length >= opts.maxStrCacheLength || skipCache) {
      this.reserveForString(str.length);
      this.encodeStringAtCursor(str);
      return;
    }
    const cached = opts.stringBytesCache.get(str);
    if (cached) {
      // Known byte length — write the varint prefix then blit the cached bytes
      // directly after it, no gap and no shift.
      this.ensureCapacity?.(varintLen(cached.length) + cached.length);
      this.writeVarint(cached.length);
      this.uint8View.set(cached, this.index);
      this.index += cached.length;
      return;
    }
    // Cache miss: encode in place, then snapshot the written bytes. The slice
    // copies (mandatory — the working buffer is overwritten on later writes).
    this.ensureCapacity?.(MAX_VARINT + str.length * 3);
    const written = this.encodeStringAtCursor(str);
    if (opts.stringBytesCache.size >= opts.maxCacheSize) evictStringBytesCache();
    opts.stringBytesCache.set(str, this.uint8View.slice(this.index - written, this.index));
  }
  serFloat64(n: number): void {
    this.ensureCapacity?.(8);
    this.view.setFloat64(this.index, n, LE);
    this.index += 8;
  }
  serEnum(n: number | string): void {
    if (typeof n === 'number') {
      this.ensureCapacity?.(8);
      this.view.setUint32(this.index, NUM, LE);
      this.index += 4;
      this.view.setUint32(this.index, n, LE);
      this.index += 4;
      return;
    }
    this.ensureCapacity?.(4);
    this.view.setUint32(this.index, STR, LE);
    this.index += 4;
    this.serString(n);
  }
  setBitMask(bitMaskIndex: number, bitIndex: number): void {
    const newBitmask = this.view.getUint8(bitMaskIndex) | (1 << bitIndex);
    this.view.setUint8(bitMaskIndex, newBitmask);
  }
  serTemporalInstant(value: InstantValue): void {
    this.ensureCapacity?.(12);
    // BigInt / and % both truncate toward zero, so the (possibly negative)
    // remainder recombines exactly: seconds * 1e9 + subNs === epochNanoseconds.
    this.view.setBigInt64(this.index, value.epochNanoseconds / NANOS_PER_SECOND, LE);
    this.index += 8;
    this.view.setInt32(this.index, Number(value.epochNanoseconds % NANOS_PER_SECOND), LE);
    this.index += 4;
  }
  serTemporalPlainTime(value: PlainTimeValue): void {
    this.writePlainTimeFields(value);
  }
  serTemporalPlainDate(value: PlainDateValue): void {
    if (value.calendarId !== ISO_CALENDAR) return this.serNonIsoFallback(value);
    this.serByte(1);
    this.writePlainDateFields(value);
  }
  serTemporalPlainDateTime(value: PlainDateTimeValue): void {
    if (value.calendarId !== ISO_CALENDAR) return this.serNonIsoFallback(value);
    this.serByte(1);
    this.writePlainDateFields(value);
    this.writePlainTimeFields(value);
  }
  serTemporalPlainYearMonth(value: PlainYearMonthValue): void {
    if (value.calendarId !== ISO_CALENDAR) return this.serNonIsoFallback(value);
    this.serByte(1);
    this.ensureCapacity?.(4);
    this.view.setInt32(this.index, value.year, LE);
    this.index += 4;
    this.serByte(value.month);
  }
  /** non-ISO calendar: 0 disc + the lossless toJSON() string **/
  private serNonIsoFallback(value: CalendarValue): void {
    this.serByte(0);
    this.serString(value.toJSON());
  }
  private serByte(value: number): void {
    this.ensureCapacity?.(1);
    this.view.setUint8(this.index, value);
    this.index += 1;
  }
  private writePlainDateFields(value: {year: number; month: number; day: number}): void {
    this.ensureCapacity?.(4);
    this.view.setInt32(this.index, value.year, LE);
    this.index += 4;
    this.serByte(value.month);
    this.serByte(value.day);
  }
  private writePlainTimeFields(value: PlainTimeValue): void {
    this.serByte(value.hour);
    this.serByte(value.minute);
    this.serByte(value.second);
    this.ensureCapacity?.(6);
    this.view.setUint16(this.index, value.millisecond, LE);
    this.index += 2;
    this.view.setUint16(this.index, value.microsecond, LE);
    this.index += 2;
    this.view.setUint16(this.index, value.nanosecond, LE);
    this.index += 2;
  }
}

// A DataView-shaped sink whose writes are no-ops and whose only read (`getUint8`,
// used by setBitMask) returns 0. The sizing serializer points its `view` here so
// the Go-emitted raw writes (`Ser.view.setFloat64(Ser.index, v, 1, (Ser.index +=
// 8))`, `setUint8(Ser.index++, …)`, …) still advance `index` via their fused
// argument expressions but touch no buffer.
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

/** Measure-pass serializer: runs the SAME Go-emitted `toBinary` body as the real
 *  encoder, but every write is a no-op and only `index` advances — so after a run
 *  `getLength()` is EXACTLY the byte count the real encoder would produce (same
 *  code path, same branches, formats, temporal packing, union arms, deps). Used
 *  by `createBinaryEncoderFn(value, {sizing: 'precalculate'})` to size the buffer up
 *  front so no inline write can overflow. Only `serString`/`serLength` need overriding
 *  (they would otherwise touch the buffer); every other framing method is
 *  inherited unchanged, so the size rules can never drift from the encoder. **/
class SizingSerializerImpl extends DataViewSerializerImpl {
  constructor(cacheKey: string) {
    // grow=false leaves `ensureCapacity` undefined, so every inherited writer's
    // `this.ensureCapacity?.(n)` reserve short-circuits — the measure pass never
    // allocates and only advances `index`.
    super(cacheKey, 0, false);
    this.view = sizingView;
  }
  resize(): void {}
  serString(str: string): void {
    // skipCache is irrelevant to size; the measure pass never touches the cache.
    const bytes = utf8ByteLength(str);
    this.index += varintLen(bytes) + bytes;
  }
  serLength(value: number): void {
    this.index += varintLen(value);
  }
}

/** Creates a measure-pass serializer (see SizingSerializerImpl). **/
export function createSizingSerializer(cacheKey: string): DataViewSerializer {
  return new SizingSerializerImpl(cacheKey);
}

class DataViewDeserializerImpl implements DataViewDeserializer {
  buffer: StrictArrayBuffer;
  private uint8View: Uint8Array;
  readonly cacheKey: string;
  index: number = 0;
  view: DataView;
  hasEnded: boolean = false;
  constructor(cacheKey: string, buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) {
    this.cacheKey = cacheKey;
    this.buffer = buffer;
    this.index = 0;
    this.view = new DataView(buffer, byteOffset, byteLength);
    this.uint8View = new Uint8Array(buffer, byteOffset, byteLength);
  }
  reset(): void {
    this.index = 0;
    this.hasEnded = false;
  }
  setBuffer(buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number): void {
    this.index = 0;
    this.buffer = buffer;
    this.view = new DataView(buffer, byteOffset, byteLength);
    this.uint8View = new Uint8Array(buffer, byteOffset, byteLength);
    this.hasEnded = false;
  }
  markAsEnded(): void {
    this.hasEnded = true;
  }
  getLength(): number {
    return this.index;
  }
  /** Read an unsigned LEB128 varint length / count / size prefix. Fast path for
   *  the common single-byte case (length < 128) — a plain read+compare, matching
   *  the old fixed `getUint32` cost. The `* 2 ** shift` accumulation (not `<<`)
   *  keeps the multi-byte case exact past the 32-bit boundary the top group can hit. **/
  desLength(): number {
    const first = this.uint8View[this.index];
    if (first < 0x80) {
      this.index++;
      return first;
    }
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = this.uint8View[this.index++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  }
  desString(): string {
    const len = this.desLength();
    const decoded = textDecoder.decode(this.uint8View.subarray(this.index, this.index + len));
    this.index += len;
    return decoded;
  }
  desSafePropName(): string {
    const key = this.desString();
    const len = key.length;
    if (len === 9) {
      if (key === '__proto__' || key === 'prototype') throw new Error(`Unsafe property name: ${key}`);
    } else if (len === 11) {
      if (key === 'constructor') throw new Error(`Unsafe property name: ${key}`);
    }
    return key;
  }
  desFloat64(): number {
    const value = this.view.getFloat64(this.index, LE);
    this.index += 8;
    return value;
  }
  desEnum(): number | string {
    const type = this.view.getUint32(this.index, LE);
    this.index += 4;
    if (type === NUM) {
      const value = this.view.getUint32(this.index, LE);
      this.index += 4;
      return value;
    }
    return this.desString();
  }
  desTemporalInstant(): unknown {
    const seconds = this.view.getBigInt64(this.index, LE);
    this.index += 8;
    const subNs = this.view.getInt32(this.index, LE);
    this.index += 4;
    return temporalRuntime().Instant.fromEpochNanoseconds(seconds * NANOS_PER_SECOND + BigInt(subNs));
  }
  desTemporalPlainTime(): unknown {
    const PlainTime = temporalRuntime().PlainTime;
    return new PlainTime(this.desByte(), this.desByte(), this.desByte(), this.desU16(), this.desU16(), this.desU16());
  }
  desTemporalPlainDate(): unknown {
    const Ctor = temporalRuntime().PlainDate;
    if (this.desByte() !== 1) return Ctor.from(this.desString());
    return new Ctor(this.desI32(), this.desByte(), this.desByte());
  }
  desTemporalPlainDateTime(): unknown {
    const Ctor = temporalRuntime().PlainDateTime;
    if (this.desByte() !== 1) return Ctor.from(this.desString());
    return new Ctor(
      this.desI32(),
      this.desByte(),
      this.desByte(),
      this.desByte(),
      this.desByte(),
      this.desByte(),
      this.desU16(),
      this.desU16(),
      this.desU16()
    );
  }
  desTemporalPlainYearMonth(): unknown {
    const Ctor = temporalRuntime().PlainYearMonth;
    if (this.desByte() !== 1) return Ctor.from(this.desString());
    return new Ctor(this.desI32(), this.desByte());
  }
  private desByte(): number {
    const value = this.view.getUint8(this.index);
    this.index += 1;
    return value;
  }
  private desU16(): number {
    const value = this.view.getUint16(this.index, LE);
    this.index += 2;
    return value;
  }
  private desI32(): number {
    const value = this.view.getInt32(this.index, LE);
    this.index += 4;
    return value;
  }
}
