/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {randomUUID} from 'crypto';
import {statusCodeToReasonPhrase} from './status-codes';
import {CoreOptions, AnyErrorParams, AnonymRpcError} from './types';
import {DEFAULT_CORE_OPTIONS} from './constants';

let options: CoreOptions = {...DEFAULT_CORE_OPTIONS};

export function setErrorOptions(opts: CoreOptions) {
    options = opts;
}

export class RpcError extends Error {
    /** id of the error, if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated */
    public readonly id?: number | string;
    /** response status code */
    public readonly statusCode: number;
    /** the message that will be returned in the response */
    public readonly publicMessage: string;
    /** options data related to the error, ie validation data */
    public readonly errorData?: Readonly<unknown>;

    constructor({statusCode, message, publicMessage, originalError, errorData, name, id}: AnyErrorParams) {
        super(message || originalError?.message || publicMessage);
        super.name = name || statusCodeToReasonPhrase[statusCode] || 'UnknownError';
        if (originalError?.stack) super.stack = originalError?.stack;
        const {autoGenerateErrorId} = options;
        this.id = id || autoGenerateErrorId ? `${new Date().toISOString()}@${randomUUID()}` : undefined;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage || '';
        this.errorData = errorData as Readonly<unknown>;
        Object.setPrototypeOf(this, RpcError.prototype);
        // sets proper json serialization for message
        Object.defineProperty(this, 'message', {enumerable: true});
    }

    /** returns an error without stack trace an massage is swapped by public message */
    toAnonymizedError(): AnonymRpcError {
        const err: AnonymRpcError = {
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

const hasUnknownKeys = (knownKeys, error) => {
    if (typeof error !== 'object') return true;
    const unknownKeys = Object.keys(error);
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
