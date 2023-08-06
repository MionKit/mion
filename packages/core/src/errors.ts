/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {randomUUID} from 'crypto';
import {statusCodeToReasonPhrase} from './status-codes';
import {CoreOptions, RouteErrorParams} from './types';
import {DEFAULT_CORE_OPTIONS} from './constants';

let options: CoreOptions = {...DEFAULT_CORE_OPTIONS};

export function setErrorOptions(opts: CoreOptions) {
    options = opts;
}

export class RouteError extends Error {
    /** id of the error, if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated */
    public readonly id?: number | string;
    /** response status code */
    public readonly statusCode: number;
    /** the message that will be returned in the response */
    public readonly publicMessage: string;
    /** options data related to the error, ie validation data */
    public readonly publicData?: Readonly<unknown>;

    constructor({statusCode, message, publicMessage, originalError, publicData, name, id}: RouteErrorParams) {
        super(message || originalError?.message || publicMessage);
        super.name = name || statusCodeToReasonPhrase[statusCode] || 'UnknownError';
        if (originalError?.stack) super.stack = originalError?.stack;
        const {autoGenerateErrorId} = options;
        this.id = id || autoGenerateErrorId ? `${new Date().toISOString()}@${randomUUID()}` : undefined;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage;
        this.publicData = publicData as Readonly<unknown>;
        Object.setPrototypeOf(this, RouteError.prototype);
        // sets proper json serialization
        if (message !== publicMessage) Object.defineProperty(this, 'message', {enumerable: true});
    }

    toPublicError(): PublicError {
        return new PublicError({
            name: this.name,
            statusCode: this.statusCode,
            message: this.publicMessage,
            id: this.id,
            errorData: this.publicData,
        });
    }
}

export class PublicError extends Error {
    readonly id?: number | string;
    readonly statusCode: number;
    readonly message: string;
    readonly errorData?: Readonly<unknown>;

    constructor({name, statusCode, message, errorData, id}: PublicError) {
        super(message);
        this.id = id;
        this.statusCode = statusCode;
        this.message = message;
        if (name) super.name = name;
        if (errorData) this.errorData = errorData;
        Object.setPrototypeOf(this, PublicError.prototype);
        // sets proper json serialization
        Object.defineProperty(this, 'message', {enumerable: true});
    }
}

// #######  Error Type Guards #######

const hasUnknownKeys = (knownKeys, error) => {
    if (typeof error !== 'object') return true;
    const unknownKeys = Object.keys(error);
    return unknownKeys.some((ukn) => !knownKeys.includes(ukn));
};

/** Returns true if the error is a PublicError or has the same structure. */
export function isPublicError(error: any): error is PublicError {
    if (!error) return false;
    if (error instanceof PublicError) return true;
    return (
        error &&
        typeof error?.statusCode === 'number' &&
        typeof error?.message === 'string' &&
        typeof error?.name === 'string' &&
        (typeof error?.id === 'string' || typeof error?.id === 'number' || error?.id === undefined) &&
        !hasUnknownKeys(['id', 'statusCode', 'message', 'name', 'errorData'], error)
    );
}

export function deserializeIfIsPublicError(value: any): PublicError | any {
    if (!isPublicError(value) || value instanceof PublicError) return value;
    return new PublicError(value);
}
