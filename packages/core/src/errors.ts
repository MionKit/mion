/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions, AnyErrorParams, PublicRpcError, TypedErrorParams, DataOnly} from './types/general.types';
import {DEFAULT_CORE_OPTIONS} from './constants';
import {randomUUID_V7} from './utils';
import {getJitUtils} from './jitUtils';

let options: CoreOptions = {...DEFAULT_CORE_OPTIONS};

export function setErrorOptions(opts: CoreOptions) {
    options = opts;
}

/**
 * Generic strongly typed error class that can be used outside RPC context.
 * Contains the core error properties: mion:isΣrrθr, type, and message.
 */
export class TypedError<ErrType extends string> extends Error {
    /**
     * Unique error identifier,
     * Ideally this should be a symbol but we need to be able to serialize it so a namespaced prop is used instead
     */
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    public readonly 'mion:isΣrrθr': true = true;
    /** Error type, can be used as discriminator in union types switch, etc*/
    public readonly type: ErrType;
    /** the error message */
    public readonly message: string;
    public readonly name: string = 'TypedError';

    constructor({message, originalError, type}: TypedErrorParams<ErrType>) {
        const errorMessage = message || originalError?.message || '';
        super(errorMessage);
        this.message = errorMessage;
        this.type = type;

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
        // sets proper json serialization for message
        Object.defineProperty(this, 'message', {enumerable: true});
    }
}

export class RpcError<ErrType extends string, ErrData = any> extends TypedError<ErrType> {
    public readonly name = 'RpcError';
    /**
     * id of the error, ideally each error should unique identifiable
     * * if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated
     * */
    public readonly id?: number | string;
    /** response status code */
    public readonly statusCode: number;
    /** the message that will be returned in the response */
    public readonly publicMessage: string;
    /** options data related to the error, ie validation data, must be json serializable */
    public readonly errorData?: Readonly<ErrData>;

    constructor({statusCode, message, publicMessage, originalError, errorData, type, id}: AnyErrorParams<ErrType, ErrData>) {
        const originalMessage = message || originalError?.message || publicMessage || '';

        // Call parent TypedError constructor
        super({
            message: originalMessage,
            originalError,
            type,
        });

        const {autoGenerateErrorId} = options;
        this.id = id || autoGenerateErrorId ? randomUUID_V7() : undefined;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage || '';
        this.errorData = errorData;
        Object.setPrototypeOf(this, RpcError.prototype);
    }

    /** returns an error without stack trace and message is swapped by public message */
    toPublicError(): PublicRpcError<ErrType, ErrData> {
        const {type, statusCode, id, errorData, publicMessage} = this;
        return {
            'mion:isΣrrθr': true,
            type,
            statusCode,
            publicMessage,
            ...(id && {id}),
            ...(errorData && {errorData}),
        };
    }
}

// #######  Error Type Guards #######

/** Returns true if the error is a TypedError or has the same structure. */
export function isTypedError(error: any): error is TypedError<any> {
    if (!error) return false;
    if (error instanceof TypedError) return true;
    return (
        error &&
        error['mion:isΣrrθr'] === true &&
        typeof error.message === 'string' &&
        (typeof error.type === 'string' || typeof error.type === 'number') &&
        !getJitUtils().hasUnknownKeysFromArray(error, ['mion:isΣrrθr', 'type', 'message'])
    );
}

/** Returns true if the error is a RpcError or has the same structure. */
export function isRpcError(error: any): error is RpcError<string> {
    if (!error) return false;
    if (error instanceof RpcError) return true;
    return (
        error &&
        error['mion:isΣrrθr'] === true &&
        typeof error.statusCode === 'number' &&
        (typeof error.type === 'string' || typeof error.type === 'number') &&
        (typeof error.message === 'string' || typeof error.publicMessage === 'string') &&
        (typeof error.id === 'string' || typeof error.id === 'number' || error.id === undefined) &&
        !getJitUtils().hasUnknownKeysFromArray(error, [
            'mion:isΣrrθr',
            'id',
            'statusCode',
            'message',
            'publicMessage',
            'errorData',
            'type',
        ])
    );
}

/** Returns true if the error is a TypedError, RpcError, or any other Javascript Error.
 * if available uses Error.isError()
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError
 */
export function isAnyError(error: any): error is TypedError<any> | RpcError<string> | Error {
    if (!error) return false;
    const tErr = error as TypedError<string>;
    if (tErr['mion:isΣrrθr'] === true) return true;
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
