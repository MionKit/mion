/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnID} from './types';

export const CodeTypes = {
    expression: 'E', // single expression, that could be concatenated using js operators like + - * && || etc...
    statement: 'S', // one or multiple statements, that could be concatenated using ; to ensure correct syntax
    returnBlock: 'RB', // code block, it can not be concatenated with other code, it has an explicit return statement and needs to be wrapped in a function
} as const;

export type CodeType = (typeof CodeTypes)[keyof typeof CodeTypes];

export interface JitFnSettings {
    id: string;
    name: string;
    type: CodeType;
    /** dynamically imports a single compiler function that is capable of compiling any node
     * @see {@link ./jitCompilers/jsonStringify.ts#_compileJsonStringify} as example of compiler function
     */
    import?: () => Promise<(...args: any[]) => any>;
}

// list of available jit functions
// ######## !IMPORTANT: all functions id must be unique ########

export const jitValidationFunctions = {
    isType: {id: 'is', name: 'isType', type: CodeTypes.expression},
    typeErrors: {id: 'te', name: 'typeErrors', type: CodeTypes.statement},
    // not yet implemented, this will check and include type formats, ie, lowercase, uppercase, etc
    isTypeStrict: {id: 'isNF', name: 'isTypeIgnoreFormat', type: CodeTypes.expression},
} as const satisfies {[key: string]: JitFnSettings};

export const jitSerializationFunctions = {
    toJsonVal: {id: 'tj', name: 'toJsonVal', type: CodeTypes.statement},
    fromJsonVal: {id: 'fj', name: 'fromJsonVal', type: CodeTypes.statement},
    jsonStringify: {id: 'js', name: 'jsonStringify', type: CodeTypes.expression},
    // not yet implemented
    toBinary: {id: 'tb', name: 'toJsonVal', type: CodeTypes.statement},
    fromBinary: {id: 'fb', name: 'fromJsonVal', type: CodeTypes.statement},
    toString: {id: 'ts', name: 'jsonStringify', type: CodeTypes.expression},
    fromString: {id: 'fs', name: 'jsonParse', type: CodeTypes.expression},
    // apply type formatters, ie: lowercase, uppercase, trim, etc
    format: {id: 'fmt', name: 'format', type: CodeTypes.expression},
} as const satisfies {[key: string]: JitFnSettings};

export const JitFunctions = {
    ...jitValidationFunctions,
    ...jitSerializationFunctions,
    unknownKeyErrors: {id: 'uk', name: 'unknownKeyErrors', type: CodeTypes.statement},
    hasUnknownKeys: {id: 'hk', name: 'hasUnknownKeys', type: CodeTypes.expression},
    stripUnknownKeys: {id: 'sk', name: 'stripUnknownKeys', type: CodeTypes.statement},
    unknownKeysToUndefined: {id: 'ku', name: 'unknownKeysToUndefined', type: CodeTypes.statement},
    aux: {id: 'aux', name: 'aux', type: CodeTypes.returnBlock},
    // mock is not really a jit function but is used in a similar way, main difference is that it is not compiled
    mock: {
        id: 'mock',
        name: 'mockType',
        type: CodeTypes.returnBlock,
        import: () => import('./mocking/mockType').then((m) => m.mockType),
    },
    // similar to json stringify but outputs js code, including pure functions, already imported as size is quite small
    toCode: {id: 'tc', name: 'toCode', type: CodeTypes.expression},
} as const satisfies {[key: string]: JitFnSettings};

export const jitFunctionList = Object.values(JitFunctions);
export const jitFunctionsById = Object.fromEntries(jitFunctionList.map((f) => [f.id, f]));

export function getCodeType(fnID: JitFnID): CodeType {
    const fnConfig = jitFunctionsById[fnID];
    if (fnConfig === undefined) throw new Error(`Unknown jit function id: ${fnID}`);
    return fnConfig.type;
}

// variable names used in jit functions
// JitUtils is passed with the name 'utl'. it is hardcoded in all jit code to avoid string interpolation
export const jitArgs = {vλl: 'v'} as const;
export const jitDefaultArgs = {vλl: null} as const;
export const jitErrorArgs = {vλl: 'v', pλth: 'pth', εrr: 'er'} as const;
export const jitDefaultErrorArgs = {vλl: null, pλth: '[]', εrr: '[]'} as const;

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
export const maxStackErrorMessage =
    'Max compilation nested level reached, either you have a very deeply nested type or there is an error related to circular references un the types.';
