/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnID} from './types';

export interface JitFnSetting {
    id: string;
    name: string;
    hasReturn: boolean;
    isExpression: boolean;
}

// list of available jit functions
// ######## !IMPORTANT: all functions id must be unique ########

export const jitValidationFunctions = {
    isType: {id: 'is', name: 'isType', hasReturn: false, isExpression: true},
    typeErrors: {id: 'te', name: 'typeErrors', hasReturn: false, isExpression: false},
    // not yet implemented, this will check a type bug ignore sll type formats, ie, lowercase, uppercase, etc
    // this will be used for better performance once ensured that a tye has been already formatted
    isTypeIgnoreFormat: {id: 'isNF', name: 'isTypeIgnoreFormat', hasReturn: false, isExpression: true},
} as const satisfies {[key: string]: JitFnSetting};

export const jitSerializationFunctions = {
    toJsonVal: {id: 'tj', name: 'toJsonVal', hasReturn: false, isExpression: false},
    fromJsonVal: {id: 'fj', name: 'fromJsonVal', hasReturn: false, isExpression: false},
    jsonStringify: {id: 'js', name: 'jsonStringify', hasReturn: false, isExpression: true},
    // not yet implemented
    toBinary: {id: 'tb', name: 'toJsonVal', hasReturn: false, isExpression: false},
    fromBinary: {id: 'fb', name: 'fromJsonVal', hasReturn: false, isExpression: false},
    toString: {id: 'ts', name: 'jsonStringify', hasReturn: false, isExpression: true},
    fromString: {id: 'fs', name: 'jsonParse', hasReturn: false, isExpression: true},
    // apply type formatters, ie: lowercase, uppercase, trim, etc
    format: {id: 'fmt', name: 'format', hasReturn: false, isExpression: true},
} as const satisfies {[key: string]: JitFnSetting};

export const JitFunctions = {
    ...jitValidationFunctions,
    ...jitSerializationFunctions,
    unknownKeyErrors: {id: 'uk', name: 'unknownKeyErrors', hasReturn: false, isExpression: false},
    hasUnknownKeys: {id: 'hk', name: 'hasUnknownKeys', hasReturn: false, isExpression: true},
    stripUnknownKeys: {id: 'sk', name: 'stripUnknownKeys', hasReturn: false, isExpression: false},
    unknownKeysToUndefined: {id: 'ku', name: 'unknownKeysToUndefined', hasReturn: false, isExpression: false},
    aux: {id: 'aux', name: 'aux', hasReturn: true, isExpression: false},
} as const satisfies {[key: string]: JitFnSetting};

export const jitFunctionList = Object.values(JitFunctions);
export const jitFunctionsById = Object.fromEntries(jitFunctionList.map((f) => [f.id, f]));

export function jitFnHasReturn(fnId: JitFnID): boolean {
    const fnConfig = jitFunctionsById[fnId];
    if (fnConfig === undefined) throw new Error(`Unknown jit function id: ${fnId}`);
    return fnConfig.hasReturn;
}

export function jitFnIsExpression(fnId: JitFnID): boolean {
    const fnConfig = jitFunctionsById[fnId];
    if (fnConfig === undefined) throw new Error(`Unknown jit function id: ${fnId}`);
    return fnConfig.isExpression;
}

// variable names used in jit functions
// JitUtils is passed with the name 'utl'. it is hardcoded in all jit code to avoid string interpolation
export const jitArgs = {vλl: 'v'} as const;
export const jitDefaultArgs = {vλl: null} as const;
export const jitErrorArgs = {vλl: 'v', pλth: 'pth', εrr: 'er'} as const;
export const jitDefaultErrorArgs = {vλl: null, pλth: '[]', εrr: '[]'} as const;
export const jitFormatErrorArgs = {vλl: 'v', pλth: 'pth', εrr: 'er', formatPλth: 'fmt'} as const;
export const jitDefaultFormatErrorArgs = {vλl: null, pλth: '[]', εrr: '[]', formatPλth: '[]'} as const;

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
export const minKeysForSet = 30;
export const maxUnknownKeys = 10;
export const maxStackDepth = 50;
export const maxStackErrorMessage =
    'Max compilation nested level reached, either you have a very deeply nested type or there is an error related to circular references un the types.';
