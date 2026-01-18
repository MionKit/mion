import {RpcError} from '@mionkit/core';
import {AnyRoute, AnyHook, PublicHookResponse, PublicRouteResponse} from '@mionkit/router';

// start-mion-request
export interface MionRequest<RawRequest = any, RawResponse = any> {
    /** Raw Request, this is the original request object from the specific framework being used. */
    readonly rawRequest: RawRequest;
    /** Raw Response, this is the original response object from the specific framework being used. */
    readonly rawResponse: RawResponse;
    /** Map object containing the request headers. Values are automatically lower cased. */
    readonly headers: Readonly<Record<string, string | undefined>>;
    /** The original body of the request, this is the body before any parsing is done. */
    readonly rawBody: Readonly<string>;
    /** Array with any internal Error happened during the call execution */
    internalErrors: RpcError[];
}
// end-mion-request

// start-mion-response
export interface MionResponse {
    /** The status code of the response. */
    statusCode: number;
    /** Map object containing the request headers. */
    headers: Record<string, string>;
    /** The body of the response. */
    json: PublicResponses;
    /** Indicates if the response has already been sent. */
    isSent: boolean;
}
// end-mion-response

// start-public-responses
export type PublicResponses<
    RR extends AnyRoute = any,
    RH extends AnyHook = any,
> = {
    [key: string]: PublicHookResponse<RH> | PublicRouteResponse<RR> | PublicResponses;
};
// end-public-responses

// start-request-format
// Request body format
type RequestBodyFormat = {
    routeName: any[]; // Parameters for the route
    hook1Name: any[]; // Parameters for hook 1 (if any)
    hook2Name: any[]; // Parameters for hook 2 (if any)
    // ... additional hook params
};
// end-request-format

// start-response-format
// Response body format
type ResponseBodyFormat = {
    routeName: any; // Response from the route
    hook1Name: any; // Response from hook 1 (if any)
    hook2Name: any; // Response from hook 2 (if any)
    // ... additional hook responses
};
// end-response-format

