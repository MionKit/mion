/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ####### Options #######

export type CoreOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
};

// #######  Errors #######

// TODO: the interface for Public Errors is a bit confusing, maybe this should be called PublicError, review the way params are passed etc.
/** Any error triggered by hooks or routes must follow this interface, returned errors in the body also follows this interface */
export type RouteErrorParams = {
    /** id of the error. */
    id?: number | string;
    /** response status code */
    statusCode: number;
    /** the message that will be returned in the response */
    publicMessage: string;
    /**
     * the error message, it is private and wont be returned in the response.
     * If not defined, it is assigned from originalError.message or publicMessage.
     */
    message?: string;
    /** options data related to the error, ie validation data */
    publicData?: unknown;
    /** original error used to create the RouteError */
    originalError?: Error;
    /** name of the error, if not defined it is assigned from status code */
    name?: string;
};

export type PublicError = {
    id?: number | string;
    readonly name: string;
    readonly statusCode: number;
    readonly message: string;
    readonly errorData?: Readonly<unknown>;
};

// #######  Type Guards #######

export function isPublicError(error: any): error is PublicError {
    return error && typeof error.statusCode === 'number' && typeof error.message === 'string' && typeof error.name === 'string';
}

// #######  Others #######

export type Obj = {
    [key: string]: any;
};

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
