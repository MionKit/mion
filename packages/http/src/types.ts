/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Headers, RouterOptions} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';
import {ServerOptions} from 'https';

export type HttpOptions = {
    protocol: 'http' | 'https';
    port: number;
    /** ServerOptions.maxHeaderSize defaults to 8KB, same as default value in new node versions */
    options: ServerOptions;
    /** Set of default response header to add to every response*/
    defaultResponseHeaders: Headers;
    /**
     * 256KB by default, same as lambda payload
     * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
     * */
    maxBodySize: number; // default 256KB
    /**
     * We recommend leaving maxBodySize to an small number.
     * Instead if you have a special route or an specific use case using a large payload
     * the allowExceedMaxBodySize will be called on every new chunk of data received.
     */
    allowExceedMaxBodySize?: (currentSize: number, httpReq: IncomingMessage, httpResponse: ServerResponse) => boolean;
    /** use callback instead promises for handling the requests */
    useCallbacks?: boolean;
} & Partial<RouterOptions<HttpRequest>>;

export type HttpRequest = IncomingMessage & {body: string};

// // fix for missing fetch types in node 18
// // @see https://stackoverflow.com/questions/71294230/how-can-i-use-native-fetch-with-node-in-typescript-node-v17-6
// declare global {
//     export const {fetch, FormData, Headers, Request, Response}: typeof import('undici');

//     type FormData = undici_types.FormData;
//     type Headers = undici_types.Headers;
//     type HeadersInit = undici_types.HeadersInit;
//     type BodyInit = undici_types.BodyInit;
//     type Request = undici_types.Request;
//     type RequestInit = undici_types.RequestInit;
//     type RequestInfo = undici_types.RequestInfo;
//     type RequestMode = undici_types.RequestMode;
//     type RequestRedirect = undici_types.RequestRedirect;
//     type RequestCredentials = undici_types.RequestCredentials;
//     type RequestDestination = undici_types.RequestDestination;
//     type ReferrerPolicy = undici_types.ReferrerPolicy;
//     type Response = undici_types.Response;
//     type ResponseInit = undici_types.ResponseInit;
//     type ResponseType = undici_types.ResponseType;
// }
