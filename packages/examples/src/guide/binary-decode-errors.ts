import {
  createBinaryDecoderFn,
  createValidateFn,
  BinaryDecodeError,
} from '@mionjs/run-types';

interface Reading {
  sensor: string;
  value: number;
}

const decodeReading = createBinaryDecoderFn<Reading>();
const isReading = createValidateFn<Reading>();

export function readReading(bytes: Uint8Array) {
  let reading: unknown;
  try {
    reading = decodeReading(bytes);
  } catch (err) {
    if (err instanceof BinaryDecodeError)
      throw new Error(`Bad reading bytes: ${err.message}`);
    throw err;
  }
  if (!isReading(reading)) throw new Error('Invalid reading');
  return reading;
}
