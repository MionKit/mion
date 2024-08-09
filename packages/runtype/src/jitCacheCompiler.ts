/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {cachedJitVarNames, jitUtils, jitVarNames, prefixJitCachedVarName} from './jitUtils';
import {JitErrorPath, RunType} from './types';
import {pathChainToLiteral, toLiteral} from './utils';

export function callJitCachedFn(
    callingArgs: string[],
    jitIdFnName: string,
    shouldReturn = false,
    isJitIdFnNameLiteral = false,
    useInternalJitUtils = true
): string {
    const id = isJitIdFnNameLiteral ? jitIdFnName : toLiteral(jitIdFnName);
    const jitUtilName = useInternalJitUtils ? cachedJitVarNames._jitUtils : jitVarNames.jitUtils;
    const getFromJitCacheName = useInternalJitUtils
        ? prefixJitCachedVarName(jitVarNames.getFromJitCache)
        : jitVarNames.getFromJitCache;
    const callingArguments = [jitUtilName, ...callingArgs].join(', ');
    const returnStatement = shouldReturn ? 'return ' : '';
    return `${returnStatement}${getFromJitCacheName}(${id})(${callingArguments})`;
}

export function createJitCachedFn(cachedFnArgs: string[], jitIdFnName: string, compiledCode: string): void {
    if (!jitUtils.isInJitCache(jitIdFnName)) {
        const fn = new Function(cachedJitVarNames._jitUtils, ...cachedFnArgs, compiledCode);
        jitUtils.addToJitCache(jitIdFnName, fn as any);
        if (process.env.DEBUG_JIT) console.log(`cached jit ${jitIdFnName}: `, fn.toString());
    }
}

export function createAndCallJitCachedFn(
    cachedFnArgs: string[],
    callingArgs: string[],
    jitIdFnName: string,
    compiledCode: string,
    selfInvoke = false,
    shouldReturn = false
): string {
    const id = toLiteral(jitIdFnName);
    const code = `${callJitCachedFn(callingArgs, id, shouldReturn, true, false)}`;
    createJitCachedFn(cachedFnArgs, jitIdFnName, compiledCode);
    return selfInvokeCode(code, selfInvoke);
}

export function jitCacheCompileTypeErrors(
    rt: RunType,
    varName: string,
    errorsName: string,
    pathChain: JitErrorPath,
    compileTypeErrorsFn: (varName: string, errorsName: string, pathChain: JitErrorPath, callCachedJitId?: string) => string
): string {
    const jitIdWithFnName = `${rt.getJitId()}typeErrors`;
    const internalVarName = prefixJitCachedVarName(varName);
    const internalErrorsName = prefixJitCachedVarName(errorsName);
    const wrappedCode = rt.shouldCallJitCache
        ? compileTypeErrorsFn(internalVarName, internalErrorsName, pathChain, jitIdWithFnName)
        : compileTypeErrorsFn(internalVarName, internalErrorsName, pathChain);
    const cachedFnArgs = [internalVarName, internalErrorsName, cachedJitVarNames._pathChain];
    const callingArgs = [varName, errorsName, pathChainToLiteral(pathChain)];
    return createAndCallJitCachedFn(cachedFnArgs, callingArgs, jitIdWithFnName, wrappedCode);
}

type CompileFn = (varName: string, callCachedJitId?: string) => string;

export function jitCacheCompileIsType(rt: RunType, varName: string, compileFn: CompileFn): string {
    const selfInvoke = rt.nestLevel !== 0;
    const shouldReturn = true;
    return cacheCompile(rt, varName, compileFn, 'isT', selfInvoke, shouldReturn);
}

export function jitCacheCompileJsonEncode(rt: RunType, varName: string, compileFn: CompileFn): string {
    const selfInvoke = true;
    const shouldReturn = true;
    return cacheCompile(rt, varName, compileFn, 'jEnc', selfInvoke, shouldReturn);
}

export function jitCacheCompileJsonDecode(rt: RunType, varName: string, compileFn: CompileFn): string {
    const selfInvoke = true;
    const shouldReturn = true;
    return cacheCompile(rt, varName, compileFn, 'jDec', selfInvoke, shouldReturn);
}

export function jitCacheCompileJsonStringify(rt: RunType, varName: string, compileFn: CompileFn): string {
    const selfInvoke = rt.nestLevel !== 0;
    const shouldReturn = true;
    return cacheCompile(rt, varName, compileFn, 'jStr', selfInvoke, shouldReturn);
}

function cacheCompile(
    rt: RunType,
    varName: string,
    compileFn: CompileFn,
    fnName: string,
    selfInvoke = false,
    shouldReturn = false
): string {
    const jitIdWithFnName = `${rt.getJitId()}${fnName}`;
    const internalVarName = prefixJitCachedVarName(varName);
    const wrappedCode = rt.shouldCallJitCache ? compileFn(internalVarName, jitIdWithFnName) : compileFn(internalVarName);
    const cachedFnArgs = [internalVarName];
    const callingArgs = [varName];
    return createAndCallJitCachedFn(cachedFnArgs, callingArgs, jitIdWithFnName, wrappedCode, selfInvoke, shouldReturn);
}

export function selfInvokeCode(code: string, selfInvoke: boolean): string {
    return selfInvoke ? `(function() {${code}})()` : code;
}

export function callTypeErrorsCachedJitFn(
    itemAccessor: string,
    errorsName: string,
    pathChainCode: string,
    cachedJitId: string
): string {
    return callJitCachedFn([itemAccessor, errorsName, pathChainCode], cachedJitId);
}
