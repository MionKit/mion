/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {Prettify, RunTypeError, ValidationError} from '@mionkit/core';
import type {PublicHeadersHook, PublicHook, RemoteApi, PublicRoute} from '@mionkit/router';
import type {TypedEvent} from './typedEvent';

// ############# Result Type #############

/**
 * Result type for call() and callWithHooks() methods - 4-tuple pattern.
 * Provides type-safe async/await pattern without losing error typing.
 * Tuple allows natural naming: `const [user, error, hookResults, hookErrors] = await routes.users.getById('123').call();`
 *
 * The 4-tuple pattern provides:
 * - Direct access to route result/error
 * - Access to hook results/errors for both prefilled and explicit hooks
 * - Backward compatible - `const [user, error] = ...` still works (partial destructuring)
 *
 * @typeParam RouteSuccess - The success type of the route
 * @typeParam RouteError - The error type of the route
 * @typeParam HooksResults - Record of hook names to their success types
 * @typeParam HooksErrors - Record of hook names to their error types
 */
export type Result<
    RouteSuccess,
    RouteError,
    HooksResults extends Record<string, unknown> = Record<string, unknown>,
    HooksErrors extends Record<string, RpcError<string, unknown>> = Record<string, RpcError<string, unknown>>,
> = [RouteSuccess | undefined, RouteError | undefined, HooksResults | undefined, HooksErrors | undefined];

// ############# callWithHooks Result Types #############

/**
 * Extract success type from a HookSubRequest.
 */
export type HookSuccess<H> = H extends HSubRequest<infer PH> ? HandlerSuccessResponse<PH> : never;

/**
 * Extract error type from a HookSubRequest.
 */
export type HookError<H> = H extends HSubRequest<infer PH> ? Simplify<HandlerErrors<PH>> : never;

/**
 * Result type for callWithHooks method - 4-tuple pattern.
 * Returns [routeResult, routeError, hooksResults, hooksErrors] where:
 * - routeResult: success value if route succeeded (undefined if failed)
 * - routeError: error if route failed (undefined if succeeded)
 * - hooksResults: record of hook names to their success values
 * - hooksErrors: record of hook names to their error values
 *
 * This provides the same structure as Result for consistency and direct access.
 *
 * @typeParam RouteSuccess - The success type of the route
 * @typeParam RouteError - The error type of the route
 * @typeParam Hooks - Record of hook names to HookSubRequest types
 */
export type CallWithHooksResult<RouteSuccess, RouteError, Hooks extends Record<string, HSubRequest<any>>> = [
    RouteSuccess | undefined,
    RouteError | ValidationError | undefined,
    {[K in keyof Hooks]?: HookSuccess<Hooks[K]>} | undefined,
    {[K in keyof Hooks]?: HookError<Hooks[K]>} | undefined,
];

export type ClientOptions = {
    baseURL: string;
    fetchOptions: RequestInit;

    // ############# ROUTER OPTIONS (should match router options) #############

    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: string;
    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: string;
    /** enable automatic parameter validation, defaults to true */
    validateParams: boolean;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
};

type PublicHandler = (...args: any[]) => Promise<any>;

export type InitOptions = Partial<ClientOptions> & {baseURL: string};
export type RequestHeaders = {[key: string]: string};
export type RequestBody = {[key: string]: any[]};
export type HandlerResponse<PH extends PublicHandler> = Awaited<ReturnType<PH>>;
export type HandlerSuccessResponse<PH extends PublicHandler> = Exclude<HandlerResponse<PH>, RpcError<string>>;
export type HandlerFailResponse<PH extends PublicHandler> = Extract<HandlerResponse<PH>, RpcError<string>>;
export type SuccessResponse<MR extends SubRequest<any>> = Required<MR>['resolvedValue'];
export type SuccessResponses<List extends SubRequest<any>[]> = {[P in keyof List]: SuccessResponse<List[P]>};
export type FailResponse<MR extends SubRequest<any>> = Required<MR>['error'];
export type FailResponses<List extends SubRequest<any>[]> = {[P in keyof List]: FailResponse<List[P]>};
export type RequestErrors = Map<string, RpcError<string>>;

// ############# Error Handler Types #############

/**
 * Handler function for a specific error type.
 * @typeParam T - The error type string literal
 */
/**
 * Handler function for a specific error type.
 * @typeParam E - The full RpcError type
 */
export type ErrorHandler<E extends RpcError<string, any>> = (error: E) => void;

/**
 * Handler function for unknown/unhandled errors.
 */
export type UnknownErrorHandler = (error: RpcError<string, any>) => void;

/**
 * Handler function for successful results.
 * @typeParam S - The success type
 */
export type SuccessHandler<S> = (result: S) => void;

/**
 * Utility type to force TypeScript to evaluate/resolve the type.
 * This improves hover display by showing the resolved union instead of the generic type alias.
 */
type Simplify<T> = T extends any ? T : never;

/**
 * Extracts all RpcError types from a handler's return type as a union.
 * Returns the full RpcError types (with ErrData), not just the type strings.
 * Also includes ValidationError since validation errors can be thrown for any route/hook.
 * @typeParam PH - The public handler type
 */
export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
    Extract<HandlerResponse<PH>, RpcError<string, any>> | ValidationError
>;

// ############# Remote Methods Request #############

/** Represents a remote method (sub request).
 * A route request can contains multiple subRequest to the route itself and any required hook*/
export interface SubRequest<PH extends PublicHandler> {
    pointer: string[];
    id: string;
    isResolved: boolean;
    params: Parameters<PH>;
    /** The resolved value after the request completes successfully */
    resolvedValue?: HandlerSuccessResponse<PH>;
    error?: HandlerFailResponse<PH>;
    serializedParams?: any[];
}

/** structure returned from the proxy, containing info of the remote route to execute
 * Note routePointer is using as differentiating key from hookPointer in HookInfo, so types can't overlap.
 */
export interface RSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /**
     * Validates Route's parameters and returns type errors. Throws RpcError if validation fails.
     */
    typeErrors: () => Promise<RunTypeError[]>;

    /**
     * Calls a remote route and returns a Result 4-tuple with full typing preserved.
     * Never throws - errors are always in the result tuple.
     *
     * @returns Promise that resolves to [routeResult, routeError, hooksResults, hooksErrors] tuple
     */
    call: () => Promise<
        Result<
            HandlerSuccessResponse<PH>,
            Simplify<HandlerErrors<PH>>,
            Record<string, unknown>, // hooks results
            Record<string, RpcError<string, unknown> | ValidationError> // hooks errors
        >
    >;

    /**
     * Calls a remote route with hooks and returns a fully-typed 4-tuple result.
     * Always returns (never throws) - can have partial success where some hooks/route succeed and others fail.
     *
     * @param hooks Record of hook names to HookSubRequest instances
     * @returns Promise that resolves to [routeResult, routeError, hooksResults, hooksErrors] tuple
     */
    callWithHooks: <H extends Record<string, HSubRequest<any>>>(
        hooks: H
    ) => Promise<CallWithHooksResult<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>, H>>;
}

/** structure returned from the proxy, containing info of the remote hook to execute
 * Note hookPointer is using as differentiating key from routePointer in RouteInfo, so types can't overlap.
 */
export interface HSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /**
     * Validates Hook's parameters and returns type errors. Throws RpcError if validation fails.
     */
    typeErrors: () => Promise<RunTypeError[]>;
    /**
     * Prefills Hook's parameters for any future request and returns TypedEvent for persistent event handling.
     * Parameters are validated and serialized for future requests.
     * The TypedEvent allows registering:
     * - onSuccess handlers called for ALL future successful requests from this hook
     * - onError handlers called for ALL future requests that fail with specific error types
     * @returns TypedEvent for chaining onSuccess/onError handlers
     */
    prefill: () => TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>;

    /**
     * Removes prefilled value.
     * Throws RpcError if something fails removing the prefilled parameters
     * @returns Promise<void>
     */
    removePrefill: () => Promise<void>;
}

export type NonClientRoute = never | PublicHook | PublicHeadersHook;

export type ClientRoutes<RA extends RemoteApi> = Prettify<{
    [Property in keyof RA as RA[Property] extends NonClientRoute ? never : Property]: RA[Property] extends PublicRoute
        ? (...params: Parameters<RA[Property]['handler']>) => RSubRequest<RA[Property]['handler']>
        : RA[Property] extends RemoteApi
          ? ClientRoutes<RA[Property]>
          : never;
}>;

export type NonClientHook = never | PublicRoute | {[key: string]: PublicRoute};

export type ClientHooks<RA extends RemoteApi> = Prettify<{
    [Property in keyof RA as RA[Property] extends NonClientHook ? never : Property]: RA[Property] extends
        | PublicHook
        | PublicHeadersHook
        ? (...params: Parameters<RA[Property]['handler']>) => HSubRequest<RA[Property]['handler']>
        : RA[Property] extends RemoteApi
          ? ClientHooks<RA[Property]>
          : never;
}>;

export type Cleaned<RMS extends RemoteApi> = {
    [Property in keyof RMS as RMS[Property] extends never ? never : Property]: RMS[Property];
};

export type SuccessClientResponse<RS extends RSubRequest<any>, RHList extends HSubRequest<any>[]> = [
    SuccessResponse<RS>,
    ...SuccessResponses<RHList>,
];

export type PrefilledHooksCache = Map<string, SubRequest<any>>;
