/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {statusCodeToReasonPhrase} from './status-codes';
import {CoreOptions, AnyErrorParams, PublicRpcError, DataOnly, StrNumber, TypedErrorParams} from './types';
import {DEFAULT_CORE_OPTIONS} from './constants';
import {randomUUID_V7} from '@mionkit/core/utils';
import {jitUtils} from '@mionkit/core/jitUtils';

let options: CoreOptions = {...DEFAULT_CORE_OPTIONS};

export function setErrorOptions(opts: CoreOptions) {
    options = opts;
}

/**
 * Generic strongly typed error class that can be used outside RPC context.
 * Contains the core error properties: isΣrrθr, type, name, and message.
 */
export class TypedError<ErrType extends StrNumber> extends Error {
    public readonly isΣrrθr = true;
    /** Error type, can be used as discriminator in union types switch, etc*/
    public readonly type: ErrType;
    /** name of the error */
    public readonly name: string;
    /** the error message */
    public readonly message: string;

    constructor({message, originalError, name, type}: TypedErrorParams<ErrType>) {
        const errorMessage = message || originalError?.message || '';
        super(errorMessage);
        this.message = errorMessage;
        this.name = name || 'TypedError';
        this.type = type || ('unknown' as any);

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

export class RpcError<ErrType extends StrNumber = any, ErrData = any> extends TypedError<ErrType> {
    /**
     * id of the error, ideally each error should unique identifiable
     * * if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated
     * */
    public readonly id?: number | string;
    /** response status code */
    public readonly statusCode: number;
    /** the message that will be returned in the response */
    public readonly publicMessage: string;
    /** options data related to the error, ie validation data */
    public readonly errorData?: Readonly<ErrData>;

    constructor({
        statusCode,
        message,
        publicMessage,
        originalError,
        errorData,
        name,
        id,
        type,
    }: AnyErrorParams<ErrType, ErrData>) {
        const originalMessage = message || originalError?.message || publicMessage || '';
        const errorName = name || statusCodeToReasonPhrase[statusCode] || 'UnknownError';

        // Call parent TypedError constructor
        super({
            message: originalMessage,
            originalError,
            name: errorName,
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
        const {isΣrrθr, type, name, statusCode, id, errorData, publicMessage} = this;
        return {
            isΣrrθr,
            type,
            name,
            statusCode,
            message: publicMessage,
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
        error.isΣrrθr === true &&
        typeof error.name === 'string' &&
        typeof error.message === 'string' &&
        (typeof error.type === 'string' || typeof error.type === 'number') &&
        !jitUtils.hasUnknownKeysFromArray(error, ['isΣrrθr', 'type', 'name', 'message'])
    );
}

/** Returns true if the error is a RpcError or has the same structure. */
export function isRpcError(error: any): error is RpcError {
    if (!error) return false;
    if (error instanceof RpcError) return true;
    return (
        error &&
        error.isΣrrθr === true &&
        typeof error.statusCode === 'number' &&
        typeof error.name === 'string' &&
        (typeof error.message === 'string' || typeof error.publicMessage === 'string') &&
        (typeof error.id === 'string' || typeof error.id === 'number' || error.id === undefined) &&
        !jitUtils.hasUnknownKeysFromArray(error, ['isΣrrθr', 'id', 'statusCode', 'message', 'publicMessage', 'name', 'errorData'])
    );
}

jitUtils.setDeserializeFn(TypedError, (serializedItem: DataOnly<TypedError<any>>) => {
    return new TypedError(serializedItem);
});

jitUtils.setDeserializeFn(RpcError, (serializedItem: DataOnly<RpcError>) => {
    return new RpcError(serializedItem);
});
