/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    JITCompiledFunctions,
    JSONValue,
    JitFnData,
    JitCompilerFunctions,
    RunType,
    SerializableJITFunctions,
    isTypeFn,
    typeErrorsFn,
    UnwrappedJITFunctions,
    JitOperation,
    JitTypeErrorOperation,
    JitCompileOperation,
} from './types';
import {jitUtils} from './jitUtils';
import {toLiteral, arrayToLiteral} from './utils';
import {getDefaultJitArgs, getDefaultJitTypeErrorsArgs, jitNames} from './constants';

/**
 * Builds all the JIT functions for a given RunType
 * @param runType
 * @param jitFunctions
 * @returns
 */
export function buildJITFunctions(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctions {
    return {
        isType: buildIsTypeJITFn(runType, jitFunctions),
        typeErrors: buildTypeErrorsJITFn(runType, jitFunctions),
        jsonEncode: buildJsonEncodeJITFn(runType, jitFunctions),
        jsonDecode: buildJsonDecodeJITFn(runType, jitFunctions),
        jsonStringify: buildJsonStringifyJITFn(runType, jitFunctions),
    };
}

export function buildIsTypeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctions['isType'] {
    const context: JitOperation = {
        args: getDefaultJitArgs(),
        stack: [],
        path: [],
        getDefaultArgs: getDefaultJitArgs,
    };
    const code = jitFunctions ? jitFunctions.compileIsType(context) : runType.compileIsType(context);
    const argNames = Object.values(context.args);
    try {
        const fn = createJitFnWithContext(argNames, code, 'Isτ');
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction isType(){${code}}`;
        const name = `(${runType.getName()}:${runType.getJitId()})`;
        throw new Error(`Error building isType JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildTypeErrorsJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctions['typeErrors'] {
    const context: JitTypeErrorOperation = {
        args: getDefaultJitTypeErrorsArgs(),
        stack: [],
        path: [],
        getDefaultArgs: getDefaultJitTypeErrorsArgs,
    };
    const jitCode = jitFunctions ? jitFunctions.compileTypeErrors(context) : runType.compileTypeErrors(context);
    // TODO: pλth array is used for circular functions or jit cached functions, it should be removed if not used
    const code = `
        const ${context.args.εrrors} = [];
        const ${context.args.pλth} = [];
        ${jitCode}
        return ${context.args.εrrors};
    `;
    // we only pass the value as argument as error and path are created inside the root function, this way user don't need to pass them every time
    const argNames = [context.args.vλl];
    try {
        const fn = createJitFnWithContext(argNames, code, 'Tεrr');
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction typeErrors(){${code}}`;
        const name = `(${runType.getName()}:${runType.getJitId()})`;
        throw new Error(`Error building typeErrors JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildJsonEncodeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctions['jsonEncode'] {
    const context: JitOperation = {
        args: getDefaultJitArgs(),
        stack: [],
        path: [],
        getDefaultArgs: getDefaultJitArgs,
    };
    const code = jitFunctions ? jitFunctions.compileJsonEncode(context) : runType.compileJsonEncode(context);
    const argNames = Object.values(context.args);
    try {
        const fn = createJitFnWithContext(argNames, code, 'Jεnc');
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction jsonEncode(){${code}}`;
        const name = `(${runType.getName()}:${runType.getJitId()})`;
        throw new Error(`Error building jsonEncode JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildJsonDecodeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctions['jsonDecode'] {
    const context: JitOperation = {
        args: getDefaultJitArgs(),
        stack: [],
        path: [],
        getDefaultArgs: getDefaultJitArgs,
    };
    const code = jitFunctions ? jitFunctions.compileJsonDecode(context) : runType.compileJsonDecode(context);
    const argNames = Object.values(context.args);
    try {
        const fn = createJitFnWithContext(argNames, code, 'JDεc');
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction jsonDecode(){${code}}`;
        const name = `(${runType.getName()}:${runType.getJitId()})`;
        throw new Error(`Error building jsonDecode JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildJsonStringifyJITFn(
    runType: RunType,
    jitFunctions?: JitCompilerFunctions
): JITCompiledFunctions['jsonStringify'] {
    const context: JitOperation = {
        args: getDefaultJitArgs(),
        stack: [],
        path: [],
        getDefaultArgs: getDefaultJitArgs,
    };
    const code = jitFunctions ? jitFunctions.compileJsonStringify(context) : runType.compileJsonStringify(context);
    const argNames = Object.values(context.args);
    try {
        const fn = createJitFnWithContext(argNames, code, 'JSτr');
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction jsonStringify(){${code}}`;
        const name = `(${runType.getName()}:${runType.getJitId()})`;
        throw new Error(`Error building jsonStringify JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function getSerializableJitCompiler(compiled: JITCompiledFunctions): SerializableJITFunctions {
    return {
        isType: {argNames: compiled.isType.argNames, code: compiled.isType.code},
        typeErrors: {argNames: compiled.typeErrors.argNames, code: compiled.typeErrors.code},
        jsonEncode: {argNames: compiled.jsonEncode.argNames, code: compiled.jsonEncode.code},
        jsonDecode: {argNames: compiled.jsonDecode.argNames, code: compiled.jsonDecode.code},
        jsonStringify: {argNames: compiled.jsonStringify.argNames, code: compiled.jsonStringify.code},
    };
}

export function codifyJitFn(fn: JitFnData<(vλluε: any) => any>): string {
    const argNames = fn.argNames;
    return `{\n  argNames:${arrayToLiteral(argNames)},\n  code:${toLiteral(fn.code)},\n  fn:function(${argNames.join(',')}){${fn.code}}\n}`;
}

export function codifyJitFunctions(compiled: JITCompiledFunctions): string {
    const isType = codifyJitFn(compiled.isType);
    const typeErrors = codifyJitFn(compiled.typeErrors);
    const jsonEncode = codifyJitFn(compiled.jsonEncode);
    const jsonDecode = codifyJitFn(compiled.jsonDecode);
    const jsonStringify = codifyJitFn(compiled.jsonStringify);
    return `{\n isType:${isType},\n typeErrors:${typeErrors},\n jsonEncode:${jsonEncode},\n jsonDecode:${jsonDecode},\n jsonStringify:${jsonStringify}\n}`;
}

/** Transform a SerializableJITFunctions into a JITFunctions */
export function restoreJitFunctions(serializable: SerializableJITFunctions): JITCompiledFunctions {
    const restored = serializable as JITCompiledFunctions;
    restored.isType.fn = new Function(...restored.isType.argNames, restored.isType.code) as isTypeFn;
    restored.typeErrors.fn = new Function(...restored.typeErrors.argNames, restored.typeErrors.code) as typeErrorsFn;

    const encode = new Function(...restored.jsonEncode.argNames, restored.jsonEncode.code);
    restored.jsonEncode.fn = (vλluε: any) => encode(jitUtils, vλluε);

    const decode = new Function(...restored.jsonDecode.argNames, restored.jsonDecode.code);
    restored.jsonDecode.fn = (vλluε: any) => decode(jitUtils, vλluε);

    const stringify = new Function(...restored.jsonStringify.argNames, restored.jsonStringify.code);
    const stringifyFn = (vλluε: any) => stringify(jitUtils, vλluε);
    restored.jsonStringify.fn = stringifyFn;

    return serializable as JITCompiledFunctions;
}

/**
 * Restored JITFunctions after they have been codified and parsed by js.
 * Codified stringify function are missing the jitUtils wrapper, so it is added here.
 */
export function restoreCodifiedJitFunctions(jitFns: UnwrappedJITFunctions): JITCompiledFunctions {
    const restored = jitFns as any as JITCompiledFunctions;
    // important to keep the original functions to avoid infinite recursion
    const originalDecode = jitFns.jsonDecode.fn;
    restored.jsonDecode.fn = (vλluε: JSONValue) => originalDecode(jitUtils, vλluε);
    const originalEncode = jitFns.jsonEncode.fn;
    jitFns.jsonEncode.fn = (vλluε: any) => originalEncode(jitUtils, vλluε);
    const originalStringifyFn = jitFns.jsonStringify.fn;
    restored.jsonStringify.fn = (vλluε: any) => originalStringifyFn(jitUtils, vλluε);

    return restored;
}

/**
 * Create a JIT function that has jitUtils (and possibly other required variables) in the context,
 * This way jitUtils ca be used without passing them as arguments to every atomic jit function (kind of global variables).
 * @param varName
 * @param code
 * @returns
 */
function createJitFnWithContext(fnArgNames: string[], code: string, internalFnName = 'jit'): (...args: any[]) => any {
    // this function will have jitUtils as context as is an argument of the enclosing function
    const fnWithContext = `function ƒn${internalFnName}(${fnArgNames.join(', ')}){${code}}\nreturn ƒn${internalFnName};`;
    try {
        const wrapperWithContext = new Function(jitNames.utils, fnWithContext);
        if (process.env.DEBUG_JIT) console.log(wrapperWithContext.toString());
        return wrapperWithContext(jitUtils); // returns the jit internal function with the context
    } catch (e: any) {
        if (process.env.DEBUG_JIT) console.warn('Error creating jit function with context code:\n', code);
        throw e;
    }
}

/**
 * Generate jit code to call a cached jit function
 * i.e: `jitUtils.getCachedFn('jitIdFnName')(jitUtils, varName, ...callArgsNames)`
 * @param jitNames
 * @param jitIdFnName
 * @param callArgsNames
 * @returns
 */
export function callJitCachedFn(jitIdFnName: string, callArgsNames: string[]): string {
    const id = toLiteral(jitIdFnName);
    return `${jitNames.utils}.getCachedFn(${id})(${callArgsNames.join(', ')})`; // getCachedFn must match the name in jitUtils
}

/**
 * Create a new jit function and add it to the jit cache, so it can be called later.
 * @param jitNames
 * @param jitIdFnName
 * @param code a string representing the src code or a functions that compiles the src code
 * @param cacheFnArgsNames
 */
export function createJitCachedFn(jitIdFnName: string, code: string | (() => string), cacheFnArgsNames: string[]): void {
    if (!jitUtils.isFnInCache(jitIdFnName)) {
        const isFn = typeof code === 'function';
        if (isFn) jitUtils.addCachedFn(jitIdFnName, true as any); // add a placeholder to avoid infinite recursion
        const compiledCode = isFn ? code() : code;
        const fn = createJitFnWithContext(cacheFnArgsNames, compiledCode);
        jitUtils.addCachedFn(jitIdFnName, fn);
        if (process.env.DEBUG_JIT) console.log(`cached jit functions for ${jitIdFnName}`);
    }
}

export function addReturnCode(compiled: string, op: JitCompileOperation, codeHasReturn: boolean): string {
    const nestLevel = op.stack.length;
    if (nestLevel > 0) {
        // code contains a return and possibly more statements, we need to wrap it in a self invoking function to avoid syntax errors
        if (codeHasReturn) return `(function(){${compiled}})()`;
        // code is just a statement (i.e: typeof var === 'number'), we can return it directly
        return compiled;
    }
    // nestLevel === 0 (root of the function)
    if (codeHasReturn) return compiled; // code already contains a return, we can return it directly
    // code is just a statement (i.e: typeof var === 'number'), we need to add a return statement as it is the root of the function
    return `return ${compiled}`;
}
