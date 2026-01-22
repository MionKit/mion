/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions, AnyErrorParams, TypedErrorParams, DataOnly, RpcErrorParams, RunTypeError} from './types/general.types';
import {DEFAULT_CORE_OPTIONS} from './constants';
import {randomUUID_V7} from './utils';
import {getJitUtils} from './jitUtils';

// ############# AOT Error Types #############

/**
 * Error thrown when AOT caches are not loaded but strict mode is enabled.
 * This error indicates that the router was initialized with aotMode: 'strict'
 * but no AOT caches were loaded via addAOTCaches().
 */
export class AOTCachesNotLoadedError extends Error {
    public readonly 'mion@isΣrrθr': true = true;
    public readonly type = 'aot-caches-not-loaded' as const;

    constructor() {
        super(
            'AOT caches not loaded. In strict mode, AOT caches must be loaded before initializing the router. ' +
                "Call addAOTCaches() before initRouter() or use aotMode: 'auto'."
        );
        this.name = 'AOTCachesNotLoadedError';
        Object.setPrototypeOf(this, AOTCachesNotLoadedError.prototype);
    }
}

/**
 * Error thrown when a required JIT function is not found in the AOT cache.
 * This error indicates that the AOT caches are incomplete or were generated
 * with a different version of the routes.
 */
export class AOTFunctionMissingError extends Error {
    public readonly 'mion@isΣrrθr': true = true;
    public readonly type = 'aot-function-missing' as const;
    public readonly functionHash: string;
    public readonly routeId: string;

    constructor(routeId: string, functionHash: string) {
        super(
            `AOT function missing for route '${routeId}'. JIT function with hash '${functionHash}' not found in cache. ` +
                'Ensure AOT caches are properly generated and loaded.'
        );
        this.name = 'AOTFunctionMissingError';
        this.functionHash = functionHash;
        this.routeId = routeId;
        Object.setPrototypeOf(this, AOTFunctionMissingError.prototype);
    }
}

/**
 * Error thrown when a route is not found in the AOT router cache.
 * This error indicates that the route was not included when generating AOT caches.
 */
export class AOTRouterCacheMissingError extends Error {
    public readonly 'mion@isΣrrθr': true = true;
    public readonly type = 'aot-router-cache-missing' as const;
    public readonly routeId: string;

    constructor(routeId: string) {
        super(
            `Route '${routeId}' not found in AOT router cache. ` +
                'Ensure AOT caches are properly generated and include this route.'
        );
        this.name = 'AOTRouterCacheMissingError';
        this.routeId = routeId;
        Object.setPrototypeOf(this, AOTRouterCacheMissingError.prototype);
    }
}

// ############# Validation Error Types #############

/**
 * Error data structure for validation errors.
 * Contains the list of type errors from parameter validation.
 */
export interface ValidationErrorData {
    /** List of type validation errors with paths and expected types */
    typeErrors: RunTypeError[];
}

/**
 * Strongly typed validation error.
 * Thrown when route or hook parameters fail type validation.
 * This type is included in the client error unions so validation errors can be properly typed.
 */
export type ValidationError = RpcError<'validation-error', ValidationErrorData>;

let options: CoreOptions = {...DEFAULT_CORE_OPTIONS};

export function setErrorOptions(opts: CoreOptions) {
    options = opts;
}

/**
 * Generic strongly typed error class that can be used outside RPC context.
 * Contains the core error properties: mion@isΣrrθr, type, and message.
 */
export class TypedError<ErrType extends string> extends Error {
    /**
     * Unique error identifier,
     * Ideally this should be a symbol but we need to be able to serialize it so a namespaced prop is used instead
     */
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    public readonly 'mion@isΣrrθr': true = true;
    /** Error type, can be used as discriminator in union types*/
    public readonly type: ErrType;
    // Note: message and name are NOT declared as properties here
    // They are inherited from Error class and assigned in constructor
    // This prevents them from being included in Deepkit's type reflection for JIT validation

    constructor({message, originalError, type}: TypedErrorParams<ErrType>) {
        const errorMessage = message || originalError?.message || '';
        super(errorMessage);
        this.type = type;

        // Set message and name as non-enumerable to exclude from JSON.stringify
        Object.defineProperty(this, 'message', {
            value: errorMessage,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        Object.defineProperty(this, 'name', {
            value: 'TypedError',
            writable: true,
            enumerable: false,
            configurable: true,
        });

        if (originalError?.stack) {
            try {
                this.stack = originalError.stack;
            } catch {
                // Fallback to defineProperty if direct assignment fails
                try {
                    Object.defineProperty(this, 'stack', {
                        value: originalError.stack,
                        writable: true,
                        configurable: true,
                    });
                } catch {
                    // If both methods fail, the error will use its own generated stack
                }
            }
        }

        Object.setPrototypeOf(this, TypedError.prototype);
    }
}

// type-rpc-error-start
export class RpcError<ErrType extends string, ErrData = any>
    extends TypedError<ErrType>
    implements RpcErrorParams<ErrType, ErrData>
{
    // Note: name is NOT declared as a property here
    // It is inherited from Error class and assigned in constructor
    // This prevents it from being included in Deepkit's type reflection for JIT validation
    /**
     * id of the error, ideally each error should unique identifiable
     * * if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated
     * */
    public readonly id?: number | string;
    /** the message that will be returned in the response */
    public readonly publicMessage: string;
    /** options data related to the error, ie validation data, must be json serializable */
    public readonly errorData?: Readonly<ErrData>;
    /** optional http status code */
    statusCode?: number;

    constructor({message, publicMessage, originalError, errorData, type, id, statusCode}: AnyErrorParams<ErrType, ErrData>) {
        const originalMessage = message || originalError?.message || publicMessage || '';

        // Call parent TypedError constructor
        super({
            message: originalMessage,
            originalError,
            type,
        });

        const {autoGenerateErrorId} = options;
        this.id = id ?? (autoGenerateErrorId ? randomUUID_V7() : undefined);
        this.publicMessage = publicMessage || '';
        this.errorData = errorData;
        this.statusCode = statusCode;

        // Override name to be non-enumerable
        Object.defineProperty(this, 'name', {
            value: 'RpcError',
            writable: true,
            enumerable: false,
            configurable: true,
        });

        Object.setPrototypeOf(this, RpcError.prototype);
    }
}
// type-rpc-error-end

// #######  Error Type Guards #######

/** Returns true if the error is a TypedError or has the same structure. */
export function isTypedError(error: any): error is TypedError<any> {
    if (!error) return false;
    if (error instanceof TypedError) return true;
    return (
        error &&
        error['mion@isΣrrθr'] === true &&
        (typeof error.type === 'string' || typeof error.type === 'number') &&
        !getJitUtils().hasUnknownKeysFromArray(error, ['mion@isΣrrθr', 'type', 'message'])
    );
}

/** Returns true if the error is a RpcError or has the same structure. */
export function isRpcError(error: any): error is RpcError<string> {
    if (!error) return false;
    if (error instanceof RpcError) return true;
    return (
        error &&
        error['mion@isΣrrθr'] === true &&
        (typeof error.type === 'string' || typeof error.type === 'number') &&
        (error.id === undefined || typeof error.id === 'string' || typeof error.id === 'number') &&
        !getJitUtils().hasUnknownKeysFromArray(error, [
            'mion@isΣrrθr',
            'id',
            'message',
            'publicMessage',
            'errorData',
            'type',
            'statusCode',
        ])
    );
}

/**
 * Returns true if the error is a TypedError, RpcError, or any other Javascript Error.
 * if available uses Error.isError() or 'mion@isΣrrθr' prop from TypedError
 * Does not do strict type checking. This function is intended to quickly identify errors.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError
 */
export function isAnyError(error: any): error is TypedError<any> | RpcError<string> | Error {
    if (!error) return false;
    const tErr = error as TypedError<string>;
    if (tErr['mion@isΣrrθr'] === true) return true;
    if (typeof (Error as any).isError === 'function') return (Error as any).isError(error);
    return error instanceof Error;
}

let errorDeserializersRegistered = false;
/**
 * Registers error deserializers for TypedError and RpcError.
 * This is required to automatically restore TypedError and RpcError sent over the network.
 */
export function registerErrorDeserializers() {
    if (errorDeserializersRegistered) return;
    if (!TypedError || !RpcError) return; // Not loaded yet
    errorDeserializersRegistered = true;

    getJitUtils().setDeserializeFn(TypedError, (data: DataOnly<any>) => {
        return new TypedError(data);
    });

    getJitUtils().setDeserializeFn(RpcError, (data: DataOnly<any>) => {
        return new RpcError(data);
    });
}
