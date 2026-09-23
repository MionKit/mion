import {
  BinaryDecodeError,
  createBinaryDecoderFn,
  createBinaryEncoderFn,
} from '@mionjs/run-types';

// start-errors
const encodeTags = createBinaryEncoderFn<string[]>();
const decodeTags = createBinaryDecoderFn<string[]>();

const bytes = encodeTags(['alpha', 'beta']);

try {
  decodeTags(bytes.subarray(0, bytes.length - 2)); // the last string is cut short
} catch (err) {
  if (err instanceof BinaryDecodeError) console.log(err.message);
}
// end-errors

export {decodeTags};
