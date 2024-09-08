/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    JITCompiledFunctionsData,
    JSONValue,
    JitFnData,
    JitCompilerFunctions,
    RunType,
    SerializableJITFunctions,
    isTypeFn,
    typeErrorsFn,
    UnwrappedJITFunctions,
    JitContext,
    TypeErrorsContext,
    JitCompileContext,
    JitPathItem,
} from './types';
import {jitUtils} from './jitUtils';
import {toLiteral, arrayToLiteral} from './utils';
import {jitNames} from './constants';

/**
 * Builds all the JIT functions for a given RunType
 * @param runType
 * @param jitFunctions
 * @returns
 */
export function buildJITFunctions(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctionsData {
    return {
        isType: buildIsTypeJITFn(runType, jitFunctions),
        typeErrors: buildTypeErrorsJITFn(runType, jitFunctions),
        jsonEncode: buildJsonEncodeJITFn(runType, jitFunctions),
        jsonDecode: buildJsonDecodeJITFn(runType, jitFunctions),
        jsonStringify: buildJsonStringifyJITFn(runType, jitFunctions),
    };
}

export function buildIsTypeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITCompiledFunctionsData['isType'] {
    const context: JitContext = {args: {vλl: 'vλl'}, parents: [], path: []};
    const jitCode = jitFunctions ? jitFunctions.compileIsType(context) : runType.compileIsType(context);
    const code = runType.isAtomic ? `return ${jitCode}` : jitCode;
    const argNames = Object.values(context.args);
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction isType(){${code}}`;
        const name = `(${runType.getName()}:${runType.jitId})`;
        throw new Error(`Error building isType JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildTypeErrorsJITFn(
    runType: RunType,
    jitFunctions?: JitCompilerFunctions
): JITCompiledFunctionsData['typeErrors'] {
    const context: TypeErrorsContext = {args: {vλl: 'vλl', pλth: 'pλth', εrrors: 'εrrors'}, parents: [], path: []};
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
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction typeErrors(){${code}}`;
        const name = `(${runType.getName()}:${runType.jitId})`;
        throw new Error(`Error building typeErrors JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildJsonEncodeJITFn(
    runType: RunType,
    jitFunctions?: JitCompilerFunctions
): JITCompiledFunctionsData['jsonEncode'] {
    const context: JitContext = {args: {vλl: 'vλl'}, parents: [], path: []};
    const jitCode = jitFunctions ? jitFunctions.compileJsonEncode(context) : runType.compileJsonEncode(context);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${context.args.vλl}`;
    const argNames = Object.values(context.args);
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction jsonEncode(){${code}}`;
        const name = `(${runType.getName()}:${runType.jitId})`;
        throw new Error(`Error building jsonEncode JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildJsonDecodeJITFn(
    runType: RunType,
    jitFunctions?: JitCompilerFunctions
): JITCompiledFunctionsData['jsonDecode'] {
    const context: JitContext = {args: {vλl: 'vλl'}, parents: [], path: []};
    const jitCode = jitFunctions ? jitFunctions.compileJsonDecode(context) : runType.compileJsonDecode(context);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${context.args.vλl}`;
    const argNames = Object.values(context.args);
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction jsonDecode(){${code}}`;
        const name = `(${runType.getName()}:${runType.jitId})`;
        throw new Error(`Error building jsonDecode JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function buildJsonStringifyJITFn(
    runType: RunType,
    jitFunctions?: JitCompilerFunctions
): JITCompiledFunctionsData['jsonStringify'] {
    const context: JitContext = {args: {vλl: 'vλl'}, parents: [], path: []};
    const jitCode = jitFunctions ? jitFunctions.compileJsonStringify(context) : runType.compileJsonStringify(context);
    const code = runType.isAtomic ? `return ${jitCode}` : jitCode;
    const argNames = Object.values(context.args);
    try {
        const fn = createJitFnWithContext(argNames, code);
        return {argNames, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction jsonStringify(){${code}}`;
        const name = `(${runType.getName()}:${runType.jitId})`;
        throw new Error(`Error building jsonStringify JIT function for type ${name}: ${e?.message} \n${fnCode}`);
    }
}

export function getSerializableJitCompiler(compiled: JITCompiledFunctionsData): SerializableJITFunctions {
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

export function codifyJitFunctions(compiled: JITCompiledFunctionsData): string {
    const isType = codifyJitFn(compiled.isType);
    const typeErrors = codifyJitFn(compiled.typeErrors);
    const jsonEncode = codifyJitFn(compiled.jsonEncode);
    const jsonDecode = codifyJitFn(compiled.jsonDecode);
    const jsonStringify = codifyJitFn(compiled.jsonStringify);
    return `{\n isType:${isType},\n typeErrors:${typeErrors},\n jsonEncode:${jsonEncode},\n jsonDecode:${jsonDecode},\n jsonStringify:${jsonStringify}\n}`;
}

/** Transform a SerializableJITFunctions into a JITFunctions */
export function restoreJitFunctions(serializable: SerializableJITFunctions): JITCompiledFunctionsData {
    const restored = serializable as JITCompiledFunctionsData;
    restored.isType.fn = new Function(...restored.isType.argNames, restored.isType.code) as isTypeFn;
    restored.typeErrors.fn = new Function(...restored.typeErrors.argNames, restored.typeErrors.code) as typeErrorsFn;

    const encode = new Function(...restored.jsonEncode.argNames, restored.jsonEncode.code);
    restored.jsonEncode.fn = (vλluε: any) => encode(jitUtils, vλluε);

    const decode = new Function(...restored.jsonDecode.argNames, restored.jsonDecode.code);
    restored.jsonDecode.fn = (vλluε: any) => decode(jitUtils, vλluε);

    const stringify = new Function(...restored.jsonStringify.argNames, restored.jsonStringify.code);
    const stringifyFn = (vλluε: any) => stringify(jitUtils, vλluε);
    restored.jsonStringify.fn = stringifyFn;

    return serializable as JITCompiledFunctionsData;
}

/**
 * Restored JITFunctions after they have been codified and parsed by js.
 * Codified stringify function are missing the jitUtils wrapper, so it is added here.
 */
export function restoreCodifiedJitFunctions(jitFns: UnwrappedJITFunctions): JITCompiledFunctionsData {
    const restored = jitFns as any as JITCompiledFunctionsData;
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
function createJitFnWithContext(fnArgNames: string[], code: string): (...args: any[]) => any {
    // this function will have jitUtils as context as is an argument of the enclosing function
    const fnWithContext = `function jitƒn(${fnArgNames.join(', ')}){${code}}\nreturn jitƒn;`;
    const wrapperWithContext = new Function(jitNames.utils, fnWithContext);
    if (process.env.DEBUG_JIT) console.log(wrapperWithContext.toString());
    return wrapperWithContext(jitUtils); // returns the jit internal function with the context
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

export type compileChildCB<Ctx extends JitCompileContext> = (ctx: Ctx) => string;

/**
 * Wrapper function to compile children types, it manages all the required updates to the compile context before and after compiling the children.
 */
export function compileChildren<Ctx extends JitCompileContext>(
    compileChildFn: compileChildCB<Ctx>,
    parentRt: RunType,
    ctx: Ctx,
    pathItem?: JitPathItem
): string {
    // updates the context by updating parents, path and args
    const args = {...ctx.args};
    ctx.parents.push(parentRt);
    if (pathItem) {
        const useArray = pathItem.useArrayAccessor ?? typeof pathItem.vλl === 'number';
        const childAccessor = useArray ? `[${pathItem.literal}]` : `.${pathItem.vλl}`;
        ctx.args.vλl = `${ctx.args.vλl}${childAccessor}`;
        ctx.path.push(pathItem);
    }

    const itemsCode = compileChildFn(ctx);

    // restore the context to the previous state
    if (pathItem) {
        ctx.path.pop();
    }
    ctx.parents.pop();
    ctx.args = args;
    return itemsCode;
}
