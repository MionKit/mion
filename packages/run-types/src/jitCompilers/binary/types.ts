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
}
export interface BinaryDeserializer {
    index: number;
    buffer: StrictArrayBuffer;
    uint32Array: Uint32Array;
    float32Array: Float32Array;
    float64Array: Float64Array;
    setBuffer: (buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) => void;
}
