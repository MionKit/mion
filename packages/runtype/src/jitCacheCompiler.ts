/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitVarNames} from './jitUtils';
import {JitErrorPath, RunType} from './types';
import {pathChainToLiteral, toLiteral} from './utils';

export function callJitCachedFn(
    callingArgs: string[],
    jitIdFnName: string,
    shouldReturn = false,
    isJitIdFnNameLiteral = false
): string {
    const id = isJitIdFnNameLiteral ? jitIdFnName : toLiteral(jitIdFnName);
    const callingArguments = callingArgs.join(', ');
    const returnStatement = shouldReturn ? 'return ' : '';
    return `${returnStatement}${jitVarNames.getFromJitCache}(${id})(${callingArguments})`;
}

export function createJitCachedFn(
    cachedFnArgs: string[],
    jitIdFnName: string,
    compiledCode: string,
    isJitIdFnNameLiteral = false
): string {
    const id = isJitIdFnNameLiteral ? jitIdFnName : toLiteral(jitIdFnName);
    const internalArgLiteral = cachedFnArgs.join(', ');
    return `${jitVarNames.addToJitCache}(${id}, function(${internalArgLiteral}) {${compiledCode}});`;
}

export function createAndCallJitCachedFn(
    cachedFnArgs: string[],
    callingArgs: string[],
    jitIdFnName: string,
    compiledCode: string,
    selfInvoke = false
): string {
    const id = toLiteral(jitIdFnName);
    if (selfInvoke) {
        return `(function() {
            ${createJitCachedFn(cachedFnArgs, id, compiledCode, true)}
            ${callJitCachedFn(callingArgs, id, true, true)}
        })()`;
    }
    return `
        ${createJitCachedFn(cachedFnArgs, id, compiledCode, true)}
        ${callJitCachedFn(callingArgs, id, false, true)}
    `;
}

export function jitCacheCompileTypeErrors(
    rt: RunType,
    varName: string,
    errorsName: string,
    pathChain: JitErrorPath,
    compileTypeErrorsFn: (varName: string, errorsName: string, pathChain: JitErrorPath, callCachedJitId?: string) => string
): string {
    const jitIdWithFnName = `${rt.getJitId()}typeErrors`;
    const internalVarName = `vλl${rt.nestLevel}`;
    const wrappedCode = rt.shouldCallJitCache
        ? compileTypeErrorsFn(internalVarName, errorsName, pathChain, jitIdWithFnName)
        : compileTypeErrorsFn(internalVarName, errorsName, pathChain);
    const cachedFnArgs = [internalVarName, jitVarNames.pathChain];
    const callingArgs = [varName, pathChainToLiteral(pathChain)];
    return createAndCallJitCachedFn(cachedFnArgs, callingArgs, jitIdWithFnName, wrappedCode);
}

type CompileFn = (varName: string, callCachedJitId?: string) => string;

export function jitCacheCompileIsType(rt: RunType, varName: string, compileFn: CompileFn): string {
    return cacheCompile(rt, varName, compileFn, 'isType');
}

export function jitCacheCompileJsonEncode(rt: RunType, varName: string, compileFn: CompileFn): string {
    return cacheCompile(rt, varName, compileFn, 'jsonEncode');
}

export function jitCacheCompileJsonDecode(rt: RunType, varName: string, compileFn: CompileFn): string {
    return cacheCompile(rt, varName, compileFn, 'jsonDecode');
}

export function jitCacheCompileJsonStringify(rt: RunType, varName: string, compileFn: CompileFn): string {
    return cacheCompile(rt, varName, compileFn, 'jsonStringify');
}

function cacheCompile(rt: RunType, varName: string, compileFn: CompileFn, fnName: string): string {
    const jitIdWithFnName = `${rt.getJitId()}${fnName}`;
    const internalVarName = `vλl${rt.nestLevel}`;
    const wrappedCode = rt.shouldCallJitCache ? compileFn(internalVarName, jitIdWithFnName) : compileFn(internalVarName);
    const cachedFnArgs = [internalVarName];
    const callingArgs = [varName];
    return createAndCallJitCachedFn(cachedFnArgs, callingArgs, jitIdWithFnName, wrappedCode, true);
}

export function selfInvokeCode(code: string, selfInvoke: boolean): string {
    return selfInvoke ? `(function() {${code}})()` : code;
}
