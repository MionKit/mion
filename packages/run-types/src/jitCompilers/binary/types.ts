/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export type StrictArrayBuffer = ArrayBuffer & {buffer?: undefined};

export interface BinarySerializer {
    index: number;
    buffer: ArrayBuffer;
    uint32Array: Uint32Array;
    float32Array: Float32Array;
    float64Array: Float64Array;
    reset: () => void;
    getBuffer: () => StrictArrayBuffer;
    // String encoding and caching
    textEncoder: TextEncoder;
    maxStrLength: number;
    maxCacheSize: number;
    stringCache: Map<string, Uint8Array>;
    evictStringCache: () => void;
    // serialization functions
    serString(str: string): void;
    serFloat64(n: number): void;
    serNumber(n: number): void;
    serEnum(n: number | string): void;
}
export interface BinaryDeserializer {
    index: number;
    buffer: StrictArrayBuffer;
    uint32Array: Uint32Array;
    float32Array: Float32Array;
    float64Array: Float64Array;
    setBuffer: (buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) => void;
    // String decoding and caching
    textDecoder: TextDecoder;
    maxStrLength: number;
    maxCacheSize: number;
    stringCache: Map<string, string>;
    evictStringCache: () => void;
    hashBytes: (bytes: Uint8Array, len: number) => string;
    // deserialization functions
    desString(): string;
    desFloat64(): number;
    desNumber(): number;
    desEnum(): number | string;
}
