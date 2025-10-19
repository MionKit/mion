/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export type StrictArrayBuffer = ArrayBuffer & {buffer?: undefined};

// ############################ IMPORTANT NOTE #####################################
// DO NOT CHAnGE THE INTERFACE NAMES AS THEY ARE HARDCODED IN THE JIT GENERATED CODE
// #################################################################################
export interface DataViewSerializer {
    index: number; // byte offset
    buffer: ArrayBuffer;
    view: DataView;
    reset: () => void;
    getBuffer: () => StrictArrayBuffer;
    // String encoding and caching
    textEncoder: TextEncoder;
    maxStrCacheLength: number;
    maxCacheSize: number;
    stringCache: Map<string, Uint8Array>;
    evictStringCache: () => void;
    // serialization functions
    serString(str: string): void;
    serFloat64(n: number): void;
    serEnum(n: number | string): void;
    setBitMask(bitMaskIndex: number, bitIndex: number): void;
    serAndCacheString(str: string): void;
}

export interface DataViewDeserializer {
    index: number; // byte offset
    buffer: StrictArrayBuffer;
    view: DataView;
    setBuffer: (buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) => void;
    // String decoding and caching
    textDecoder: TextDecoder;
    maxStrCacheLength: number;
    maxCacheSize: number;
    stringCache: Map<string, string>;
    evictStringCache: () => void;
    hashBytes: (bytes: Uint8Array, len: number) => string;
    // deserialization functions
    desString(): string;
    desFloat64(): number;
    desEnum(): number | string;
}
