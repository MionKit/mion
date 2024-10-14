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
} from './types';
import {jitUtils} from './jitUtils';
import {toLiteral, arrayToLiteral} from './utils';
import {jitNames} from './constants';
import {JitCompileOp, JitTypeErrorCompileOp} from './jitOperation';

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
    const jitOp = new JitCompileOp('ƒnIsTypε', 'EXPRESSION');
    const code = jitFunctions ? jitFunctions.compileIsType(jitOp) : runType.compileIsType(jitOp);
    const argNames = Object.values(jitOp.args);
    try {
        const fn = createJitFnWithContext(Object.values(jitOp.args), jitOp.argsDefaultValues, code, jitOp.name);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction isType(){${code}}`;
        const name = `(${runType.getName()}:${runType.getJitId()})`;
        throw new Error(`Error building isType JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildTypeErrorsJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctions['typeErrors'] {
    const jitOp: JitTypeErrorCompileOp = new JitTypeErrorCompileOp('ƒnTypεErrors');
    const code = jitFunctions ? jitFunctions.compileTypeErrors(jitOp) : runType.compileTypeErrors(jitOp);
    // we only pass the value as argument as error and path are created inside the root function, this way user don't need to pass them every time
    const argNames = [jitOp.args.vλl];
    try {
        const fn = createJitFnWithContext(Object.values(jitOp.args), jitOp.argsDefaultValues, code, jitOp.name);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction typeErrors(){${code}}`;
        const name = `(${runType.getName()}:${runType.getJitId()})`;
        throw new Error(`Error building typeErrors JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildJsonEncodeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctions['jsonEncode'] {
    const jitOp = new JitCompileOp('ƒnJsonεncode', 'STATEMENT');
    const code = jitFunctions ? jitFunctions.compileJsonEncode(jitOp) : runType.compileJsonEncode(jitOp);
    const argNames = Object.values(jitOp.args);
    try {
        const fn = createJitFnWithContext(Object.values(jitOp.args), jitOp.argsDefaultValues, code, jitOp.name);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction jsonEncode(){${code}}`;
        const name = `(${runType.getName()}:${runType.getJitId()})`;
        throw new Error(`Error building jsonEncode JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildJsonDecodeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctions['jsonDecode'] {
    const jitOp = new JitCompileOp('ƒnJsonDεcode', 'STATEMENT');
    const code = jitFunctions ? jitFunctions.compileJsonDecode(jitOp) : runType.compileJsonDecode(jitOp);
    const argNames = Object.values(jitOp.args);
    try {
        const fn = createJitFnWithContext(Object.values(jitOp.args), jitOp.argsDefaultValues, code, jitOp.name);
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
    const jitOp = new JitCompileOp('ƒnJsonStringify', 'EXPRESSION');
    const code = jitFunctions ? jitFunctions.compileJsonStringify(jitOp) : runType.compileJsonStringify(jitOp);
    const argNames = Object.values(jitOp.args);
    try {
        const fn = createJitFnWithContext(Object.values(jitOp.args), jitOp.argsDefaultValues, code, jitOp.name);
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

export function codifyJitFn(fn: JitFnData<(vλl: any) => any>): string {
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
    restored.jsonEncode.fn = (vλl: any) => encode(jitUtils, vλl);

    const decode = new Function(...restored.jsonDecode.argNames, restored.jsonDecode.code);
    restored.jsonDecode.fn = (vλl: any) => decode(jitUtils, vλl);

    const stringify = new Function(...restored.jsonStringify.argNames, restored.jsonStringify.code);
    const stringifyFn = (vλl: any) => stringify(jitUtils, vλl);
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
    restored.jsonDecode.fn = (vλl: JSONValue) => originalDecode(jitUtils, vλl);
    const originalEncode = jitFns.jsonEncode.fn;
    jitFns.jsonEncode.fn = (vλl: any) => originalEncode(jitUtils, vλl);
    const originalStringifyFn = jitFns.jsonStringify.fn;
    restored.jsonStringify.fn = (vλl: any) => originalStringifyFn(jitUtils, vλl);

    return restored;
}

export function getFunctionArgsCode(argNames: string[], argDefaultValues: (string | null)[]): string {
    return argNames
        .map((name, i) => {
            const value = argDefaultValues[i];
            if (!value) return name;
            return `${name}=${argDefaultValues[i]}`;
        })
        .join(',');
}

/**
 * Create a JIT function that has jitUtils (and possibly other required variables) in the context,
 * This way jitUtils ca be used without passing them as arguments to every atomic jit function (kind of global variables).
 * @param varName
 * @param code
 * @returns
 */
function createJitFnWithContext(
    argNames: string[],
    argDefaultValues: (string | null)[],
    code: string,
    functionName
): (...args: any[]) => any {
    const argsCode = getFunctionArgsCode(argNames, argDefaultValues);
    // this function will have jitUtils as context as is an argument of the enclosing function
    const fnWithContext = `function ${functionName}(${argsCode}){${code}}\nreturn ${functionName};`;
    try {
        const wrapperWithContext = new Function(jitNames.utils, fnWithContext);
        if (process.env.DEBUG_JIT) console.log(wrapperWithContext.toString());
        return wrapperWithContext(jitUtils); // returns the jit internal function with the context
    } catch (e: any) {
        if (process.env.DEBUG_JIT) console.warn('Error creating jit function with context code:\n', code);
        console.log(e);
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
 * @param fnName
 * @param code a string representing the src code or a functions that compiles the src code
 * @param cacheFnArgsNames
 */
export function createJitCachedFn(fnName: string, code: string | (() => string), cacheFnArgsNames: string[]): void {
    if (!jitUtils.isFnInCache(fnName)) {
        const isFn = typeof code === 'function';
        if (isFn) jitUtils.addCachedFn(fnName, true as any); // add a placeholder to avoid infinite recursion
        const compiledCode = isFn ? code() : code;
        const defaultArgs = []; // TODO: we might add the option to pass default args to teh cached function (we even might user the same args a tje JitCompileOp)
        const fn = createJitFnWithContext(cacheFnArgsNames, defaultArgs, compiledCode, fnName);
        jitUtils.addCachedFn(fnName, fn);
        if (process.env.DEBUG_JIT) console.log(`cached jit functions for ${fnName}`);
    }
}
