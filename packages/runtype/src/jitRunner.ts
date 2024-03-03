/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JSONValue, RunType, RunTypeValidationError} from './types';

export function getValidateJitFunction(runType: RunType, varName = 'vλluε'): (vλluε: any) => boolean {
    const varNameNest = `${varName}${runType.nestLevel}`;
    const code = runType.getValidateCode(varNameNest);
    return new Function(varNameNest, `return ${code}`) as (vλluε: any) => boolean;
}

export function getJitValidateWithErrorsFn(
    runType: RunType,
    varName = 'vλluε',
    errorsName = 'εrrΦrs'
): (vλluε: any) => RunTypeValidationError[] {
    const itemPath = `'${runType.path}'`;
    const code = runType.getValidateCodeWithErrors(varName, errorsName, itemPath);
    return new Function(varName, `const ${errorsName} = []; ${code}; return ${errorsName};`) as (
        vλluε: any
    ) => RunTypeValidationError[];
}

export function getJitJsonEncodeFn(runType: RunType, varName = 'vλluε'): (vλluε: any) => JSONValue {
    const code = runType.getJsonEncodeCode(varName);
    return new Function(varName, `return ${code};`) as (vλluε: any) => JSONValue;
}

export function getJitJsonDecodeFn(runType: RunType, varName = 'vλluε'): (vλluε: JSONValue) => any {
    const code = runType.getJsonDecodeCode(varName);
    return new Function(varName, `return ${code};`) as (vλluε: JSONValue) => any;
}

export function getJitMockFn(runType: RunType, varName = 'vλluε'): () => any {
    const code = runType.getMockCode(varName);
    return new Function(varName, `${code}; return ${varName};`) as () => any;
}
