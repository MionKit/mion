/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {randomUUID} from 'crypto';
import {statusCodeToReasonPhrase} from './status-codes';
import {DEFAULT_CORE_OPTIONS} from './constants';
import {PublicError, RouteErrorParams} from './types';

// #######  Errors #######

let autoGenerateErrorId = DEFAULT_CORE_OPTIONS.autoGenerateErrorId;

export class RouteError extends Error {
    /** id of the error, if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated */
    public readonly id?: number | string;
    /** response status code */
    public readonly statusCode: number;
    /** the message that will be returned in the response */
    public readonly publicMessage: string;
    /** options data related to the error, ie validation data */
    public readonly publicData?: {[key: string]: any};

    constructor({statusCode, message, publicMessage, originalError, publicData, name, id}: RouteErrorParams) {
        super(message || originalError?.message || publicMessage);
        super.name = name || statusCodeToReasonPhrase[statusCode] || 'UnknownError';
        if (originalError?.stack) super.stack = originalError?.stack;
        this.id = id || autoGenerateErrorId ? `${new Date().toISOString()}@${randomUUID()}` : undefined;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage;
        this.publicData = publicData;
        Object.setPrototypeOf(this, RouteError.prototype);
    }
}

export function setAutoGenerateErrorId(value: boolean) {
    autoGenerateErrorId = value;
}

export const getPublicErrorFromRouteError = (routeError: RouteError): PublicError => {
    // creating a new public error object to avoid exposing the original error
    const publicError: PublicError = {
        name: routeError.name,
        statusCode: routeError.statusCode,
        message: routeError.publicMessage,
    };
    if (routeError.id) publicError.id = routeError.id;
    if (routeError.publicData) publicError.errorData = routeError.publicData;
    return publicError;
};
