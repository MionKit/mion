/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, addRoutesToCache, isUnsafePropertyName} from '@mionjs/core';
import {MION_ROUTES} from '@mionjs/core';
import {ClientOptions, SubRequest} from '../types.ts';
import type {
  CompiledFnData,
  MethodsCache,
  MethodWithOptions,
  PureFunctionData,
  SerializableMethodsData,
  PureFnsDataCache,
} from '@mionjs/core';
import {addSerializedJitCaches, routesCache} from '@mionjs/core';
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

function getJitCompiledFnKey(rtFnHash: string, options: ClientOptions) {
  return `${JIT_FN_PREFIX}${rtFnHash}:${options.baseURL}`;
}

function getJitPureFnKey(namespace: string, pureFnHash: string, options: ClientOptions) {
  return `${PURE_FN_PREFIX}${namespace}:${pureFnHash}:${options.baseURL}`;
}

/** The server is the trusted party (its code runs here by design), but a name that reaches an object
 *  key on restore is checked all the same: `__proto__` as a namespace would land the next write on
 *  Object.prototype, page-wide. A refused entry is skipped with a warning, never stored. */
function isStorableName(name: string): boolean {
  return !isUnsafePropertyName(name) && !name.includes(':');
}

/** Stores JIT compiled functions and pure functions globally in localStorage */
export function storeDependencies(deps: Record<string, CompiledFnData>, pureFnDeps: PureFnsDataCache, options: ClientOptions) {
  Object.entries(deps).forEach(([hash, jitFnData]: [string, CompiledFnData]) => {
    if (!isStorableName(hash)) return console.warn(`Refused to store JIT function dependency under '${hash}'`);
    const key = getJitCompiledFnKey(hash, options);
    try {
      getStorage().setItem(key, JSON.stringify(jitFnData));
    } catch (error) {
      console.warn(`Failed to store JIT function dependency ${hash}:`, error);
    }
  });

  // Store namespaced pure functions
  Object.entries(pureFnDeps).forEach(([namespace, nsPureFns]) => {
    if (!isStorableName(namespace)) return console.warn(`Refused to store pure functions under namespace '${namespace}'`);
    Object.entries(nsPureFns).forEach(([fnHash, pureFnData]: [string, PureFunctionData]) => {
      if (!isStorableName(fnHash)) return console.warn(`Refused to store pure function '${namespace}::${fnHash}'`);
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
  // Null-prototype maps: every key below comes from localStorage, which any script on the page
  // can write, so a plain object would let a `__proto__` key reach Object.prototype.
  const deps: Record<string, CompiledFnData> = Object.create(null);
  const pureFnDeps: PureFnsDataCache = Object.create(null);
  const baseURLSuffix = `:${options.baseURL}`;

  for (let i = 0; i < getStorage().length; i++) {
    const key = getStorage().key(i);
    if (key?.startsWith(JIT_FN_PREFIX) && key.endsWith(baseURLSuffix)) {
      try {
        const data = getStorage().getItem(key);
        // the entry is keyed by the hash in ITS OWN storage key, never by what the payload claims
        const hash = key.slice(JIT_FN_PREFIX.length, key.length - baseURLSuffix.length);
        if (data && isStorableName(hash)) deps[hash] = JSON.parse(data);
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
          const fnName = String(parsedData.fnName);
          if (!isStorableName(namespace) || !isStorableName(fnName)) continue;
          if (!pureFnDeps[namespace]) pureFnDeps[namespace] = Object.create(null);
          pureFnDeps[namespace][fnName] = parsedData;
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
