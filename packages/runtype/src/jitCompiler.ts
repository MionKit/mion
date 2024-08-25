/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    JITFunctionsData,
    JSONValue,
    JitFnData,
    JitCompilerFunctions,
    RunType,
    SerializableJITFunctions,
    isTypeFn,
    typeErrorsFn,
    UnwrappedJITFunctions,
} from './types';
import {jitUtils} from './jitUtils';
import {toLiteral, arrayToLiteral} from './utils';
import {jitNames} from './constants';
import {CollectionRunType} from './baseRunTypes';

/**
 * Builds all the JIT functions for a given RunType
 * @param runType
 * @param jitFunctions
 * @returns
 */
export function buildJITFunctions(runType: RunType, jitFunctions?: JitCompilerFunctions): JITFunctionsData {
    return {
        isType: buildIsTypeJITFn(runType, jitFunctions),
        typeErrors: buildTypeErrorsJITFn(runType, jitFunctions),
        jsonEncode: buildJsonEncodeJITFn(runType, jitFunctions),
        jsonDecode: buildJsonDecodeJITFn(runType, jitFunctions),
        jsonStringify: buildJsonStringifyJITFn(runType, jitFunctions),
    };
}

export function buildIsTypeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITFunctionsData['isType'] {
    const varName = `vλl`;
    const parents = [];
    const jitCode = jitFunctions ? jitFunctions.compileIsType(parents, varName) : runType.compileIsType(parents, varName);
    const code = runType.isSingle ? `return ${jitCode}` : jitCode;
    const argNames = [varName];
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        throw new Error(`Error building isType JIT function for ${runType.jitId}: ${e?.message}.\nCode: ${code}`);
    }
}

export function buildTypeErrorsJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITFunctionsData['typeErrors'] {
    const varName = `vλl`;
    const parents = [];
    const pathChain = [];
    const jitCode = jitFunctions
        ? jitFunctions.compileTypeErrors(parents, varName, pathChain)
        : runType.compileTypeErrors(parents, varName, pathChain);
    const code = `
        const ${jitNames.errors} = [];
        const ${jitNames.circularPath} = [];
        ${jitCode}
        return ${jitNames.errors};
    `;
    const argNames = [varName];
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building typeErrors JIT function for ${runType.jitId}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonEncodeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITFunctionsData['jsonEncode'] {
    const varName = `vλl`;
    const parents = [];
    const jitCode = jitFunctions ? jitFunctions.compileJsonEncode(parents, varName) : runType.compileJsonEncode(parents, varName);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${varName}`;
    const argNames = [varName];
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonEncode JIT function for ${runType.jitId}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonDecodeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITFunctionsData['jsonDecode'] {
    const varName = `vλl`;
    const parents = [];
    const jitCode = jitFunctions ? jitFunctions.compileJsonDecode(parents, varName) : runType.compileJsonDecode(parents, varName);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${varName}`;
    const argNames = [varName];
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonDecode JIT function for ${runType.jitId}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonStringifyJITFn(
    runType: RunType,
    jitFunctions?: JitCompilerFunctions
): JITFunctionsData['jsonStringify'] {
    const varName = `vλl`;
    const parents = [];
    const jitCode = jitFunctions
        ? jitFunctions.compileJsonStringify(parents, varName)
        : runType.compileJsonStringify(parents, varName);
    const code = runType.isSingle ? `return ${jitCode}` : jitCode;
    const argNames = [varName];
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonStringify JIT function for ${runType.jitId}: ${e?.message}.${fnCode}`);
    }
}

export function getSerializableJitCompiler(compiled: JITFunctionsData): SerializableJITFunctions {
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

export function codifyJitFunctions(compiled: JITFunctionsData): string {
    const isType = codifyJitFn(compiled.isType);
    const typeErrors = codifyJitFn(compiled.typeErrors);
    const jsonEncode = codifyJitFn(compiled.jsonEncode);
    const jsonDecode = codifyJitFn(compiled.jsonDecode);
    const jsonStringify = codifyJitFn(compiled.jsonStringify);
    return `{\n isType:${isType},\n typeErrors:${typeErrors},\n jsonEncode:${jsonEncode},\n jsonDecode:${jsonDecode},\n jsonStringify:${jsonStringify}\n}`;
}

/** Transform a SerializableJITFunctions into a JITFunctions */
export function restoreJitFunctions(serializable: SerializableJITFunctions): JITFunctionsData {
    const restored = serializable as JITFunctionsData;
    restored.isType.fn = new Function(...restored.isType.argNames, restored.isType.code) as isTypeFn;
    restored.typeErrors.fn = new Function(...restored.typeErrors.argNames, restored.typeErrors.code) as typeErrorsFn;

    const encode = new Function(...restored.jsonEncode.argNames, restored.jsonEncode.code);
    restored.jsonEncode.fn = (vλluε: any) => encode(jitUtils, vλluε);

    const decode = new Function(...restored.jsonDecode.argNames, restored.jsonDecode.code);
    restored.jsonDecode.fn = (vλluε: any) => decode(jitUtils, vλluε);

    const stringify = new Function(...restored.jsonStringify.argNames, restored.jsonStringify.code);
    const stringifyFn = (vλluε: any) => stringify(jitUtils, vλluε);
    restored.jsonStringify.fn = stringifyFn;

    return serializable as JITFunctionsData;
}

/**
 * Restored JITFunctions after they have been codified and parsed by js.
 * Codified stringify function are missing the jitUtils wrapper, so it is added here.
 */
export function restoreCodifiedJitFunctions(jitFns: UnwrappedJITFunctions): JITFunctionsData {
    const restored = jitFns as any as JITFunctionsData;
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
 * This way jitUtils ca be used without passing them as arguments to every single jit function (kind of global variables).
 * @param varName
 * @param code
 * @returns
 */
function createJitFnWithContext(fnArgNames: string[], code: string): (...args: any[]) => any {
    // this function will have jitUtils as context as is an argument of the enclosing function
    const fnWithContext = `function jitƒn(${fnArgNames.join(', ')}){${code}}\nreturn jitƒn;`;
    const wrapperWithContext = new Function(jitNames.utils, fnWithContext);
    if (process.env.DEBUG_JIT) console.log(wrapperWithContext.toString());
    return wrapperWithContext(jitUtils); // returns the jit internal function with the context
}

/**
 * Generate jit code to call a cached jit function
 * i.e: `jitUtils.getFromJitCache('jitIdFnName')(jitUtils, varName, ...callArgsNames)`
 * @param jitNames
 * @param jitIdFnName
 * @param callArgsNames
 * @returns
 */
export function callJitCachedFn(jitIdFnName: string, callArgsNames: string[]): string {
    const id = toLiteral(jitIdFnName);
    return `${jitNames.utils}.getFromJitCache(${id})(${callArgsNames.join(', ')})`; // getFromJitCache must match the name in jitUtils
}

/**
 * Create a new jit function and add it to the jit cache, so it can be called later.
 * @param jitNames
 * @param jitIdFnName
 * @param compiledCode
 * @param cacheFnArgsNames
 */
export function createJitCachedFn(jitIdFnName: string, compiledCode: string, cacheFnArgsNames: string[]): void {
    if (!jitUtils.isInJitCache(jitIdFnName)) {
        const fn = createJitFnWithContext(cacheFnArgsNames, compiledCode);
        jitUtils.addToJitCache(jitIdFnName, fn as any);
        if (process.env.DEBUG_JIT) console.log(`cached jit ${jitIdFnName}: `, fn.toString());
    }
}

export type compileChildCB = (updatedParents: RunType[]) => string;

/** wrapper function to handle circular types compiling */
function handleCircularJitCompiling(
    rt: RunType,
    /** name to identify the function in the jit cache */
    fnName: string,
    /** jit pseudocode, itemsPseudoCode will be replaced after calling compileChildFn */
    code: string,
    /** argument Names when called jit cached function */
    jitCacheCallArgs: string[],
    /** flag to know if we are compiling a circular child */
    isCircularChild: boolean
): string {
    // this is the scenario where we call a jit cached function instead generating code (end of recursion)
    if (isCircularChild) return callJitCachedFn(`${rt.jitId}:${fnName}`, jitCacheCallArgs);

    if (!(rt as CollectionRunType<any>).isCircular) return code;

    // this is the scenario where we add function to jit cache and return the call to it instead generating inline code
    const jitIdFnName = `${rt.jitId}:${fnName}`;
    createJitCachedFn(jitIdFnName, code, jitCacheCallArgs); // adding the code to jit cache
    return callJitCachedFn(jitIdFnName, jitCacheCallArgs); // return a call to the cached function
}

export function handleCircularIsType(
    rt: RunType,
    code: string,
    jitCacheCallArgs: string[],
    isCircularChild: boolean,
    nestLevel: number
): string {
    const isTypeCode = handleCircularJitCompiling(rt, 'isT', code, jitCacheCallArgs, isCircularChild);
    if (isCircularChild) return isTypeCode;
    if ((rt as any).isCircular) return `return ${isTypeCode}`;
    return nestLevel > 0 ? `(function(){${isTypeCode}})()` : isTypeCode;
}

export function handleCircularTypeErrors(
    rt: RunType,
    code: string,
    jitCacheCallArgs: string[],
    isCircularChild: boolean,
    pathC: (string | number)[]
): string {
    const typeErrorsCode = handleCircularJitCompiling(rt, 'TErr', code, jitCacheCallArgs, isCircularChild);
    if (isCircularChild)
        return `
            ${jitNames.circularPath}.push(${pathC.join(',')});
            ${typeErrorsCode}
            ${jitNames.circularPath}.splice(-${pathC.length});
        `;
    return typeErrorsCode;
}

export function handleCircularJsonEncode(
    rt: RunType,
    code: string,
    jitCacheCallArgs: string[],
    isCircularChild: boolean
): string {
    return handleCircularJitCompiling(rt, 'jsonEnc', code, jitCacheCallArgs, isCircularChild);
}

export function handleCircularJsonDecode(
    rt: RunType,
    code: string,
    jitCacheCallArgs: string[],
    isCircularChild: boolean
): string {
    return handleCircularJitCompiling(rt, 'jsonDec', code, jitCacheCallArgs, isCircularChild);
}

export function handleCircularJsonStringify(
    rt: RunType,
    code: string,
    jitCacheCallArgs: string[],
    isCircularChild: boolean,
    nestLevel: number
): string {
    const isTypeCode = handleCircularJitCompiling(rt, 'jsonStr', code, jitCacheCallArgs, isCircularChild);
    if (isCircularChild) return isTypeCode;
    if ((rt as any).isCircular) return `return ${isTypeCode}`;
    return nestLevel > 0 ? `(function(){${isTypeCode}})()` : isTypeCode;
}

/** wrapper function to compile children types and managing parents array before and after children gets compiled*/
export function compileChildrenJitFunction(
    rt: RunType,
    parents: RunType[],
    isCircularChild: boolean,
    compileChildFn: compileChildCB
): string {
    if (isCircularChild) return ''; // skip compiling children if we are in a circular type
    parents.push(rt);
    const itemsCode = compileChildFn(parents);
    parents.pop();
    return itemsCode;
}
