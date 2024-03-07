/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JSONValue, RunType, RunTypeValidationError} from './types';
import {toLiteral} from './utils';

export function buildIsTypeJITFn(runType: RunType, varName = 'vλluε'): (vλluε: any) => boolean {
    const varNameNest = `${varName}${runType.nestLevel}`;
    const code = runType.isTypeJIT(varNameNest);
    // console.log(code);
    return new Function(varNameNest, `return ${code}`) as (vλluε: any) => boolean;
}

export function buildTypeErrorsJITFn(
    runType: RunType,
    varName = 'vλluε',
    errorsName = 'εrrΦrs',
    rootPath = ''
): (vλluε: any) => RunTypeValidationError[] {
    const code = runType.typeErrorsJIT(varName, errorsName, toLiteral(rootPath));
    // console.log(code);
    return new Function(varName, `const ${errorsName} = []; ${code}; return ${errorsName};`) as (
        vλluε: any
    ) => RunTypeValidationError[];
}

export function buildJsonEncodeJITFn(runType: RunType, varName = 'vλluε'): (vλluε: any) => JSONValue {
    const code = runType.jsonEncodeJIT(varName);
    // console.log(code);
    return new Function(varName, `return ${code};`) as (vλluε: any) => JSONValue;
}

export function buildJsonStringifyJITFn(runType: RunType, varName = 'vλluε'): (vλluε: any) => JSONValue {
    const code = runType.jsonStringifyJIT(varName);
    // console.log(code);
    return new Function(varName, `return ${code};`) as (vλluε: any) => JSONValue;
}

export function buildJsonDecodeJITFn(runType: RunType, varName = 'vλluε'): (vλluε: JSONValue) => any {
    const code = runType.jsonDecodeJIT(varName);
    // console.log(code);
    return new Function(varName, `return ${code};`) as (vλluε: JSONValue) => any;
}

export function buildMockJITFn(runType: RunType, varName = 'vλluε'): () => any {
    const code = runType.mockJIT(varName);
    // console.log(code);
    return new Function(varName, `${code}; return ${varName};`) as () => any;
}
