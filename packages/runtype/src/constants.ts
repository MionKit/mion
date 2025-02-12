/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export interface JitFnSetting {
    id: number;
    name: string;
    hasReturn: boolean;
    isExpression: boolean;
}

export const JitFunctions = {
    isType: {id: 1, name: 'isType', hasReturn: false, isExpression: true},
    typeErrors: {id: 2, name: 'typeErrors', hasReturn: false, isExpression: false},
    toJsonVal: {id: 3, name: 'toJsonVal', hasReturn: false, isExpression: false},
    fromJsonVal: {id: 4, name: 'fromJsonVal', hasReturn: false, isExpression: false},
    jsonStringify: {id: 5, name: 'jsonStringify', hasReturn: false, isExpression: true},
    unknownKeyErrors: {id: 6, name: 'unknownKeyErrors', hasReturn: false, isExpression: false},
    hasUnknownKeys: {id: 7, name: 'hasUnknownKeys', hasReturn: false, isExpression: true},
    stripUnknownKeys: {id: 8, name: 'stripUnknownKeys', hasReturn: false, isExpression: false},
    unknownKeysToUndefined: {id: 9, name: 'unknownKeysToUndefined', hasReturn: false, isExpression: false},
    aux: {id: 10, name: 'aux', hasReturn: true, isExpression: false},
} as const satisfies {[key: string]: JitFnSetting};

export const jitFunctionList = Object.values(JitFunctions);

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
