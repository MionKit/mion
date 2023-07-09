/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {randomUUID} from 'crypto';
import {getRouterOptions} from './router';
import {statusCodeToReasonPhrase} from './status-codes';
import {Obj} from './types';

// #######  Errors #######

// TODO: the interface for Public Errors is a bit confusing, maybe this should be called PublicError, review the way params are passed etc.
/** Any error triggered by hooks or routes must follow this interface, returned errors in the body also follows this interface */
export type RouteErrorParams = {
    /** id of the error. */
    id?: number | string;
    /** response status code */
    statusCode: Readonly<number>;
    /** the message that will be returned in the response */
    publicMessage: Readonly<string>;
    /**
     * the error message, it is private and wont be returned in the response.
     * If not defined, it is assigned from originalError.message or publicMessage.
     */
    message?: Readonly<string>;
    /** options data related to the error, ie validation data */
    publicData?: Readonly<unknown>;
    /** original error used to create the RouteError */
    originalError?: Readonly<Error>;
    /** name of the error, if not defined it is assigned from status code */
    name?: Readonly<string>;
};

export type PublicError = {
    id?: number | string;
    name: Readonly<string>;
    statusCode: Readonly<number>;
    message: Readonly<string>;
    errorData?: Readonly<unknown>;
};

export class RouteError extends Error {
    /** id of the error, if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated */
    public readonly id?: number | string;
    /** response status code */
    public readonly statusCode: number;
    /** the message that will be returned in the response */
    public readonly publicMessage: string;
    /** options data related to the error, ie validation data */
    public readonly publicData?: Obj;

    constructor({statusCode, message, publicMessage, originalError, publicData, name, id}: RouteErrorParams) {
        super(message || originalError?.message || publicMessage);
        super.name = name || statusCodeToReasonPhrase[statusCode] || 'UnknownError';
        if (originalError?.stack) super.stack = originalError?.stack;
        const {autoGenerateErrorId} = getRouterOptions();
        this.id = id || autoGenerateErrorId ? `${new Date().toISOString()}@${randomUUID()}` : undefined;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage;
        this.publicData = publicData;
        Object.setPrototypeOf(this, RouteError.prototype);
    }
}
