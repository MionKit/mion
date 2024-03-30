/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitUtilsVarname} from './constants';
import {jitUtils} from './jitUtils';
import {
    JITFunctions,
    JSONValue,
    JitFn,
    RunTypeJitFunctions,
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

export class JITCompiler implements JITFunctions {
    public readonly isType: JITFunctions['isType'];
    public readonly typeErrors: JITFunctions['typeErrors'];
    public readonly jsonEncode: JITFunctions['jsonEncode'];
    public readonly jsonDecode: JITFunctions['jsonDecode'];
    public readonly jsonStringify: JITFunctions['jsonStringify'];
    constructor(runType: RunType, jitFunctions?: RunTypeJitFunctions) {
        this.isType = buildIsTypeJITFn(runType, jitFunctions);
        this.typeErrors = buildTypeErrorsJITFn(runType, jitFunctions);
        this.jsonEncode = buildJsonEncodeJITFn(runType, jitFunctions);
        this.jsonDecode = buildJsonDecodeJITFn(runType, jitFunctions);
        this.jsonStringify = buildJsonStringifyJITFn(runType, jitFunctions);
    }
}

export function buildIsTypeJITFn(runType: RunType, jitFunctions?: RunTypeJitFunctions): JITFunctions['isType'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.isType ? jitFunctions.isType(varName) : runType.JIT_isType(varName);
    const code = `return ${jitCode};`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => boolean;
        return {varNames: [varName], code, fn};
    } catch (e: any) {
        throw new Error(`Error building isType JIT function for ${runType.name}: ${e?.message}.\nCode: ${code}`);
    }
}

export function buildTypeErrorsJITFn(runType: RunType, jitFunctions?: RunTypeJitFunctions): JITFunctions['typeErrors'] {
    const varName = `vλluε${runType.nestLevel}`;
    const errorsName = `εrrΦrs${runType.nestLevel}`;
    const jitCode = jitFunctions?.typeErrors
        ? jitFunctions.typeErrors(varName, errorsName, `''`)
        : runType.JIT_typeErrors(varName, errorsName, `''`);
    const code = `const ${errorsName} = []; ${jitCode}; return ${errorsName};`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => RunTypeValidationError[];
        return {varNames: [varName], code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building typeErrors JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonEncodeJITFn(runType: RunType, jitFunctions?: RunTypeJitFunctions): JITFunctions['jsonEncode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonEncode ? jitFunctions.jsonEncode(varName) : runType.JIT_jsonEncode(varName);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${varName}`;
    try {
        const varNames = [jitUtilsVarname, varName];
        const encodeFn = new Function(...varNames, code);
        const wrapper: jsonDecodeFn = (value: any) => encodeFn(jitUtils, value);
        return {varNames, code, fn: wrapper};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonEncode JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonDecodeJITFn(runType: RunType, jitFunctions?: RunTypeJitFunctions): JITFunctions['jsonDecode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonDecode ? jitFunctions.jsonDecode(varName) : runType.JIT_jsonDecode(varName);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${varName}`;
    try {
        const varNames = [jitUtilsVarname, varName];
        const decodeFn = new Function(...varNames, code);
        const wrapper: jsonDecodeFn = (value: JSONValue) => decodeFn(jitUtils, value);
        return {varNames, code, fn: wrapper};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonDecode JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonStringifyJITFn(runType: RunType, jitFunctions?: RunTypeJitFunctions): JITFunctions['jsonStringify'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonStringify ? jitFunctions.jsonStringify(varName) : runType.JIT_jsonStringify(varName);
    const code = `return ${jitCode};`;
    try {
        const varNames = [jitUtilsVarname, varName];
        const stringifyFn = new Function(...varNames, code);
        const wrapper: jsonStringifyFn = (value: any) => stringifyFn(jitUtils, value);
        return {varNames, code, fn: wrapper};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonStringify JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function getSerializableJitCompiler(compiled: JITFunctions): SerializableJITFunctions {
    return {
        isType: {varNames: compiled.isType.varNames, code: compiled.isType.code},
        typeErrors: {varNames: compiled.typeErrors.varNames, code: compiled.typeErrors.code},
        jsonEncode: {varNames: compiled.jsonEncode.varNames, code: compiled.jsonEncode.code},
        jsonDecode: {varNames: compiled.jsonDecode.varNames, code: compiled.jsonDecode.code},
        jsonStringify: {varNames: compiled.jsonStringify.varNames, code: compiled.jsonStringify.code},
    };
}

export function codifyJitFn(fn: JitFn<(vλluε: any) => any>): string {
    const varNames = fn.varNames;
    return `{\n  varNames:${toLiteralArray(varNames)},\n  code:${toLiteral(fn.code)},\n  fn:function(${varNames.join(',')}){${fn.code}}\n}`;
}

export function codifyJitFunctions(compiled: JITFunctions): string {
    const isType = codifyJitFn(compiled.isType);
    const typeErrors = codifyJitFn(compiled.typeErrors);
    const jsonEncode = codifyJitFn(compiled.jsonEncode);
    const jsonDecode = codifyJitFn(compiled.jsonDecode);
    const jsonStringify = codifyJitFn(compiled.jsonStringify);
    return `{\n isType:${isType},\n typeErrors:${typeErrors},\n jsonEncode:${jsonEncode},\n jsonDecode:${jsonDecode},\n jsonStringify:${jsonStringify}\n}`;
}

/** Transform a SerializableJITFunctions into a JITFunctions */
export function restoreJitFunctions(serializable: SerializableJITFunctions): JITFunctions {
    const restored = serializable as JITFunctions;
    restored.isType.fn = new Function(...restored.isType.varNames, restored.isType.code) as isTypeFn;
    restored.typeErrors.fn = new Function(...restored.typeErrors.varNames, restored.typeErrors.code) as typeErrorsFn;

    const encode = new Function(...restored.jsonEncode.varNames, restored.jsonEncode.code);
    restored.jsonEncode.fn = (vλluε: any) => encode(...restored.jsonEncode.varNames, vλluε);

    const decode = new Function(...restored.jsonDecode.varNames, restored.jsonDecode.code);
    restored.jsonDecode.fn = (vλluε: any) => decode(...restored.jsonDecode.varNames, vλluε);

    const stringify = new Function(jitUtilsVarname, restored.jsonStringify.varNames[0], restored.jsonStringify.code);
    const stringifyFn = (vλluε: any) => stringify(jitUtilsVarname, vλluε);
    restored.jsonStringify.fn = stringifyFn;

    return serializable as JITFunctions;
}

/**
 * Restored JITFunctions after they have been codified and parsed by js.
 * Codified stringify function are missing the jitUtils wrapper, so it is added here.
 */
export function restoreCodifiedJitFunctions(jitFns: UnwrappedJITFunctions): JITFunctions {
    const restored = jitFns as any as JITFunctions;
    // important to keep the original functions to avoid infinite recursion
    const originalDecode = jitFns.jsonDecode.fn;
    restored.jsonDecode.fn = (vλluε: JSONValue) => originalDecode(jitUtils, vλluε);
    const originalEncode = jitFns.jsonEncode.fn;
    jitFns.jsonEncode.fn = (vλluε: any) => originalEncode(jitUtils, vλluε);
    const originalStringifyFn = jitFns.jsonStringify.fn;
    restored.jsonStringify.fn = (vλluε: any) => originalStringifyFn(jitUtils, vλluε);

    return restored;
}
