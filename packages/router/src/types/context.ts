/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyObject, DataViewDeserializer, DataViewSerializer} from '@mionkit/core';
import type {RpcError} from '@mionkit/core';

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

/** The request raw body can be a string, arrayBuffer or an object in the case of a pre-parsed body */
export type RawRequestBodyTypes = {
    json: 'J';
    binary: 'B';
    object: 'O';
};
export type RawResponseBodyTypes = {
    json: 'J';
    binary: 'B';
};
export type RawRequestBody = string | ArrayBuffer | AnyObject;
export type RawRequestBodyType = RawRequestBodyTypes[keyof RawRequestBodyTypes];
export type RawResponseBodyType = RawResponseBodyTypes[keyof RawResponseBodyTypes];

/** Response body can be a string or an arrayBuffer */
export type RawResponseBody = string | ArrayBuffer;

/** Router's own request object, do not confuse with the underlying raw request */
export interface MionRequest {
    /** parsed headers */
    readonly headers: Readonly<Omit<MionHeaders, 'append' | 'set' | 'delete'>>;
    /** Raw request body, can be string for json, arrayBuffer for binary or a javascript object in the case of pre-parsed body */
    readonly rawBody: RawRequestBody;
    readonly bodyType: RawRequestBodyType;
    /** parsed request body */
    readonly body: Readonly<AnyObject>;
    /** All errors thrown during the call are stored here so they can bee logged or handler by a some error handler hook */
    readonly internalErrors: Readonly<RpcError<string>[]>;
    readonly binDeserializer?: DataViewDeserializer | undefined;
}

/** Router's own response object, do not confuse with the underlying raw response */
export interface MionResponse {
    /** response http status code */
    readonly statusCode: number;
    /** response headers */
    readonly headers: Readonly<MionHeaders>;
    /** Raw response body, can be string for json or an arrayBuffer for binary. */
    readonly rawBody: RawResponseBody;
    readonly bodyType: RawResponseBodyType;
    /** the router response data, body should not be modified manually so marked as Read Only */
    readonly body: Readonly<ResponseBody>;
    /** response errors: empty if there were no errors during execution */
    readonly hasErrors: boolean;
    readonly binSerializer?: DataViewSerializer | undefined;
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

/** Response body, a record containing the result of each handler or an error. */
export type ResponseBody = Record<string, unknown | RpcError<string>>;
