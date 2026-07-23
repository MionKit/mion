import {createBinaryEncoder, createBinaryDecoder} from '@ts-runtypes/core';

interface User {
    name: string;
    age: number;
}

// start-to-binary
const toBinary = createBinaryEncoder<User>();
const buffer = toBinary({name: 'John', age: 30});
// Returns a Uint8Array with optimized binary encoding
// end-to-binary

// start-from-binary
const fromBinary = createBinaryDecoder<User>();
const user = fromBinary(buffer);
// user is now { name: 'John', age: 30 }
// end-from-binary
