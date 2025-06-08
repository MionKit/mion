/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {statusCodeToReasonPhrase} from './status-codes';
import {CoreOptions, AnyErrorParams, PublicRpcError, PlainObject, StrNumber} from './types';
import {DEFAULT_CORE_OPTIONS} from './constants';
import {randomUUID_V7} from '@mionkit/core/src/utils';
import {jitUtils} from '@mionkit/core/src/jitUtils';

let options: CoreOptions = {...DEFAULT_CORE_OPTIONS};

export function setErrorOptions(opts: CoreOptions) {
    options = opts;
}

export class RpcError<ErrType extends StrNumber = any, ErrData = any> extends Error {
    /** Error type, can be used as discriminator in union types switch, etc*/
    public readonly type: ErrType;
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

    // name and message are properties from Native Error but must be added for run-types to work correctly
    /** original error used to create the RpcError */
    public readonly name: string;
    /** the error message, it is private and wont be returned in the response. */
    public readonly message: string;

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
        super(originalMessage);
        this.message = originalMessage;
        this.name = name || statusCodeToReasonPhrase[statusCode] || 'UnknownError';
        if (originalError?.stack) super.stack = originalError?.stack;
        const {autoGenerateErrorId} = options;
        this.type = type || ('unknown' as any);
        this.id = id || autoGenerateErrorId ? randomUUID_V7() : undefined;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage || '';
        this.errorData = errorData;
        Object.setPrototypeOf(this, RpcError.prototype);
        // sets proper json serialization for message
        Object.defineProperty(this, 'message', {enumerable: true});
    }

    /** returns an error without stack trace an massage is swapped by public message */
    toPublicError(): PublicRpcError<ErrType, ErrData> {
        const err: PublicRpcError<ErrType, ErrData> = {
            type: this.type,
            ...(this.id ? {id: this.id} : {}),
            name: this.name,
            statusCode: this.statusCode,
            message: this.publicMessage,
            ...(this.errorData ? {errorData: this.errorData} : {}),
        };
        return err;
    }
}

// #######  Error Type Guards #######

const hasUnknownKeys = (knownKeys: string[], error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) return true;
    const unknownKeys = Object.keys(error as object);
    return unknownKeys.some((ukn) => !knownKeys.includes(ukn));
};

/** Returns true if the error is a RpcError or has the same structure. */
export function isRpcError(error: any): error is RpcError {
    if (!error) return false;
    if (error instanceof RpcError) return true;
    return (
        error &&
        typeof error.statusCode === 'number' &&
        typeof error.name === 'string' &&
        (typeof error.message === 'string' || typeof error.publicMessage === 'string') &&
        (typeof error.id === 'string' || typeof error.id === 'number' || error.id === undefined) &&
        !hasUnknownKeys(['id', 'statusCode', 'message', 'publicMessage', 'name', 'errorData'], error)
    );
}

jitUtils.setDeserializeFn(RpcError, (serializedItem: PlainObject<RpcError>) => {
    return new RpcError(serializedItem);
});
