/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {Prettify, RunTypeError} from '@mionkit/core';
import type {PublicHeadersHook, PublicHook, RemoteApi, PublicRoute} from '@mionkit/router';
import type {TypedEvent} from './typedEvent';

// ############# Result Type #############

/**
 * Result type for call() method - tuple pattern.
 * Provides type-safe async/await pattern without losing error typing.
 * Tuple allows natural naming: `const [user, error] = await routes.users.getById('123').call();`
 *
 * @example
 * ```typescript
 * const [user, error] = await routes.users.getById('123').call();
 * if (error) {
 *     console.log(error.publicMessage);
 *     return;
 * }
 * console.log(user.name);
 * ```
 */
export type Result<S, E> = [S, undefined] | [undefined, E];

// ############# callWithHooks Result Types #############

/**
 * Extract success type from a HookSubRequest.
 */
export type HookSuccess<H> = H extends HookSubRequest<infer PH> ? HandlerSuccessResponse<PH> : never;

/**
 * Extract error type from a HookSubRequest.
 */
export type HookError<H> = H extends HookSubRequest<infer PH> ? HandlerErrors<PH> : never;

/**
 * Data portion of CallWithHooksResult - contains all success values.
 * Values are optional because hooks/route may not have executed (e.g., earlier hook failed)
 * or may have returned an error instead.
 */
export type CallWithHooksData<RouteSuccess, Hooks extends Record<string, HookSubRequest<any>>> = {
    route?: RouteSuccess;
    hooks: {
        [K in keyof Hooks]?: HookSuccess<Hooks[K]>;
    };
};

/**
 * Errors portion of CallWithHooksResult - contains all error values.
 * Values are optional because hooks/route may have succeeded or not executed.
 */
export type CallWithHooksErrors<RouteError, Hooks extends Record<string, HookSubRequest<any>>> = {
    route?: RouteError;
    hooks: {
        [K in keyof Hooks]?: HookError<Hooks[K]>;
    };
};

/**
 * Result type for callWithHooks method - tuple pattern.
 * Returns [data, errors] where:
 * - data.route: success value if route succeeded
 * - data.hooks[name]: success value for each hook that succeeded
 * - errors.route: error if route failed
 * - errors.hooks[name]: error for each hook that failed
 *
 * @typeParam RouteSuccess - The success type of the route
 * @typeParam RouteError - The error type of the route
 * @typeParam Hooks - Record of hook names to HookSubRequest types
 *
 * @example
 * ```typescript
 * const [data, errors] = await routes.users.getById('123').callWithHooks({
 *     auth: hooks.auth(headers),
 *     session: hooks.session(token)
 * });
 *
 * // Check for errors
 * if (errors.route) {
 *     console.log('Route failed:', errors.route.publicMessage);
 * }
 * if (errors.hooks.auth) {
 *     console.log('Auth failed:', errors.hooks.auth.publicMessage);
 * }
 *
 * // Access success data
 * if (data.route) {
 *     console.log('User:', data.route.name);
 * }
 * if (data.hooks.auth) {
 *     console.log('Session:', data.hooks.auth.userId);
 * }
 * ```
 */
export type CallWithHooksResult<RouteSuccess, RouteError, Hooks extends Record<string, HookSubRequest<any>>> = [
    CallWithHooksData<RouteSuccess, Hooks>,
    CallWithHooksErrors<RouteError, Hooks>,
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
 * Extracts all RpcError types from a handler's return type as a union.
 * Returns the full RpcError types (with ErrData), not just the type strings.
 * @typeParam PH - The public handler type
 */
export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Extract<HandlerResponse<PH>, RpcError<string, any>>;

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
export interface RouteSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /**
     * Validates Route's parameters and returns type errors. Throws RpcError if validation fails.
     */
    typeErrors: () => Promise<RunTypeError[]>;

    /**
     * Calls a remote route and returns a Result tuple with full typing preserved.
     * Never throws - errors are always in the result tuple.
     *
     * @returns Promise that resolves to [data, error] tuple
     *
     * @example
     * ```typescript
     * const [user, error] = await routes.users.getById('123').call();
     * if (error) {
     *     console.log(error.errorData?.userId);
     *     return;
     * }
     * console.log(user.name);
     * ```
     */
    call: () => Promise<Result<HandlerSuccessResponse<PH>, HandlerErrors<PH>>>;

    /**
     * Calls a remote route with hooks and returns a fully-typed result tuple.
     * Always returns (never throws) - can have partial success where some hooks/route succeed and others fail.
     *
     * @param hooks Record of hook names to HookSubRequest instances
     * @returns Promise that resolves to [data, errors] tuple containing route and hooks results
     *
     * @example
     * ```typescript
     * const [data, errors] = await routes.users.getById('123').callWithHooks({
     *     auth: hooks.auth(headers),
     *     session: hooks.session(token)
     * });
     *
     * if (errors.route) {
     *     console.log('Route failed:', errors.route.type);
     * } else if (data.route) {
     *     console.log('User:', data.route.name);
     * }
     *
     * if (errors.hooks.auth) {
     *     console.log('Auth failed:', errors.hooks.auth.type);
     * }
     * ```
     */
    callWithHooks: <H extends Record<string, HookSubRequest<any>>>(
        hooks: H
    ) => Promise<CallWithHooksResult<HandlerSuccessResponse<PH>, HandlerErrors<PH>, H>>;
}

/** structure returned from the proxy, containing info of the remote hook to execute
 * Note hookPointer is using as differentiating key from routePointer in RouteInfo, so types can't overlap.
 */
export interface HookSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
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
    prefill: () => TypedEvent<HandlerSuccessResponse<PH>, HandlerErrors<PH>>;

    /**
     * Removes prefilled value.
     * Throws RpcError if something fails removing the prefilled parameters
     * @returns Promise<void>
     */
    removePrefill: () => Promise<void>;
}

export interface SuccessSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    result: HandlerSuccessResponse<PH>;
    error: undefined;
}

export type NonClientRoute = never | PublicHook | PublicHeadersHook;

export type ClientRoutes<RA extends RemoteApi> = Prettify<{
    [Property in keyof RA as RA[Property] extends NonClientRoute ? never : Property]: RA[Property] extends PublicRoute
        ? (...params: Parameters<RA[Property]['handler']>) => RouteSubRequest<RA[Property]['handler']>
        : RA[Property] extends RemoteApi
          ? ClientRoutes<RA[Property]>
          : never;
}>;

export type NonClientHook = never | PublicRoute | {[key: string]: PublicRoute};

export type ClientHooks<RA extends RemoteApi> = Prettify<{
    [Property in keyof RA as RA[Property] extends NonClientHook ? never : Property]: RA[Property] extends
        | PublicHook
        | PublicHeadersHook
        ? (...params: Parameters<RA[Property]['handler']>) => HookSubRequest<RA[Property]['handler']>
        : RA[Property] extends RemoteApi
          ? ClientHooks<RA[Property]>
          : never;
}>;

export type Cleaned<RMS extends RemoteApi> = {
    [Property in keyof RMS as RMS[Property] extends never ? never : Property]: RMS[Property];
};

export type SuccessClientResponse<RS extends RouteSubRequest<any>, RHList extends HookSubRequest<any>[]> = [
    SuccessResponse<RS>,
    ...SuccessResponses<RHList>,
];

export type PrefilledHooksCache = Map<string, SubRequest<any>>;
