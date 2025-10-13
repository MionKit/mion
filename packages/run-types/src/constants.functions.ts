/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitFnArgs} from '@mionkit/core';

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
    jitArgs: JitFnArgs;
    jitDefaultArgs: JitFnArgs;
    returnName: string;
    runTimeOptions?: Record<string, {keyName: string; type: 'boolean' | 'number' | 'string'; defaultValue: any}>;
} // list of available jit functions

// variable names used in jit functions
// JitUtils is passed with the name 'utl'. it is hardcoded in all jit code to avoid string interpolation
export const jitArgs = {vλl: 'v'} as const;
export const jitDefaultArgs = {vλl: ''} as const;
export const jitErrorArgs = {vλl: 'v', pλth: 'pth', εrr: 'er'} as const;
export const jitDefaultErrorArgs = {vλl: '', pλth: '[]', εrr: '[]'} as const;
export const jitArgsWithOptions = {vλl: 'v', θpts: 'opts'} as const;
export const jitDefaultArgsWithOptions = {vλl: '', θpts: '{}'} as const;
export const jitBinarySerializerArgs = {vλl: 'v', sεr: 'Ser'} as const; // v= js value, ser = serializer,
export const jitBinaryDeserializerArgs = {vλl: 'ret', dεs: 'Des'} as const; // v = deserialized js value (initially undefined), des = deserializer
export const jitDefaultBinarySerializerArgs = {vλl: '', sεr: ''} as const;
export const jitDefaultBinaryDeserializerArgs = {vλl: 'undefined', dεs: ''} as const;

// ######## !IMPORTANT: ALL JIT FUNCTIONS IDs MUST BE UNIQUE and short ########

type JitFunctionsGroup = {[key: string]: JitFnSettings};

export const jitValidationFunctions = {
    isType: {
        id: 'is',
        name: 'isType',
        type: CodeTypes.expression,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    typeErrors: {
        id: 'te',
        name: 'typeErrors',
        type: CodeTypes.statement,
        jitArgs: jitErrorArgs,
        jitDefaultArgs: jitDefaultErrorArgs,
        returnName: jitErrorArgs.εrr,
    },
    // not yet implemented, this will check and include type formats, ie, lowercase, uppercase, etc
    isTypeStrict: {
        id: 'isNF',
        name: 'isTypeStrict',
        type: CodeTypes.expression,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
} as const satisfies JitFunctionsGroup;

export const jitSerializationFunctions = {
    toJsonVal: {
        id: 'tj',
        name: 'toJsonVal',
        type: CodeTypes.statement,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    fromJsonVal: {
        id: 'fj',
        name: 'fromJsonVal',
        type: CodeTypes.statement,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    jsonStringify: {
        id: 'js',
        name: 'jsonStringify',
        type: CodeTypes.expression,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    // similar to json stringify but outputs js code, including pure functions, already imported as size is quite small
    toJavascript: {
        id: 'tc',
        name: 'toJavascript',
        type: CodeTypes.expression,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    // Binary serialization functions
    toBinary: {
        id: 'tBi',
        name: 'toBinary',
        type: CodeTypes.statement,
        jitArgs: jitBinarySerializerArgs,
        jitDefaultArgs: jitDefaultBinarySerializerArgs,
        // returns the serializer buffer
        returnName: jitBinarySerializerArgs.sεr,
    },
    fromBinary: {
        id: 'fBi',
        name: 'fromBinary',
        type: CodeTypes.statement,
        jitArgs: jitBinaryDeserializerArgs,
        jitDefaultArgs: jitDefaultBinaryDeserializerArgs,
        // deserialized value is stored in vλl that is initially undefined
        returnName: jitBinaryDeserializerArgs.vλl,
    },
    // apply type formatters, ie: lowercase, uppercase, trim, etc
    format: {
        id: 'fmt',
        name: 'format',
        type: CodeTypes.expression,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
} as const satisfies JitFunctionsGroup;

export const JitFunctions = {
    ...jitValidationFunctions,
    ...jitSerializationFunctions,
    unknownKeyErrors: {
        id: 'uk',
        name: 'unknownKeyErrors',
        type: CodeTypes.statement,
        jitArgs: jitErrorArgs,
        jitDefaultArgs: jitDefaultErrorArgs,
        returnName: jitErrorArgs.εrr,
    },
    hasUnknownKeys: {
        id: 'hk',
        name: 'hasUnknownKeys',
        type: CodeTypes.expression,
        jitArgs: jitArgsWithOptions,
        jitDefaultArgs: jitDefaultArgsWithOptions,
        runTimeOptions: {checkNonJitProps: {keyName: 'checkNonJitProps', type: 'boolean', defaultValue: false}},
        returnName: jitArgsWithOptions.vλl,
    },
    stripUnknownKeys: {
        id: 'sk',
        name: 'stripUnknownKeys',
        type: CodeTypes.statement,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    unknownKeysToUndefined: {
        id: 'ku',
        name: 'unknownKeysToUndefined',
        type: CodeTypes.statement,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    aux: {
        id: 'aux',
        name: 'aux',
        type: CodeTypes.returnBlock,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    // mock is not really a jit function but is used in a similar way, main difference is that it is not compiled
    mock: {
        id: 'mock',
        name: 'mockType',
        type: CodeTypes.returnBlock,
        import: () => import('./mocking/mockType').then((m) => m.mockType),
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    // pure function are not jit compiled but we ensure we reserve a prefix to avoid collisions
    pureFunction: {
        id: 'pf',
        name: 'pureFunction',
        type: CodeTypes.statement,
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
} as const satisfies JitFunctionsGroup;

export const jitFunctionList: JitFnSettings[] = Object.values(JitFunctions);
export const jitFunctionsById = Object.fromEntries(jitFunctionList.map((f) => [f.id, f]));
