import {createBinaryEncoderFn} from '@mionjs/run-types';
import type {UInt8} from '@mionjs/run-types/formats';

// start-formats
type Pixel = {r: UInt8; g: UInt8; b: UInt8};
type PlainPixel = {r: number; g: number; b: number};

const encodePixel = createBinaryEncoderFn<Pixel>();
const encodePlainPixel = createBinaryEncoderFn<PlainPixel>();

encodePixel({r: 255, g: 128, b: 0}).byteLength; // 3: one byte per channel
encodePlainPixel({r: 255, g: 128, b: 0}).byteLength; // 24: eight bytes per number
// end-formats

export {encodePixel, encodePlainPixel};
