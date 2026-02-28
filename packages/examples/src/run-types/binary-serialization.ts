import {createToBinaryFn, createFromBinaryFn} from '@mionkit/run-types';

interface User {
    name: string;
    age: number;
}

// start-to-binary
const toBinary = await createToBinaryFn<User>();
const buffer = toBinary({name: 'John', age: 30});
// Returns Uint8Array with optimized binary encoding
// end-to-binary

// start-from-binary
const fromBinary = await createFromBinaryFn<User>();
const bufferInput = new Uint8Array(); // from previous example
const user = fromBinary(bufferInput);
// user is now { name: 'John', age: 30 }
// end-from-binary
