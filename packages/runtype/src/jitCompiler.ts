/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {} from './constants';
import {jitUtils, jitUtilsVarNames} from './jitUtils';
import {
    JITFunctionsData,
    JSONValue,
    JitFnData,
    JitCompilerFunctions,
    RunType,
    RunTypeValidationError,
    SerializableJITFunctions,
    jsonDecodeFn,
    jsonStringifyFn,
    isTypeFn,
    typeErrorsFn,
    UnwrappedJITFunctions,
} from './types';
import {toLiteral, toLiteralArray} from './utils';

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
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions ? jitFunctions.compileIsType(varName) : runType.compileIsType(varName);
    const code = `return ${jitCode};`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => boolean;
        // console.log('isType', fn.toString());
        return {varNames: [varName], code, fn};
    } catch (e: any) {
        throw new Error(`Error building isType JIT function for ${runType.slug}: ${e?.message}.\nCode: ${code}`);
    }
}

export function buildTypeErrorsJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITFunctionsData['typeErrors'] {
    const varName = `vλluε${runType.nestLevel}`;
    const errorsName = `εrrΦrs${runType.nestLevel}`;
    const jitCode = jitFunctions
        ? jitFunctions.compileTypeErrors(varName, errorsName, `''`)
        : runType.compileTypeErrors(varName, errorsName, `''`);
    const code = `const ${errorsName} = []; ${jitCode}; return ${errorsName};`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => RunTypeValidationError[];
        // console.log('typeErrors', fn.toString());
        return {varNames: [varName], code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building typeErrors JIT function for ${runType.slug}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonEncodeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITFunctionsData['jsonEncode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions ? jitFunctions.compileJsonEncode(varName) : runType.compileJsonEncode(varName);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${varName}`;
    try {
        const varNames = [jitUtilsVarNames.root, varName];
        const encodeFn = new Function(...varNames, code);
        const wrapper: jsonDecodeFn = (value: any) => encodeFn(jitUtils, value);
        // console.log('jsonEncode', encodeFn.toString());
        return {varNames, code, fn: wrapper};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonEncode JIT function for ${runType.slug}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonDecodeJITFn(runType: RunType, jitFunctions?: JitCompilerFunctions): JITFunctionsData['jsonDecode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions ? jitFunctions.compileJsonDecode(varName) : runType.compileJsonDecode(varName);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${varName}`;
    try {
        const varNames = [jitUtilsVarNames.root, varName];
        const decodeFn = new Function(...varNames, code);
        const wrapper: jsonDecodeFn = (value: JSONValue) => decodeFn(jitUtils, value);
        // console.log('jsonDecode', decodeFn.toString());
        return {varNames, code, fn: wrapper};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonDecode JIT function for ${runType.slug}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonStringifyJITFn(
    runType: RunType,
    jitFunctions?: JitCompilerFunctions
): JITFunctionsData['jsonStringify'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions ? jitFunctions.compileJsonStringify(varName) : runType.compileJsonStringify(varName);
    const code = `return ${jitCode};`;
    try {
        const varNames = [jitUtilsVarNames.root, varName];
        const stringifyFn = new Function(...varNames, code);
        const wrapper: jsonStringifyFn = (value: any) => stringifyFn(jitUtils, value);
        // console.log('jsonStringify', stringifyFn.toString());
        return {varNames, code, fn: wrapper};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonStringify JIT function for ${runType.slug}: ${e?.message}.${fnCode}`);
    }
}

export function getSerializableJitCompiler(compiled: JITFunctionsData): SerializableJITFunctions {
    return {
        isType: {varNames: compiled.isType.varNames, code: compiled.isType.code},
        typeErrors: {varNames: compiled.typeErrors.varNames, code: compiled.typeErrors.code},
        jsonEncode: {varNames: compiled.jsonEncode.varNames, code: compiled.jsonEncode.code},
        jsonDecode: {varNames: compiled.jsonDecode.varNames, code: compiled.jsonDecode.code},
        jsonStringify: {varNames: compiled.jsonStringify.varNames, code: compiled.jsonStringify.code},
    };
}

export function codifyJitFn(fn: JitFnData<(vλluε: any) => any>): string {
    const varNames = fn.varNames;
    return `{\n  varNames:${toLiteralArray(varNames)},\n  code:${toLiteral(fn.code)},\n  fn:function(${varNames.join(',')}){${fn.code}}\n}`;
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
    restored.isType.fn = new Function(...restored.isType.varNames, restored.isType.code) as isTypeFn;
    restored.typeErrors.fn = new Function(...restored.typeErrors.varNames, restored.typeErrors.code) as typeErrorsFn;

    const encode = new Function(...restored.jsonEncode.varNames, restored.jsonEncode.code);
    restored.jsonEncode.fn = (vλluε: any) => encode(...restored.jsonEncode.varNames, vλluε);

    const decode = new Function(...restored.jsonDecode.varNames, restored.jsonDecode.code);
    restored.jsonDecode.fn = (vλluε: any) => decode(...restored.jsonDecode.varNames, vλluε);

    const stringify = new Function(jitUtilsVarNames.root, restored.jsonStringify.varNames[0], restored.jsonStringify.code);
    const stringifyFn = (vλluε: any) => stringify(jitUtilsVarNames.root, vλluε);
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
