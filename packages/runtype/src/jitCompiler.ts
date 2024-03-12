/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CompiledFunctions, JSONValue, RunType, RunTypeValidationError} from './types';

export class JITCompiler implements CompiledFunctions {
    public readonly isType: CompiledFunctions['isType'];
    public readonly typeErrors: CompiledFunctions['typeErrors'];
    public readonly jsonEncode: CompiledFunctions['jsonEncode'];
    public readonly jsonDecode: CompiledFunctions['jsonDecode'];
    public readonly jsonStringify: CompiledFunctions['jsonStringify'];
    constructor(runType: RunType) {
        this.isType = buildIsTypeJITFn(runType);
        this.typeErrors = buildTypeErrorsJITFn(runType);
        this.jsonEncode = buildJsonEncodeJITFn(runType);
        this.jsonDecode = buildJsonDecodeJITFn(runType);
        this.jsonStringify = buildJsonStringifyJITFn(runType);
    }
}

export function buildIsTypeJITFn(runType: RunType): CompiledFunctions['isType'] {
    const varName = `vλluε${runType.nestLevel}`;
    const code = `return ${runType.JIT_isType(varName)};`;
    // console.log(code);
    const fn = new Function(varName, code) as (vλluε: any) => boolean;
    return {varName, code, fn};
}

export function buildTypeErrorsJITFn(runType: RunType): CompiledFunctions['typeErrors'] {
    const varName = `vλluε${runType.nestLevel}`;
    const errorsName = `εrrΦrs${runType.nestLevel}`;
    const code = `const ${errorsName} = []; ${runType.JIT_typeErrors(varName, errorsName, `''`)}; return ${errorsName};`;
    // console.log(code);
    const fn = new Function(varName, code) as (vλluε: any) => RunTypeValidationError[];
    return {varName, code, fn};
}

export function buildJsonEncodeJITFn(runType: RunType): CompiledFunctions['jsonEncode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const code = `return ${runType.JIT_jsonEncode(varName)};`;
    // console.log(code);
    const fn = new Function(varName, code) as (vλluε: any) => JSONValue;
    return {varName, code, fn};
}

export function buildJsonDecodeJITFn(runType: RunType): CompiledFunctions['jsonDecode'] {
    const varName = `vλluε${runType.nestLevel}`;
    const code = `return ${runType.JIT_jsonDecode(varName)};`;
    // console.log(code);
    const fn = new Function(varName, code) as (vλluε: JSONValue) => any;
    return {varName, code, fn};
}

export function buildJsonStringifyJITFn(runType: RunType): CompiledFunctions['jsonStringify'] {
    const varName = `vλluε${runType.nestLevel}`;
    const code = `return ${runType.JIT_jsonStringify(varName)};`;
    // console.log(code);
    const fn = new Function(varName, code) as (vλluε: any) => string;
    return {varName, code, fn};
}
