import {RpcError, RunTypeError} from '@mionkit/core';
import {PublicHandler, HandlerSuccessResponse, HandlerErrors} from '@mionkit/router';

// start-result
export type Result<
    RouteSuccess,
    RouteError,
    HooksResults extends Record<string, unknown> = Record<string, unknown>,
    HooksErrors extends Record<string, RpcError<string, unknown>> = Record<string, RpcError<string, unknown>>,
> = [RouteSuccess | undefined, RouteError | undefined, HooksResults | undefined, HooksErrors | undefined];
// end-result

// start-call-with-hooks-result
type HookSuccess<T> = T extends {resolvedValue?: infer V} ? V : never;
type HookError<T> = T extends {error?: infer E} ? E : never;

export type CallWithHooksResult<RouteSuccess, RouteError, Hooks> = [
    RouteSuccess | undefined,
    RouteError | undefined,
    {[K in keyof Hooks]?: HookSuccess<Hooks[K]>} | undefined,
    {[K in keyof Hooks]?: HookError<Hooks[K]>} | undefined,
];
// end-call-with-hooks-result

// start-sub-request
export interface SubRequest<PH extends PublicHandler> {
    pointer: string[];
    id: string;
    isResolved: boolean;
    params: Parameters<PH>;
    resolvedValue?: HandlerSuccessResponse<PH>;
    error?: HandlerErrors<PH>;
    serializedParams?: any[];
}
// end-sub-request

// start-route-sub-request
export interface RouteSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /**
     * Validates Route's parameters and returns type errors.
     */
    typeErrors: () => Promise<RunTypeError[]>;

    /**
     * Calls a remote route and returns a Result 4-tuple.
     * Never throws - errors are always in the result tuple.
     * @returns Promise<[routeResult, routeError, hooksResults, hooksErrors]>
     */
    call: () => Promise<Result<HandlerSuccessResponse<PH>, HandlerErrors<PH>>>;

    /**
     * Calls a remote route with hooks and returns a fully-typed 4-tuple result.
     * Never throws - can have partial success where some hooks/route succeed and others fail.
     * @param hooks Record of hook names to HookSubRequest instances
     * @returns Promise<CallWithHooksResult<...>>;
     */
    callWithHooks: <Hooks extends Record<string, HookSubRequest<any>>>(
        hooks: Hooks
    ) => Promise<CallWithHooksResult<HandlerSuccessResponse<PH>, HandlerErrors<PH>, Hooks>>;
}
// end-route-sub-request

// start-hook-sub-request
export interface HookSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /**
     * Validates Hook's parameters and returns type errors.
     */
    typeErrors: () => Promise<RunTypeError[]>;

    /**
     * Prefills Hook's parameters for any future request.
     * Parameters are persisted in local storage.
     */
    prefill: () => Promise<void>;

    /**
     * Removes prefilled value from storage.
     */
    removePrefill: () => Promise<void>;
}
// end-hook-sub-request

// start-remote-api
import {Routes} from '@mionkit/router';

export type RemoteApi<Type extends Routes> = // ... Maps Public Hooks and Routes to PublicMethod
    any;
// end-remote-api
