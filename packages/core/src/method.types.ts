/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

// ########################################## METHODS METADATA ##########################################

import {FnsDataCache, PureFnsDataCache, JitCompiledFunctions} from './types';

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
    /** Information about headers used by the method, used by HeadersHook */
    headersParam?: HeadersMetaData;
    /** Information about headers returned by the method, used by HeadersHook and when any other hook returns headers */
    headersReturn?: HeadersMetaData;
    /** Array of hook IDs associated with this method, only available for route methods */
    hookIds?: string[];
    /** router pointer ie ['users', 'getUser' ]  */
    pointer: string[];
    /** router nest level */
    nestLevel: number;
}

export type MethodsCache = Record<string, MethodMetadata>;

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
