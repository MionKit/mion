/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyObject} from '@mionkit/core';
import type {PublicResponses} from './publicMethods';
import type {RpcError} from '@mionkit/core';
import {TypeAnnotation} from '@deepkit/core';

// ####### Call Context #######

/** The call Context object passed as first parameter to any hook or route */
export interface CallContext<ContextData extends Record<string, any> = any> {
    /** Route's path after internal transformation */
    readonly path: string;
    /** Router's own request object */
    readonly request: MionRequest;
    /** Router's own response object */
    readonly response: MionResponse;
    /** context data between handlers (route/hooks) and that is not returned in the response. */
    shared: ContextData;
}

// ####### REQUEST & RESPONSE #######

// TODO: Study Using a Common Interface getting setting headers and body
// this way router can use that interface for reading and writing headers and body instead to the context therefore saving memory and cpu

/** Router's own request object, do not confuse with the underlying raw request */
export interface MionRequest {
    /** parsed headers */
    readonly headers: Readonly<MionHeaders>;
    /** json encoded request body. */
    readonly rawBody: string;
    /** parsed request body */
    readonly body: Readonly<AnyObject>;
    /** pre-parsed body from platforms like Google Cloud Functions where Express auto-parses JSON */
    readonly parsedBody?: Readonly<AnyObject>;
    /** All errors thrown during the call are stored here so they can bee logged or handler by a some error handler hook */
    readonly internalErrors: Readonly<RpcError<any>[]>;
}

/** Router's own response object, do not confuse with the underlying raw response */
export interface MionResponse {
    /** response http status code */
    readonly statusCode: number;
    /** response headers */
    readonly headers: Readonly<MionHeaders>;
    /** json encoded response body, filled only after all routes/hook has ben finalized. */
    readonly rawBody: string;
    /** the router response data, body should not be modified manually so marked as Read Only */
    readonly body: Readonly<PublicResponses>;
    /** response errors: empty if there were no errors during execution */
    readonly hasErrors: boolean;
}

/**
 * Similar to Fetch API Headers.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Headers
 * Headers names must be case insensitive.
 */
export interface MionHeaders {
    append(name: string, value: string): void;
    delete(name: string): void;
    set(name: string, value: string): void;
    get(name: string): string | undefined | null;
    has(name: string): boolean;
    entries(): IterableIterator<[string, string]>;
    keys(): IterableIterator<string>;
    values(): IterableIterator<string>;
}

/** Function used to create the context data object on each route call  */
export type ContextDataFactory<ContextData extends Record<string, any>> = () => ContextData;

// IMPORTANT DO NOT CHANGE THE INTERFACE NAMES OR TYPE ANNOTATIONS AS THEY ARE HARDCODED IN THE JIT GENERATED CODE
// Note that we will be using the types of the Names itself to generate JIT functions and not string[],
// This is so we can allow string formats and optional Headers
/** List of headers to be used in remote handler parameters */
export type HeadersList<Names extends [...args: (string | undefined)[]]> = {
    [K in keyof Names]: Names[K] extends string ? string : string | undefined;
} & TypeAnnotation<'headerNames', Names>;

// type MyHeaders = HeadersList<['Authorization', 'User-Id'?]>;
// const [token, userId]: MyHeaders = ['ABCD', undefined];
// const [token, userId]: MyHeaders = [undefined, 'user-1234']; // error token is not optional
