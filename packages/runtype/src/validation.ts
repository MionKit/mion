/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {reflect, validateFunction, Type, isType} from '@deepkit/type';
import {ReflectionOptions, Handler, FunctionParamValidator, isFunctionType, FunctionReturnValidator} from './types';

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
export const validateFunctionParams = (
    functionName: string,
    validators: FunctionParamValidator[],
    params: any[] = []
): string[] => {
    if (params.length !== validators.length) throw new Error('Invalid number of parameters');
    const errors = validators.map((validate, index) => validate(params[index])).flat();
    // TODO: return default error instead new one, we might nee to change RouteError so it can handle returning error data
    return errors.map((validationError, index) => `Invalid param[${index}] in '${functionName}', ${validationError.toString()}.`);
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
    functionName: string,
    returnValidator: FunctionReturnValidator,
    returnValue: any
): string[] => {
    const errors = returnValidator(returnValue);
    // TODO: return default error instead new one
    return errors.map((validationError, index) => `Invalid return type '${functionName}', ${validationError.toString()}.`);
};
