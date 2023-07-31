/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicError, RouteError} from '@mionkit/core';
import {JsonParser, RemoteHeaderHook, RemoteHook, RemoteMethod, RemoteMethods, RemoteRoute} from '@mionkit/router';
import {FunctionReflection, ReflectionOptions} from '@mionkit/runtype';

export type ClientOptions = {
    baseURL: string;
    storage: 'localStorage' | 'sessionStorage' | 'none';

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

// ####### Public Route Types #######

export type RequestBody = {
    [key: string]: any[];
};

export type PublicMethodReflection = {
    reflection: FunctionReflection;
};

type ClientFetch<Parent, RH extends RemoteMethod> = Parent & {
    fetch: () => ReturnType<RH['_handler']>;
};

export type ClientMethods<Type extends RemoteMethods<any>> = {
    [Property in keyof Type]: Type[Property] extends RemoteRoute | RemoteHook | RemoteHeaderHook
        ? (...params: Parameters<Type[Property]['_handler']>) => ClientFetch<ClientMethods<Type>, Type[Property]>
        : never;
};
