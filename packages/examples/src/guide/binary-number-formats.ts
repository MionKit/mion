import {createBinaryEncoderFn} from '@mionjs/run-types';
import type * as TF from '@mionjs/run-types/formats';

interface Pixel {
  red: TF.UInt8; // 1 byte
  green: TF.UInt8; // 1 byte
  blue: TF.UInt8; // 1 byte
  alpha: number; // 8 bytes
}

const encodePixel = createBinaryEncoderFn<Pixel>();
encodePixel({red: 255, green: 128, blue: 0, alpha: 0.5}).byteLength; // 11
