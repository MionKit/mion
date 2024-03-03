/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JSONValue, RunType, RunTypeValidationError} from './types';

export function getValidateFunction(runType: RunType, varName = 'vλluε'): (vλluε: any) => boolean {
    const code = runType.getValidateCode(varName);
    return new Function(varName, `return ${code}`) as (vλluε: any) => boolean;
}

export function getValidateWithErrorsFunction(
    runType: RunType,
    varName = 'vλluε',
    errorsName = 'εrrΦrs'
): (vλluε: any) => RunTypeValidationError[] {
    const code = runType.getValidateCodeWithErrors(varName, errorsName);
    return new Function(varName, `const ${errorsName} = []; ${code}; return ${errorsName};`) as (
        vλluε: any
    ) => RunTypeValidationError[];
}

export function getJsonEncodeFunction(runType: RunType, varName = 'vλluε'): (vλluε: any) => JSONValue {
    const code = runType.getJsonEncodeCode(varName);
    return new Function(varName, `return ${code};`) as (vλluε: any) => JSONValue;
}

export function getJsonDecodeFunction(runType: RunType, varName = 'vλluε'): (vλluε: JSONValue) => any {
    const code = runType.getJsonDecodeCode(varName);
    return new Function(varName, `return ${code};`) as (vλluε: JSONValue) => any;
}

export function getMockFunction(runType: RunType, varName = 'vλluε'): () => any {
    const code = runType.getMockCode(varName);
    return new Function(varName, `${code}; return vλluε;`) as () => any;
}
