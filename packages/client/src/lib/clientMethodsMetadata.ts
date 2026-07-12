/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, addRoutesToCache} from '@mionjs/core';
import {MION_ROUTES} from '@mionjs/core';
import {ClientOptions, SubRequest} from '../types.ts';
import type {
    JitCompiledFnData,
    MethodsCache,
    MethodWithOptions,
    PureFunctionData,
    SerializableMethodsData,
    PureFnsDataCache,
} from '@mionjs/core';
import {routesCache} from '@mionjs/core';
import {addSerializedJitCaches} from '@mionjs/run-types';
import {STORAGE_KEY} from '../constants.ts';
import {getStorage} from './storage.ts';

const METHOD_DATA_PREFIX = `${STORAGE_KEY}:method-data:`;
const JIT_FN_PREFIX = `${STORAGE_KEY}:jit-fn:`;
const PURE_FN_PREFIX = `${STORAGE_KEY}:pure-fn:`;

type MetadataRouteKey = typeof MION_ROUTES.methodsMetadata | typeof MION_ROUTES.methodsMetadataById;

/** Extracts raw metadata from a parsed response body, unwraps the JIT union discriminator, and processes it. */
export function extractAndProcessMetadata(routeKey: MetadataRouteKey, parsedBody: any, options: ClientOptions): void {
    if (typeof parsedBody !== 'object' || !(routeKey in parsedBody)) return;
    const rawMetadata = parsedBody[routeKey];
    delete parsedBody[routeKey];
    if (!rawMetadata) return;
    const metadataValue = Array.isArray(rawMetadata) ? rawMetadata[1] : rawMetadata;
    if (metadataValue && !isRpcError(metadataValue) && metadataValue.methods) {
        processMethodsMetadata(metadataValue as SerializableMethodsData, options);
    }
}

/** Processes metadata from an optimistic response and caches it */
function processMethodsMetadata(serializableMethodsData: SerializableMethodsData, options: ClientOptions): void {
    storeDependencies(serializableMethodsData.deps, serializableMethodsData.purFnDeps, options);
    storeMethodsMetadata(serializableMethodsData.methods, options);
    addToCaches(serializableMethodsData);
}

function getSerializedMethodDataKey(methodId: string, options: ClientOptions) {
    return `${METHOD_DATA_PREFIX}${methodId}:${options.baseURL}`;
}

function getJitCompiledFnKey(jitFnHash: string, options: ClientOptions) {
    return `${JIT_FN_PREFIX}${jitFnHash}:${options.baseURL}`;
}

function getJitPureFnKey(namespace: string, pureFnHash: string, options: ClientOptions) {
    return `${PURE_FN_PREFIX}${namespace}:${pureFnHash}:${options.baseURL}`;
}

/** Stores JIT compiled functions and pure functions globally in localStorage */
export function storeDependencies(deps: Record<string, JitCompiledFnData>, pureFnDeps: PureFnsDataCache, options: ClientOptions) {
    Object.entries(deps).forEach(([hash, jitFnData]: [string, JitCompiledFnData]) => {
        const key = getJitCompiledFnKey(hash, options);
        try {
            getStorage().setItem(key, JSON.stringify(jitFnData));
        } catch (error) {
            console.warn(`Failed to store JIT function dependency ${hash}:`, error);
        }
    });

    // Store namespaced pure functions
    Object.entries(pureFnDeps).forEach(([namespace, nsPureFns]) => {
        Object.entries(nsPureFns).forEach(([fnHash, pureFnData]: [string, PureFunctionData]) => {
            const key = getJitPureFnKey(namespace, fnHash, options);
            try {
                getStorage().setItem(key, JSON.stringify(pureFnData));
            } catch (error) {
                console.warn(`Failed to store pure function dependency ${namespace}::${fnHash}:`, error);
            }
        });
    });
}

/** Stores method metadata in localStorage using the new storage format */
export function storeMethodsMetadata(methods: MethodsCache, options: ClientOptions) {
    Object.entries(methods).forEach(([methodId, methodData]) => {
        const key = getSerializedMethodDataKey(methodId, options);
        try {
            getStorage().setItem(key, JSON.stringify(methodData));
        } catch (error) {
            console.warn(`Failed to store method metadata ${methodId}:`, error);
        }
    });
}

/** Restores all JIT compiled functions and pure functions from localStorage and deserializes them */
export function restoreAllDependencies(options: ClientOptions) {
    const deps: Record<string, JitCompiledFnData> = {};
    const pureFnDeps: PureFnsDataCache = {};
    const baseURLSuffix = `:${options.baseURL}`;

    for (let i = 0; i < getStorage().length; i++) {
        const key = getStorage().key(i);
        if (key?.startsWith(JIT_FN_PREFIX) && key.endsWith(baseURLSuffix)) {
            try {
                const data = getStorage().getItem(key);
                if (data) {
                    const parsedData = JSON.parse(data);
                    deps[parsedData.jitFnHash] = parsedData;
                }
            } catch (error) {
                console.warn(`Failed to restore JIT function from key ${key}:`, error);
            }
        }
    }

    for (let i = 0; i < getStorage().length; i++) {
        const key = getStorage().key(i);
        if (key?.startsWith(PURE_FN_PREFIX) && key.endsWith(baseURLSuffix)) {
            try {
                const data = getStorage().getItem(key);
                if (data) {
                    const parsedData = JSON.parse(data);
                    // Extract namespace from key: "mion:pure-fn:namespace:fnHash:baseURL"
                    const inner = key.slice(PURE_FN_PREFIX.length, key.length - baseURLSuffix.length);
                    const namespace = inner.split(':')[0] || parsedData.namespace;
                    if (!pureFnDeps[namespace]) pureFnDeps[namespace] = {};
                    pureFnDeps[namespace][parsedData.fnName] = parsedData;
                }
            } catch (error) {
                console.warn(`Failed to restore pure function from key ${key}:`, error);
            }
        }
    }

    if (Object.keys(deps).length > 0 || Object.keys(pureFnDeps).length > 0) {
        addSerializedJitCaches(deps, pureFnDeps);
    }
}

/** Creates a SubRequest for the metadata middleware to piggyback on an optimistic request */
export function createMetadataSubRequest(methodIds: string[]): SubRequest<any> {
    return {
        pointer: [MION_ROUTES.methodsMetadata],
        id: MION_ROUTES.methodsMetadata,
        isResolved: false,
        params: [methodIds],
    };
}

/** Restores method metadata from localStorage using the new storage format */
export function restoreFromLocalStorage(methodIds: string[], options: ClientOptions) {
    restoreAllDependencies(options);

    const methods: MethodsCache = {};
    let anyMethodsRestored = false;

    methodIds.forEach((id) => {
        if (routesCache.hasMetadata(id)) return;
        const methodKey = getSerializedMethodDataKey(id, options);
        const methodMetaJson = getStorage().getItem(methodKey);
        if (methodMetaJson) {
            try {
                const methodMeta: MethodWithOptions = JSON.parse(methodMetaJson);
                methods[id] = methodMeta;
                anyMethodsRestored = true;
            } catch (error) {
                console.warn(`Failed to restore method metadata for ${id}:`, error);
                getStorage().removeItem(methodKey);
            }
        }
    });

    if (anyMethodsRestored) {
        const serializableMethodsData: SerializableMethodsData = {
            methods,
            deps: {},
            purFnDeps: {},
        };
        addToCaches(serializableMethodsData);
    }
}

function addToCaches(serializableMethodsData: SerializableMethodsData) {
    addSerializedJitCaches(serializableMethodsData.deps, serializableMethodsData.purFnDeps);
    addRoutesToCache(serializableMethodsData.methods);
}
