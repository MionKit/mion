// The wire map: decode a VALID binary wire once through an instrumented
// deserializer and record every read the compiled decoder makes, with its byte
// offset and the reader it used. That list is the structure of the wire as the
// decoder itself sees it: each record is a position, and the reader names the
// kind, so a dictionary byte payload can be spliced at exactly the offset a
// count, a string length, a float, a discriminator or a bitmap byte lives at.
//
// Instrumentation wraps the deserializer INSTANCE (methods reassigned on the
// object, `view` swapped for a recording facade), so a compiled decoder body
// that calls `des.desString()` or `des.view.getFloat64(des.index, 1, …)` hits
// the wrappers without knowing. Nested reads (`desString` calling
// `desLength`) are collapsed into their outer record.
//
// Erasable TypeScript only: the worker thread loads this file natively.

import type {DataViewDeserializer} from '@mionjs/run-types';

/** The reader a compiled decoder used at one offset. **/
export type WireRead =
  | 'length'
  | 'string'
  | 'propName'
  | 'float64'
  | 'enum'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'bigint64'
  | 'biguint64'
  | 'temporal';

export interface WireRecord {
  read: WireRead;
  /** Byte offset of the first byte the read consumed. **/
  offset: number;
  /** Bytes consumed (0 when the read did not advance, e.g. a bitmap probe). **/
  length: number;
}

const DES_METHODS: Array<[keyof DataViewDeserializer, WireRead]> = [
  ['desLength', 'length'],
  ['desString', 'string'],
  ['desSafePropName', 'propName'],
  ['desFloat64', 'float64'],
  ['desEnum', 'enum'],
  ['desTemporalInstant', 'temporal'],
  ['desTemporalPlainTime', 'temporal'],
  ['desTemporalPlainDate', 'temporal'],
  ['desTemporalPlainDateTime', 'temporal'],
  ['desTemporalPlainYearMonth', 'temporal'],
];

const VIEW_METHODS: Array<[string, WireRead, number]> = [
  ['getFloat64', 'float64', 8],
  ['getUint8', 'uint8', 1],
  ['getUint16', 'uint16', 2],
  ['getUint32', 'uint32', 4],
  ['getInt8', 'int8', 1],
  ['getInt16', 'int16', 2],
  ['getInt32', 'int32', 4],
  ['getBigInt64', 'bigint64', 8],
  ['getBigUint64', 'biguint64', 8],
];

/** Instrument `des` in place and return the record sink. Every top-level read
 *  the decoder makes lands in `records`, in wire order. **/
export function instrumentDeserializer(des: DataViewDeserializer): WireRecord[] {
  const records: WireRecord[] = [];
  const target = des as unknown as Record<string, unknown>;
  let depth = 0;
  for (const [name, read] of DES_METHODS) {
    const original = target[name as string] as ((...args: unknown[]) => unknown) | undefined;
    if (typeof original !== 'function') continue;
    target[name as string] = function (this: unknown, ...args: unknown[]): unknown {
      const offset = des.index;
      depth++;
      try {
        return original.apply(des, args);
      } finally {
        depth--;
        if (depth === 0) records.push({read, offset, length: des.index - offset});
      }
    };
  }
  const realView = des.view;
  const facade: Record<string, unknown> = {};
  for (const [name, read, width] of VIEW_METHODS) {
    const original = (realView as unknown as Record<string, (...args: unknown[]) => unknown>)[name];
    facade[name] = (byteOffset: number, ...rest: unknown[]): unknown => {
      // Emitted reads fuse the index advance into a trailing argument
      // (`getFloat64(des.index, 1, (des.index += 8))`), so by the time the
      // call runs `des.index` may already sit past the read: record the
      // offset the caller passed, which is the byte the read starts at.
      if (depth === 0) records.push({read, offset: byteOffset, length: width});
      return original.call(realView, byteOffset, ...rest);
    };
  }
  Object.defineProperty(facade, 'byteLength', {get: () => realView.byteLength});
  Object.defineProperty(facade, 'buffer', {get: () => realView.buffer});
  Object.defineProperty(facade, 'byteOffset', {get: () => realView.byteOffset});
  target.view = facade;
  return records;
}
