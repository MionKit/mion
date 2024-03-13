/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CompiledFunctions, JSONValue, JitFunctions, RunType, RunTypeValidationError} from './types';

export class JITCompiler implements CompiledFunctions {
    public readonly isType: CompiledFunctions['isType'];
    public readonly typeErrors: CompiledFunctions['typeErrors'];
    public readonly jsonEncode: CompiledFunctions['jsonEncode'];
    public readonly jsonDecode: CompiledFunctions['jsonDecode'];
    public readonly jsonStringify: CompiledFunctions['jsonStringify'];
    constructor(runType: RunType, jitFunctions?: JitFunctions) {
        this.isType = buildIsTypeJITFn(runType, jitFunctions);
        this.typeErrors = buildTypeErrorsJITFn(runType, jitFunctions);
        this.jsonEncode = buildJsonEncodeJITFn(runType, jitFunctions);
        this.jsonDecode = buildJsonDecodeJITFn(runType, jitFunctions);
        this.jsonStringify = buildJsonStringifyJITFn(runType, jitFunctions);
    }
}

export function buildIsTypeJITFn(runType: RunType, jitFunctions?: JitFunctions): CompiledFunctions['isType'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.isType ? jitFunctions.isType(varName) : runType.JIT_isType(varName);
    const code = `return ${jitCode};`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => boolean;
        return {varName, code, fn};
    } catch (e: any) {
        throw new Error(`Error building isType JIT function for ${runType.name}: ${e?.message}.\nCode: ${code}`);
    }
}

export function buildTypeErrorsJITFn(runType: RunType, jitFunctions?: JitFunctions): CompiledFunctions['typeErrors'] {
    const varName = `vλluε${runType.nestLevel}`;
    const errorsName = `εrrΦrs${runType.nestLevel}`;
    const jitCode = jitFunctions?.typeErrors
        ? jitFunctions.typeErrors(varName, errorsName, `''`)
        : runType.JIT_typeErrors(varName, errorsName, `''`);
    const code = `const ${errorsName} = []; ${jitCode}; return ${errorsName};`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => RunTypeValidationError[];
        return {varName, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building typeErrors JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonEncodeJITFn(runType: RunType, jitFunctions?: JitFunctions): CompiledFunctions['jsonEncode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonEncode ? jitFunctions.jsonEncode(varName) : runType.JIT_jsonEncode(varName);
    const code = `return ${jitCode};`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => JSONValue;
        return {varName, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonEncode JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonDecodeJITFn(runType: RunType, jitFunctions?: JitFunctions): CompiledFunctions['jsonDecode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonDecode ? jitFunctions.jsonDecode(varName) : runType.JIT_jsonDecode(varName);
    const code = `return ${jitCode};`;
    try {
        const fn = new Function(varName, code) as (vλluε: JSONValue) => any;
        return {varName, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonDecode JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}

export function buildJsonStringifyJITFn(runType: RunType, jitFunctions?: JitFunctions): CompiledFunctions['jsonStringify'] {
    const varName = `vλluε${runType.nestLevel}`;
    const jitCode = jitFunctions?.jsonStringify ? jitFunctions.jsonStringify(varName) : runType.JIT_jsonStringify(varName);
    const code = `return ${jitCode};`;
    try {
        const fn = new Function(varName, code) as (vλluε: any) => string;
        return {varName, code, fn};
    } catch (e: any) {
        const fnCode = ` Code:\nfunction anonymous(){${code}}`;
        throw new Error(`Error building jsonStringify JIT function for ${runType.name}: ${e?.message}.${fnCode}`);
    }
}
