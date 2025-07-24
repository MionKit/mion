/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// native javascript objects that are not serializable
export const nonSerializableClasses = [
    // TODO: decide what to do with native errors, they should be easily serializable
    Error,
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError,
    AggregateError,
    // Promise, // Promise has it's own RunType
    // data types
    WeakMap,
    WeakSet,
    DataView,
    ArrayBuffer,
    SharedArrayBuffer,
    Float32Array,
    Float64Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Uint8Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    BigInt64Array,
    BigUint64Array,
];

// these are global objects that are not serializable.
// values are repeated from nonSerializableClasses, as if they are classes or global object depends in typescript stn lib types and these can change
export const nonSerializableGlobals = [
    // TODO: decide what to do with native errors, they should be easily serializable
    'Error',
    'EvalError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'TypeError',
    'URIError',
    'AggregateError',
    // data types
    'WeakMap',
    'WeakSet',
    'DataView',
    'ArrayBuffer',
    'SharedArrayBuffer',
    'Float32Array',
    'Float64Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Uint16Array',
    'Uint32Array',
    'BigInt64Array',
    'BigUint64Array',
    // bellow are common interface names from standard libraries, they added here but not tested
    'Generator',
    'GeneratorFunction',
    'AsyncGenerator',
    'Iterator',
    'AsyncGeneratorFunction',
    'AsyncIterator',
];

// typescript utility types
export const nativeUtilityStringTypes = ['Uppercase', 'Lowercase', 'Capitalize', 'Uncapitalize'];

// other constants
export const validPropertyNameRegExp = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const maxStackErrorMessage =
    'Max compilation nested level reached, either you have a very deeply nested type or there is an error related to circular references un the types.';
export const JIT_STACK_TRACE_MESSAGE = '\nJIT runType trace => ';
