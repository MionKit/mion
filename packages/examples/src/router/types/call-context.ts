import {MionRequest, MionResponse} from '@mionkit/router';

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

