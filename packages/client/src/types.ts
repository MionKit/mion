/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicError, RouteError} from '@mionkit/core';
import {JsonParser, PublicMethod, PublicMethods} from '@mionkit/router';
import {FunctionReflection, ReflectionOptions} from '@mionkit/runtype';

export type ClientOptions = {
    baseURL: string;
    storage: 'localStorage' | 'sessionStorage' | 'none';

    /** this options must match the api router options */
    routerOptions: {
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
};

// ####### Public Route Types #######

export type RequestBody = {
    [key: string]: any[];
};

export type PublicMethodReflection = {
    reflection: FunctionReflection;
};

export interface ClientMethod<Parent, M extends PublicMethod> {
    preset: (...params: Parameters<M['_handler']>) => Parent;
    params: (...params: Parameters<M['_handler']>) => Parent;
    fetch: () => ReturnType<M['_handler']>;
}

export type ClientMethods<Type extends PublicMethods<any>> = {
    [Property in keyof Type]: Type[Property] extends PublicMethod ? ClientMethod<ClientMethods<Type>, Type[Property]> : never;
};
