/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {PublicResponses} from './publicProcedures';

// ####### Call Context #######

/** The call Context object passed as first parameter to any hook or route */
export interface CallContext<SharedData extends Record<string, any> = any> {
    /** Route's path after internal transformation */
    readonly path: string;
    /** Router's own request object */
    readonly request: MionRequest;
    /** Router's own response object */
    readonly response: MionResponse;
    /** shared data between handlers (route/hooks) and that is not returned in the response. */
    shared: SharedData;
}

// ####### REQUEST & RESPONSE #######

// TODO: Study Using a Common Interface getting setting headers and body
// this way router can use that interface for reading and writing headers and body instead to the context therefore saving memory and cpu

/** Router's own request object, do not confuse with the underlying raw request */
export interface MionRequest {
    /** parsed headers */
    readonly headers: Readonly<Headers>;
    /** json encoded request body. */
    readonly rawBody: string;
    /** parsed request body  */
    readonly body: Readonly<Record<string, any[]>>;
    /** All errors thrown during the call are stored here so they can bee logged or handler by a some error handler hook */
    readonly internalErrors: Readonly<RpcError[]>;
}

/** Router's own response object, do not confuse with the underlying raw response */
export interface MionResponse {
    /** response http status code */
    readonly statusCode: number;
    /** response headers */
    readonly headers: Readonly<Headers>;
    /** json encoded response body, filled only after all routes/hook has ben finalized. */
    readonly rawBody: string;
    /** the router response data, body should not be modified manually so marked as Read Only */
    readonly body: Readonly<PublicResponses>;
    /** response errors: empty if there were no errors during execution */
    readonly hasErrors: boolean;
}

export type SingleHeader = string;
export type MultiHeader = SingleHeader | SingleHeader[];
export type HeadersRecord = Record<string, MultiHeader>;

/** Function used to create the shared data object on each route call  */
export type SharedDataFactory<SharedData> = () => SharedData;
