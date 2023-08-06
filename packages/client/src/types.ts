/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicError, RouteError} from '@mionkit/core';
import {JsonParser, RemoteHeaderHook, RemoteHook, RemoteMethod, RemoteMethods, RemoteRoute} from '@mionkit/router';
import {FunctionReflection, ReflectionOptions} from '@mionkit/runtype';

export type StorageType = 'localStorage' | 'sessionStorage';

export type ClientOptions = {
    baseURL: string;
    storage: StorageType;
    fetchOptions: RequestInit;

    // ############# ROUTER OPTIONS (should match router options) #############

    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: string;
    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation: boolean;
    /** Enables serialization/deserialization */
    enableSerialization: boolean;
    /** Reflection and Deepkit Serialization-Validation options */
    reflectionOptions: ReflectionOptions;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** Custom JSON parser, defaults to Native js JSON */
    bodyParser: JsonParser;
};

export type InitOptions = Partial<ClientOptions> & {
    baseURL: string;
};

export type RequestBody = {
    [key: string]: any[];
};

export type PublicMethodReflection = {
    reflection: FunctionReflection;
};

export type RemoteMethodWithExecutionPathIds = RemoteMethod & {
    executionPathIds: string[];
};

export type RemoteMethodsById = Map<string, RemoteMethodWithExecutionPathIds>;

export type ReflectionById = Map<string, FunctionReflection>;

// export type MethodRequestListAsObject<RList extends MethodRequest<any>[]> = {
//     [Property in keyof RList as `${RList[Property & number]['id']}`]: RList[Property];
// };

export type HooksResponse<RHList extends HookRequest<any>[]> = {[P in keyof RHList]: Awaited<Required<RHList[P]>['return']>};
export type RouteResponse<RR extends RouteRequest<any> | RemoteRoute> = RR extends RemoteRoute
    ? Awaited<ReturnType<RR['_handler']>>
    : RR extends RouteRequest<any>
    ? RR['return']
    : never;

export type RemoteCallResponse<RR extends RouteRequest<any> | RemoteRoute, RHList extends HookRequest<any>[]> = {
    routeResponse: RouteResponse<RR>;
    hooksResponses: HooksResponse<RHList>;
    persistedHooksResponses: {[key: string]: PublicError | unknown};
    otherResponses: {[key: string]: PublicError | unknown};
    hasRouteError: boolean;
    hasHookErrors: boolean;
    hasOtherErrors: boolean;
    hasPersistedErrors: boolean;
    hasErrors: boolean;
};

export type SuccessOnlyReturn<RM extends RouteRequest<any> | HookRequest<any>> = Exclude<
    Required<RM>['return'],
    PublicError | RouteError
>;
export type SuccessOnlyHooksResp<RHList extends HookRequest<any>[]> = {
    [P in keyof RHList]: Awaited<SuccessOnlyReturn<RHList[P]>>;
};

export type FailOnlyReturn<RM extends RouteRequest<any> | HookRequest<any>> = Required<RM>['return'] extends PublicError
    ? Required<RM>['return']
    : never;
export type FailOnlyHooksResp<RHList extends HookRequest<any>[]> = {
    [P in keyof RHList]: Awaited<FailOnlyReturn<RHList[P]>>;
};

// TODO investigate any possible benefits of an specific promise that
export interface RouteCallPromise<RR extends RouteRequest<any>, RHList extends HookRequest<any>[]>
    extends Promise<RemoteCallResponse<RR, HooksResponse<RHList>>> {
    callThen(
        onfulfilled?: (routeResp: SuccessOnlyReturn<RR>, ...hooksResponses: SuccessOnlyHooksResp<RHList>) => void
    ): Promise<RemoteCallResponse<RR, HooksResponse<RHList>>>;

    callCatch(
        onrejected?: (failedRouteResp: FailOnlyReturn<RR>, ...failedHooksResponses: FailOnlyHooksResp<RHList>) => void
    ): Promise<RemoteCallResponse<RR, HooksResponse<RHList>>>;

    catchOthers(onrejected?: (otherErrors: PublicError[]) => any): Promise<RemoteCallResponse<RR, HooksResponse<RHList>>>;
}

export interface MethodRequest<RM extends RemoteMethod> {
    pointer: string[];
    id: RM['id'];
    isResolved: boolean;
    params: Parameters<RM['_handler']>;
    return?: Awaited<ReturnType<RM['_handler']>>;
}

/** structure returned from the proxy, containing info of the remote route to execute
 * Note routePointer is using as differentiating key from hookPointer in HookInfo, so types can't overlap.
 */
export interface RouteRequest<RR extends RemoteRoute> extends MethodRequest<RR> {
    call: <RHList extends HookRequest<any>[]>(...hooks: RHList) => Promise<RemoteCallResponse<RR, RHList>>;
}

/** structure returned from the proxy, containing info of the remote hook to execute
 * Note hookPointer is using as differentiating key from routePointer in RouteInfo, so types can't overlap.
 */
export interface HookRequest<RH extends RemoteHook | RemoteHeaderHook> extends MethodRequest<RH> {
    persist: (storage?: StorageType) => void;
}

export type HookCall<RH extends RemoteHook | RemoteHeaderHook> = (...params: Parameters<RH['_handler']>) => HookRequest<RH>;

export type RouteCall<RR extends RemoteRoute> = (...params: Parameters<RR['_handler']>) => RouteRequest<RR>;

export type ClientMethods<RMS extends RemoteMethods<any>> = {
    [Property in keyof RMS]: RMS[Property] extends RemoteRoute
        ? RouteCall<RMS[Property]>
        : RMS[Property] extends RemoteHook | RemoteHeaderHook
        ? HookCall<RMS[Property]>
        : RMS[Property] extends RemoteMethods<any>
        ? ClientMethods<RMS[Property]>
        : never;
};
