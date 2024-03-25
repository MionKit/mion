/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {asJSONStringVarname} from './constants';
import {JITFunctions, JSONValue, JitFn, JitFunctions, RunType, RunTypeValidationError, SerializableJITFunctions} from './types';
import {asJSONString, toLiteral, toLiteralArray} from './utils';

export class JITCompiler implements JITFunctions {
    public readonly isType: JITFunctions['isType'];
    public readonly typeErrors: JITFunctions['typeErrors'];
    public readonly jsonEncode: JITFunctions['jsonEncode'];
    public readonly jsonDecode: JITFunctions['jsonDecode'];
    public readonly jsonStringify: JITFunctions['jsonStringify'];
    constructor(runType: RunType, jitFunctions?: JitFunctions) {
        this.isType = buildIsTypeJITFn(runType, jitFunctions);
        this.typeErrors = buildTypeErrorsJITFn(runType, jitFunctions);
        this.jsonEncode = buildJsonEncodeJITFn(runType, jitFunctions);
        this.jsonDecode = buildJsonDecodeJITFn(runType, jitFunctions);
        this.jsonStringify = buildJsonStringifyJITFn(runType, jitFunctions);
    }
}

export function buildIsTypeJITFn(runType: RunType, jitFunctions?: JitFunctions): JITFunctions['isType'] {
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

export function buildTypeErrorsJITFn(runType: RunType, jitFunctions?: JitFunctions): JITFunctions['typeErrors'] {
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

export function buildJsonEncodeJITFn(runType: RunType, jitFunctions?: JitFunctions): JITFunctions['jsonEncode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonEncode ? jitFunctions.jsonEncode(varName) : runType.JIT_jsonEncode(varName);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${varName}`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => JSONValue;
        return {varNames: [varName], code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonEncode JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonDecodeJITFn(runType: RunType, jitFunctions?: JitFunctions): JITFunctions['jsonDecode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonDecode ? jitFunctions.jsonDecode(varName) : runType.JIT_jsonDecode(varName);
    const hasJitCode = !!jitCode;
    const code = `${jitCode} ${hasJitCode ? ';' : ''} return ${varName}`;
    try {
        const fn = new Function(varName, asJSONStringVarname, code) as (vλluε: JSONValue) => any;
        return {varNames: [varName], code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonDecode JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonStringifyJITFn(runType: RunType, jitFunctions?: JitFunctions): JITFunctions['jsonStringify'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonStringify ? jitFunctions.jsonStringify(varName) : runType.JIT_jsonStringify(varName);
    const code = `return ${jitCode};`;
    try {
        // TODO remove the wrapper function and force the user to pass a utils object that stores any possible function used internally by the jit function
        const newFn = new Function(varName, asJSONStringVarname, code) as (vλluε: JSONValue, asJson: (string) => string) => any;
        const fn = (vλluε: any) => newFn(vλluε, asJSONString);
        return {varNames: [varName], code, fn};
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

export function codifyJitFn(fn: JitFn<(vλluε: any) => any>, extraVarNames: string[] = []): string {
    const varNames = [...fn.varNames, ...extraVarNames];
    return `{\n  varNames:${toLiteralArray(varNames)},\n  code:${toLiteral(fn.code)},\n  fn:function(${varNames.join(',')}){${fn.code}}\n}`;
}

export function codifyJitFunctions(compiled: JITFunctions): string {
    const isType = codifyJitFn(compiled.isType);
    const typeErrors = codifyJitFn(compiled.typeErrors);
    const jsonEncode = codifyJitFn(compiled.jsonEncode);
    const jsonDecode = codifyJitFn(compiled.jsonDecode);
    const jsonStringify = codifyJitFn(compiled.jsonStringify, [asJSONStringVarname]);
    return `{\n isType:${isType},\n typeErrors:${typeErrors},\n jsonEncode:${jsonEncode},\n jsonDecode:${jsonDecode},\n jsonStringify:${jsonStringify}\n}`;
}

/** Transform a SerializableJITFunctions into a JITFunctions */
export function restoreJitFunctions(serializable: SerializableJITFunctions): JITFunctions {
    type restoredFn = (...args: any[]) => any;
    const restored = serializable as JITFunctions;
    const stringifyNewFn = new Function(restored.jsonStringify.varNames[0], asJSONStringVarname, restored.jsonStringify.code) as (
        vλluε: JSONValue,
        asJson: (string) => string
    ) => any;
    const stringifyFn = (vλluε: any) => stringifyNewFn(vλluε, asJSONString);
    restored.isType.fn = new Function(...restored.isType.varNames, restored.isType.code) as restoredFn;
    restored.typeErrors.fn = new Function(...restored.typeErrors.varNames, restored.typeErrors.code) as restoredFn;
    restored.jsonEncode.fn = new Function(...restored.jsonEncode.varNames, restored.jsonEncode.code) as restoredFn;
    restored.jsonDecode.fn = new Function(...restored.jsonDecode.varNames, restored.jsonDecode.code) as restoredFn;
    restored.jsonStringify.fn = stringifyFn as restoredFn;

    return serializable as JITFunctions;
}

/**
 * Restored JITFunctions after they have been codified and parsed by js.
 * Codified stringify function are missing the asJSONString wrapper, so it is added here.
 */
export function restoreCodifiedJitFunctions(jitFns: JITFunctions): JITFunctions {
    const originalStringifyFn = jitFns.jsonStringify.fn as (a: any, b) => string;
    jitFns.jsonStringify.fn = (vλluε: any) => originalStringifyFn(vλluε, asJSONString);
    return jitFns;
}
