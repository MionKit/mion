import {createToBinaryFn, createFromBinaryFn} from '@mionkit/run-types';

interface User {
    name: string;
    age: number;
}

// start-to-binary
async function toBinaryExample() {
    const toBinary = await createToBinaryFn<User>();
    const buffer = toBinary({name: 'John', age: 30});
    // Returns Uint8Array with optimized binary encoding
}
// end-to-binary

// start-from-binary
async function fromBinaryExample() {
    const fromBinary = await createFromBinaryFn<User>();
    const buffer = new Uint8Array(); // from previous example
    const user = fromBinary(buffer);
    // user is now { name: 'John', age: 30 }
}
// end-from-binary
