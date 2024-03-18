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

/** Any error triggered by hooks or routes must follow this interface, returned errors in the body also follows this interface */
export interface RpcErrorParams {
    /** id of the error. */
    id?: number | string;
    /** response status code */
    statusCode: number;
    /** the message that will be returned in the response */
    publicMessage?: string;
    /**
     * the error message, it is private and wont be returned in the response.
     * If not defined, it is assigned from originalError.message or publicMessage.
     */
    message?: string;
    /** options data related to the error, ie validation data */
    errorData?: unknown;
    /** original error used to create the RpcError */
    originalError?: Error;
    /** name of the error, if not defined it is assigned from status code */
    name?: string;
}

export interface RpcErrorWithPublic extends RpcErrorParams {
    publicMessage: string;
}

export interface RpcErrorWithPrivate extends RpcErrorParams {
    message: string;
}

export interface AnonymRpcError extends Omit<RpcErrorParams, 'publicMessage' | 'originalError'> {
    /**
     * When a RpcError gets anonymized the publicMessage becomes the message.
     * RpcError.publicMessage => AnonymRpcError.message
     * */
    message: string;
    statusCode: number;
    name: string;
}

export type AnyErrorParams = RpcErrorWithPublic | RpcErrorWithPrivate;

// #######  Others #######

export type AnyObject = {
    [key: string]: unknown;
};

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
