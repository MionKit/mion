/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export const JitFnNames = {
    1: 'isType',
    2: 'typeErrors',
    3: 'toJsonVal',
    4: 'fromJsonVal',
    5: 'jsonStringify',
    6: 'unknownKeyErrors',
    7: 'hasUnknownKeys',
    8: 'stripUnknownKeys',
    9: 'unknownKeysToUndefined',
    10: 'aux',
} as const;

export const JitFnIDs = {
    isType: 1,
    typeErrors: 2,
    toJsonVal: 3,
    fromJsonVal: 4,
    jsonStringify: 5,
    unknownKeyErrors: 6,
    hasUnknownKeys: 7,
    stripUnknownKeys: 8,
    unknownKeysToUndefined: 9,
    aux: 10,
} as const;

export const defaultJitFnHasReturn = {
    isType: false,
    typeErrors: false,
    toJsonVal: false,
    fromJsonVal: false,
    jsonStringify: false,
    unknownKeyErrors: false,
    hasUnknownKeys: false,
    stripUnknownKeys: false,
    unknownKeysToUndefined: false,
    aux: true,
} as const;

export const defaultJitFnIsExpression = {
    isType: true,
    typeErrors: false,
    toJsonVal: false,
    fromJsonVal: false,
    jsonStringify: true,
    unknownKeyErrors: false,
    hasUnknownKeys: true,
    stripUnknownKeys: false,
    unknownKeysToUndefined: false,
    aux: false,
} as const;

export const validPropertyNameRegExp = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const jitNames = {
    utils: 'utl',
};

export const minKeysForSet = 30;
export const maxUnknownKeys = 10;
export const maxStackDepth = 50;
export const maxStackErrorMessage =
    'Max compilation nested level reached, either you have a very deeply nested type or there is an error related to circular references un the types.';

export const jitArgs = {vλl: 'v'} as const;
export const jitDefaultArgs = {vλl: null} as const;
export const jitErrorArgs = {vλl: 'v', pλth: 'pth', εrr: 'er'} as const;
export const jitDefaultErrorArgs = {vλl: null, pλth: '[]', εrr: '[]'} as const;

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

export const nativeUtilityStringTypes = ['Uppercase', 'Lowercase', 'Capitalize', 'Uncapitalize'];
