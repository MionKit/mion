/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {reflect, validateFunction, Type, isType, SerializationOptions} from '@deepkit/type';
import {
    ReflectionOptions,
    Handler,
    FunctionParamValidator,
    isFunctionType,
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
export const getFunctionParamValidators = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionParamValidator[] => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');

    /* 
        TODO: https://github.com/MionKit/mion/issues/15
        if we remove any skip params like app and ctx from functions then we could use `validateFunction`
        and pass the handlerType instead creating an array of validator fo each param
        this could be more performant. 
    */
    const paramValidators = handlerType.parameters.map((paramType, index) => {
        // assumes the context type that is the first parameter is always valid
        return index > 0 ? validateFunction(reflectionOptions.customSerializer, paramType) : () => [];
    });

    return paramValidators.slice(skipInitialParams);
};

/**
 * Validate route parameters
 * @param functionName
 * @param validators
 * @param params
 * @returns
 */
export const validateFunctionParams = (validators: FunctionParamValidator[], params: any[] = []): ParamsValidationResponse => {
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
};

/**
 * Returns a function to validate route handler return type
 * @param handlerOrType
 * @param reflectionOptions
 * @returns
 */
export const getFunctionReturnValidator = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions
): FunctionReturnValidator => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');
    return validateFunction(reflectionOptions.customSerializer, handlerType.return);
};

/**
 * Validates a function return type
 * @param functionName
 * @param returnValidator
 * @param returnValue
 * @returns
 */
export const validateFunctionReturnType = (
    returnValidator: FunctionReturnValidator,
    returnValue: any
): ReturnValidationResponse => {
    const itemErrors = returnValidator(returnValue).map((error) => ({
        path: error.path,
        message: error.message,
        code: error.code,
    }));
    return {
        hasErrors: !!itemErrors.length,
        error: itemErrors,
    };
};
