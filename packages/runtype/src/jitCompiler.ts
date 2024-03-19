/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {asJSONStringVarname} from './constants';
import {JITFunctions, JSONValue, JitFunctions, RunType, RunTypeValidationError, SerializableJITFunctions} from './types';
import {asJSONString} from './utils';

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
