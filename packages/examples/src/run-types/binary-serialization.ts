import {createBinaryEncoderFn, createBinaryDecoderFn} from '@mionjs/run-types';

interface User {
  name: string;
  age: number;
}

// start-to-binary
const toBinary = createBinaryEncoderFn<User>();
const buffer = toBinary({name: 'John', age: 30});
// Returns a Uint8Array with optimized binary encoding
// end-to-binary

// start-from-binary
const fromBinary = createBinaryDecoderFn<User>();
const user = fromBinary(buffer);
// user is now { name: 'John', age: 30 }
// end-from-binary
