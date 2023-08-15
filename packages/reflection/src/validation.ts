/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {validateFunction, TypeFunction} from '@deepkit/type';
import {
    ReflectionOptions,
    FunctionParamValidator,
    FunctionReturnValidator,
    ParamsValidationResponse,
    ReturnValidationResponse,
} from './types';

/**
 * Returns an array of functions to validate route handler parameters,
 * First param is excluded from the returned array a is alway the route Context and doesn't need to be validated
 * @param handlerOrType
 * @param reflectionOptions
 * @param skipParams
 * @returns an array containing a validation function for each parameter
 */
export function getFunctionParamValidators(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionParamValidator[] {
    const paramValidators = handlerType.parameters.map((paramType, index) => {
        return index >= skipInitialParams ? validateFunction(reflectionOptions.customSerializer, paramType) : () => [];
    });

    return skipInitialParams > 0 ? paramValidators.slice(skipInitialParams) : paramValidators;
}

/**
 * Validate route parameters
 * @param functionName
 * @param validators
 * @param params
 * @returns
 */
export function validateFunctionParams(validators: FunctionParamValidator[], params: any[] = []): ParamsValidationResponse {
    if (params.length > validators.length) throw new Error('Invalid number of parameters');
    let totalErrors = 0;
    const errors = validators.map((validate, index) => {
        const param = params[index];
        const itemErrors = validate(param).map((error) => ({
            path: error.path,
            message: error.message,
            code: error.code,
        }));
        totalErrors += itemErrors.length;
        return itemErrors;
    });
    return {
        hasErrors: !!totalErrors,
        totalErrors,
        errors,
    };
}

/**
 * Returns a function to validate route handler return type
 * @param handlerOrType
 * @param reflectionOptions
 * @returns
 */
export function getFunctionReturnValidator(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions
): FunctionReturnValidator {
    return validateFunction(reflectionOptions.customSerializer, handlerType.return);
}

/**
 * Validates a function return type
 * @param functionName
 * @param returnValidator
 * @param returnValue
 * @returns
 */
export function validateFunctionReturnType(returnValidator: FunctionReturnValidator, returnValue: any): ReturnValidationResponse {
    const itemErrors = returnValidator(returnValue).map((error) => ({
        path: error.path,
        message: error.message,
        code: error.code,
    }));
    return {
        hasErrors: !!itemErrors.length,
        error: itemErrors,
    };
}
