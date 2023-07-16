/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouteError} from './errors';

// ####### REQUEST & RESPONSE #######

/** Router own request object */
export type Request = {
    /** parsed and headers */
    headers: Obj;
    /** parsed body */
    body: Obj;
    /** All errors thrown during the call are stored here so they can bee logged or handler by a some error handler hook */
    internalErrors: Readonly<RouteError[]>;
};

/** Router own response object */
export type Response = {
    statusCode: Readonly<number>;
    /** response errors: empty if there were no errors during execution */
    publicErrors: Readonly<PublicError[]>;
    /** response headers */
    headers: Headers;
    /** the router response data, JS object */
    body: Readonly<Obj>;
    /** json encoded response, contains data and errors if there are any. */
    json: Readonly<string>;
};

export type RawServerCallContext<RawServerRequest extends RawRequest = RawRequest, RawServerResponse = any> = {
    /** Original Server request
     * i.e: '@types/aws-lambda/APIGatewayEvent'
     * or http/IncomingMessage */
    rawRequest: RawServerRequest;
    /** Original Server response
     * i.e: http/ServerResponse */
    rawResponse?: RawServerResponse;
};

/** Any request Object used by the router must follow this interface */
export type RawRequest = {
    headers: {[header: string]: string | undefined | string[]} | undefined;
    body: string | null | undefined | {}; // eslint-disable-line @typescript-eslint/ban-types
};

export type Headers = {[key: string]: string | boolean | number};

/** Function used to create the shared data object on each route call  */
export type SharedDataFactory<SharedData> = () => SharedData;

// ####### Context #######

/** The call Context object passed as first parameter to any hook or route */
export type Context<SharedData, RawContext extends RawServerCallContext = RawServerCallContext> = Readonly<{
    /** Route's path */
    path: Readonly<string>;
    /** Raw Server call context, contains the raw request and response */
    rawCallContext: Readonly<RawContext>;
    /** Router's own request object */
    request: Readonly<Request>;
    /** Router's own response object */
    response: Readonly<Response>;
    /** shared data between handlers (route/hooks) and that is not returned in the response. */
    shared: SharedData;
}>;

// ####### Errors #######

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

// ####### Options #######

export type CoreOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** Use AsyncLocalStorage to pass context to route handlers.
     * When enabled the route callContext can be obtained using the `getCallContext` function
     * instead passing the context as a parameter to the route handler.
     */
    useAsyncCallContext: boolean;
};

// #######  Others #######

export type Obj = {
    [key: string]: any;
};

export type JsonParser = {
    parse: (text: string) => any;
    stringify: (js) => string;
};

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
