/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type JitFnArgs, JIT_FUNCTION_IDS} from '@mionkit/core';

/** Javascript code types */
export const CodeTypes = {
    expression: 'E', // single expression, that could be concatenated using js operators like + - * && || etc...
    statement: 'S', // one or multiple statements, that could be concatenated using ; to ensure correct syntax
    returnBlock: 'RB', // code block, it can not be concatenated with other code, it has an explicit return statement and needs to be wrapped in a function
} as const;
export type CodeType = (typeof CodeTypes)[keyof typeof CodeTypes];

export interface JitFnSettings {
    id: string;
    name: string;
    /** dynamically imports a single compiler function that is capable of compiling any node
     * @see {@link ./jitCompilers/jsonStringify.ts#visitJsonStringify} as example of compiler function
     */
    import?: () => Promise<(...args: any[]) => any>;
    jitArgs: JitFnArgs;
    jitDefaultArgs: JitFnArgs;
    returnName: string;
    isSerializer?: true;
    /**
     * When no initial vλl is required by the function.
     * This is typically used by deserializers, that do not transform the input value but create a new one from other params.
     * an the initial vλl is used as a variable initialization for the returned values.
     * ie binary deserialization
     */
    noInitialVλl?: true;
    runTimeOptions?: Record<string, {keyName: string; type: 'boolean' | 'number' | 'string'; defaultValue: any}>;
    /**
     * When set to true, the format code should replace the jit code for the function.
     * This is used when the format code is more efficient than the default code.
     */
    formatShouldReplaceJitCode?: true;
} // list of available jit functions

// variable names used in jit functions
// JitUtils is passed with the name 'utl'. it is hardcoded in all jit code to avoid string interpolation
export const jitArgs = {vλl: 'v'} as const;
export const jitDefaultArgs = {vλl: ''} as const;
export const jitErrorArgs = {vλl: 'v', pλth: 'pth', εrr: 'er'} as const;
export const jitDefaultErrorArgs = {vλl: '', pλth: '[]', εrr: '[]'} as const;
export const jitArgsWithOptions = {vλl: 'v', θpts: 'opts'} as const;
export const jitDefaultArgsWithOptions = {vλl: '', θpts: '{}'} as const;
export const jitBinarySerializerArgs = {vλl: 'v', sεr: 'Ser'} as const; // vλl = js value to serialize ser = serializer,
export const jitBinaryDeserializerArgs = {vλl: 'ret', dεs: 'Des'} as const; // vλl is used as return variable ans is assigned the deserialized value, des = deserializer
export const jitDefaultBinarySerializerArgs = {vλl: '', sεr: ''} as const;
export const jitDefaultBinaryDeserializerArgs = {vλl: '', dεs: ''} as const;

// ######## !IMPORTANT: ALL JIT FUNCTIONS IDs MUST BE UNIQUE and short ########

type JitFunctionsGroup = {[key: string]: JitFnSettings};

export const jitValidationFunctions = {
    isType: {
        id: JIT_FUNCTION_IDS.isType,
        name: 'isType',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    typeErrors: {
        id: JIT_FUNCTION_IDS.typeErrors,
        name: 'typeErrors',
        jitArgs: jitErrorArgs,
        jitDefaultArgs: jitDefaultErrorArgs,
        returnName: jitErrorArgs.εrr,
    },
    // not yet implemented, this will check and include type formats, ie, lowercase, uppercase, etc
    isTypeStrict: {
        id: 'isNF',
        name: 'isTypeStrict',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
} as const satisfies JitFunctionsGroup;

export const jitSerializationFunctions = {
    prepareForJson: {
        id: JIT_FUNCTION_IDS.prepareForJson,
        name: 'prepareForJson',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
        isSerializer: true,
    },
    restoreFromJson: {
        id: JIT_FUNCTION_IDS.restoreFromJson,
        name: 'restoreFromJson',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
        isSerializer: true,
    },
    jsonStringify: {
        id: JIT_FUNCTION_IDS.jsonStringify,
        name: 'jsonStringify',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
        isSerializer: true,
    },
    // similar to json stringify but outputs js code, including pure functions, already imported as size is quite small
    toJavascript: {
        id: JIT_FUNCTION_IDS.toJavascript,
        name: 'toJavascript',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    // Binary serialization functions
    toBinary: {
        id: JIT_FUNCTION_IDS.toBinary,
        name: 'toBinary',
        jitArgs: jitBinarySerializerArgs,
        jitDefaultArgs: jitDefaultBinarySerializerArgs,
        // returns the serializer buffer
        returnName: jitBinarySerializerArgs.sεr,
        formatShouldReplaceJitCode: true,
        isSerializer: true,
    },
    fromBinary: {
        id: JIT_FUNCTION_IDS.fromBinary,
        name: 'fromBinary',
        jitArgs: jitBinaryDeserializerArgs,
        jitDefaultArgs: jitDefaultBinaryDeserializerArgs,
        // deserialized value is stored in vλl that is initially undefined
        returnName: jitBinaryDeserializerArgs.vλl,
        noInitialVλl: true,
        formatShouldReplaceJitCode: true,
        isSerializer: true,
    },
    // apply type formatters, ie: lowercase, uppercase, trim, etc
    format: {
        id: JIT_FUNCTION_IDS.format,
        name: 'format',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
} as const satisfies JitFunctionsGroup;

export const JitFunctions = {
    ...jitValidationFunctions,
    ...jitSerializationFunctions,
    unknownKeyErrors: {
        id: JIT_FUNCTION_IDS.unknownKeyErrors,
        name: 'unknownKeyErrors',
        jitArgs: jitErrorArgs,
        jitDefaultArgs: jitDefaultErrorArgs,
        returnName: jitErrorArgs.εrr,
    },
    hasUnknownKeys: {
        id: JIT_FUNCTION_IDS.hasUnknownKeys,
        name: 'hasUnknownKeys',
        jitArgs: jitArgsWithOptions,
        jitDefaultArgs: jitDefaultArgsWithOptions,
        runTimeOptions: {checkNonJitProps: {keyName: 'checkNonJitProps', type: 'boolean', defaultValue: false}},
        returnName: jitArgsWithOptions.vλl,
    },
    stripUnknownKeys: {
        id: JIT_FUNCTION_IDS.stripUnknownKeys,
        name: 'stripUnknownKeys',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    unknownKeysToUndefined: {
        id: JIT_FUNCTION_IDS.unknownKeysToUndefined,
        name: 'unknownKeysToUndefined',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    aux: {
        id: JIT_FUNCTION_IDS.aux,
        name: 'aux',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    // mock is not really a jit function but is used in a similar way, main difference is that it is not compiled
    mock: {
        id: JIT_FUNCTION_IDS.mock,
        name: 'mockType',
        import: () => import('./mocking/mockType').then((m) => m.mockType),
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
    // pure function are not jit compiled but we ensure we reserve a prefix to avoid collisions
    pureFunction: {
        id: JIT_FUNCTION_IDS.pureFunction,
        name: 'pureFunction',
        jitArgs,
        jitDefaultArgs,
        returnName: jitArgs.vλl,
    },
} as const satisfies JitFunctionsGroup;

export const jitFunctionList: JitFnSettings[] = Object.values(JitFunctions);
export const jitFunctionsById = Object.fromEntries(jitFunctionList.map((f) => [f.id, f]));
