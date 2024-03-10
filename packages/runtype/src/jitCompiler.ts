/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CompiledFunctions, JSONValue, RunType, RunTypeValidationError} from './types';
import {toLiteral} from './utils';

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

export function buildIsTypeJITFn(runType: RunType, varName = 'vλluε'): (vλluε: any) => boolean {
    const varNameNest = `${varName}${runType.nestLevel}`;
    const code = runType.JIT_isType(varNameNest);
    // console.log(code);
    return new Function(varNameNest, `return ${code}`) as (vλluε: any) => boolean;
}

export function buildTypeErrorsJITFn(
    runType: RunType,
    varName = 'vλluε',
    errorsName = 'εrrΦrs',
    rootPath = ''
): (vλluε: any) => RunTypeValidationError[] {
    const code = runType.JIT_typeErrors(varName, errorsName, toLiteral(rootPath));
    // console.log(code);
    return new Function(varName, `const ${errorsName} = []; ${code}; return ${errorsName};`) as (
        vλluε: any
    ) => RunTypeValidationError[];
}

export function buildJsonEncodeJITFn(runType: RunType, varName = 'vλluε'): (vλluε: any) => JSONValue {
    const code = runType.JIT_jsonEncode(varName);
    // console.log(code);
    return new Function(varName, `return ${code};`) as (vλluε: any) => JSONValue;
}

export function buildJsonDecodeJITFn(runType: RunType, varName = 'vλluε'): (vλluε: JSONValue) => any {
    const code = runType.JIT_jsonDecode(varName);
    // console.log(code);
    return new Function(varName, `return ${code};`) as (vλluε: JSONValue) => any;
}

export function buildJsonStringifyJITFn(runType: RunType, varName = 'vλluε'): (vλluε: any) => string {
    const code = runType.JIT_jsonStringify(varName);
    // console.log(code);
    return new Function(varName, `return ${code};`) as (vλluε: any) => string;
}
