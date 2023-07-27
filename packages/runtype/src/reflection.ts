/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JSONPartial, SerializedTypes, Type, TypeFunction, reflect, serializeType} from '@deepkit/type';
import {
    FunctionReflection,
    ParamsValidationResponse,
    ReflectionOptions,
    ReturnValidationResponse,
    getHandlerType,
    isAsyncHandler,
} from './types';
import {
    getFunctionParamValidators,
    getFunctionReturnValidator,
    validateFunctionParams,
    validateFunctionReturnType,
} from './validation';
import {
    deserializeFunctionParams,
    getFunctionParamsDeserializer,
    getFunctionParamsSerializer,
    getFunctionReturnDeserializer,
    getFunctionReturnSerializer,
    serializeFunctionParams,
} from './serialization';

// this is equivalent to SimpleHandler in the router but we don't want circular dependencies so redefined here
type Handler<Ret = any> = (...params: any[]) => Ret | Promise<Ret>;

function getFunctionParamsLength(handlerType: TypeFunction, skipInitialParams: number): number {
    const length = handlerType.parameters.length;
    return length <= skipInitialParams ? 0 : length - skipInitialParams;
}

// implement a lazy function reflection class that implements the FunctionReflection interface but is using getters to lazy load the properties
class LazyFunctionReflection implements FunctionReflection {
    public readonly handlerType: TypeFunction;
    public readonly paramsLength: number;
    public readonly isAsync: boolean;
    private _validateParams: null | ((params: any[]) => ParamsValidationResponse) = null;
    private _serializeParams: null | ((params: any[]) => JSONPartial<any>[]) = null;
    private _deserializeParams: null | ((serializedParams: JSONPartial<any>[]) => any[]) = null;
    private _validateReturn: null | ((returnValue: any) => ReturnValidationResponse) = null;
    private _serializeReturn: null | ((returnValue: any) => JSONPartial<any>) = null;
    private _deserializeReturn: null | ((serializedReturnValue: JSONPartial<any>) => any) = null;

    constructor(handlerOrType: Handler | Type, private reflectionOptions: ReflectionOptions, private skipInitialParams: number) {
        this.handlerType = getHandlerType(handlerOrType);
        this.paramsLength = getFunctionParamsLength(this.handlerType, skipInitialParams);
        this.isAsync = isAsyncHandler(this.handlerType);
    }

    get validateParams(): (params: any[]) => ParamsValidationResponse {
        if (!this._validateParams) {
            const paramsValidator = getFunctionParamValidators(this.handlerType, this.reflectionOptions, this.skipInitialParams);
            this._validateParams = (params: any[]) => validateFunctionParams(paramsValidator, params);
        }
        return this._validateParams;
    }

    get serializeParams(): (params: any[]) => JSONPartial<any>[] {
        if (!this._serializeParams) {
            const paramsSerializer = getFunctionParamsSerializer(
                this.handlerType,
                this.reflectionOptions,
                this.skipInitialParams
            );
            this._serializeParams = (params: any[]) => serializeFunctionParams(paramsSerializer, params);
        }
        return this._serializeParams;
    }

    get deserializeParams(): (serializedParams: JSONPartial<any>[]) => any[] {
        if (!this._deserializeParams) {
            const paramsDeserializer = getFunctionParamsDeserializer(
                this.handlerType,
                this.reflectionOptions,
                this.skipInitialParams
            );
            this._deserializeParams = (serializedParams: JSONPartial<any>[]) =>
                deserializeFunctionParams(paramsDeserializer, serializedParams);
        }
        return this._deserializeParams;
    }

    get validateReturn(): (returnValue: any) => ReturnValidationResponse {
        if (!this._validateReturn) {
            const returnValidator = getFunctionReturnValidator(this.handlerType, this.reflectionOptions);
            this._validateReturn = (returnValue: any) => validateFunctionReturnType(returnValidator, returnValue);
        }
        return this._validateReturn;
    }

    get serializeReturn(): (returnValue: any) => JSONPartial<any> {
        if (!this._serializeReturn) {
            const returnSerializer = getFunctionReturnSerializer(this.handlerType, this.reflectionOptions);
            this._serializeReturn = (returnValue: any) => returnSerializer(returnValue);
        }
        return this._serializeReturn;
    }

    get deserializeReturn(): (serializedReturnValue: JSONPartial<any>) => any {
        if (!this._deserializeReturn) {
            const returnDeserializer = getFunctionReturnDeserializer(this.handlerType, this.reflectionOptions);
            this._deserializeReturn = (serializedReturnValue: JSONPartial<any>) => returnDeserializer(serializedReturnValue);
        }
        return this._deserializeReturn;
    }
}

/**
 * Gets an object with all the functions required to, serialize, deserialize and validate a function.
 * @param handlerOrType
 * @param reflectionOptions
 * @param skipInitialParams
 * @returns
 */
export function getFunctionReflectionMethods(
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionReflection {
    return new LazyFunctionReflection(handlerOrType, reflectionOptions, skipInitialParams);
}

/** Gets a data structure that can be serialized in json and transmitted over the wire  */
export const getSerializedFunctionTypes = (handler: Handler): SerializedTypes => serializeType(reflect(handler));
