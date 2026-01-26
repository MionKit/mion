/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

// ########################################## METHODS METADATA ##########################################

import {FnsDataCache, PureFnsDataCache, JitCompiledFunctions, SerializerMode} from './general.types';

/**
 * Shared interface for PublicMethod that can be used between client and server without handler dependencies
 * Serializable version of MethodMetadata in @/router/types/remoteMethods
 */
export interface MethodMetadata {
    /** Method type identifier */
    type: number;
    /** Unique identifier for the method (usually the full route path) */
    id: string;
    /** whether method is async or might return a promise.
     * If return type is not know method is considered async  */
    isAsync: boolean;
    /** true if method returns data (not void or undefined) */
    hasReturnData: boolean;
    /** Information about method parameters including their names and sources (headers, cookies, body) */
    paramNames?: string[];
    /** JIT hash of the method parameters */
    paramsJitHash: string;
    /**  JIT  hash of the method return value */
    returnJitHash: string;
    /** Information about headers used by the method, used by HeadersLinkedFn */
    headersParam?: HeadersMetaData;
    /** Information about headers returned by the method, used by HeadersLinkedFn and when any other linkedFn returns headers */
    headersReturn?: HeadersMetaData;
    /** Array of linkedFn IDs associated with this method, only available for route methods */
    linkedFnIds?: string[];
    /** router pointer ie ['users', 'getUser' ]  */
    pointer: string[];
    /** router nest level */
    nestLevel: number;
}

export interface RemoteMethodOpts {
    runOnError?: boolean;
    validateParams?: boolean;
    validateReturn?: boolean;
    description?: string;
    /** Per-route serializer mode override. If not set, uses router's default serialize option. */
    serializer?: SerializerMode;
}

export interface RouteOnlyOptions extends RemoteMethodOpts {
    runOnError: false;
    serializer: SerializerMode;
}
export interface MethodWithOptions extends MethodMetadata {
    options: RemoteMethodOpts;
}

export type MethodsCache = Record<string, MethodWithOptions>;

export interface HeadersMetaData {
    headerNames: string[];
    jitHash: string;
}

export interface SerializableMethodsData {
    methods: MethodsCache;
    deps: FnsDataCache;
    purFnDeps: PureFnsDataCache;
}

export interface HeadersMethodWithJitFns extends HeadersMetaData {
    jitFns: Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;
}

export interface MethodWithJitFns extends MethodMetadata {
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    headersParam?: HeadersMethodWithJitFns;
    headersReturn?: HeadersMethodWithJitFns;
}

export type MethodWithOptsAndJitFns = MethodWithOptions & MethodWithJitFns;
