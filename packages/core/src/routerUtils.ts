/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  DECODE_FAMILY_BY_STRATEGY,
  ENCODE_FAMILY_BY_STRATEGY,
  JIT_FUNCTION_IDS,
  PATH_SEPARATOR,
  ROUTER_ITEM_SEPARATOR_CHAR,
  ROUTE_PATH_ROOT,
  EMPTY_HASH,
} from './constants.ts';
import {DEFAULT_ENCODER, jsonStrategyOf} from './encoder.ts';
import type {MethodWithOptions, MethodsCache, MethodWithOptsAndJitFns} from './types/method.types.ts';
import type {
  CoreRouterOptions,
  MionTypeFn,
  JitCompiledFunctions,
  JitFunctionsHashes,
  JsonStrategy,
} from './types/general.types.ts';
import {getRTUtils} from '@mionjs/run-types';
import {getOrCreateGlobal} from './utils.ts';

// Null-prototype on purpose: the id comes off the wire (a binary body names its methods), so a plain
// object would answer `constructor` / `toString` / `__proto__` with an inherited value. Every lookup
// below is an own-key lookup for the same reason.
const methodsCache: MethodsCache = getOrCreateGlobal('mion.routerUtils.methodsCache', () => Object.create(null) as MethodsCache);

// Cache for JitCompiledFunctions objects keyed by jitHash
const jitFunctionsCache = getOrCreateGlobal('mion.routerUtils.jitFunctionsCache', () => new Map<string, JitCompiledFunctions>());
const headerJitFunctionsCache = getOrCreateGlobal(
  'mion.routerUtils.headerJitFunctionsCache',
  () => new Map<string, Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>>()
);

/**
 * Utilities for accessing and modifying the router cache.
 * The router cache stores method metadata for routes registered via addRoutesToCache() or virtual modules.
 */
export const routesCache = {
  /**
   * Get method metadata from the router cache by id.
   * @param id - The method id
   * @returns The method metadata or undefined if not found
   */
  getMetadata(id: string): MethodWithOptions | undefined {
    // a plain read is an own-key read on a null-prototype table
    return methodsCache[id] as MethodWithOptions | undefined;
  },

  /**
   * Set method metadata in the router cache
   * @param id - The method id
   * @param methodData - The method metadata
   */
  setMetadata(id: string, methodData: MethodWithOptions): void {
    methodsCache[id] = methodData as any;
  },

  /**
   * Check if the router cache contains a method by id.
   * @param id - The method id
   * @returns True if the method exists in the cache
   */
  hasMetadata(id: string): boolean {
    return methodsCache[id] !== undefined;
  },

  /**
   * Get the raw router cache object.
   * Use with caution - prefer using get/set/has methods.
   * @returns The router cache object
   */
  getCache(): MethodsCache {
    return methodsCache;
  },

  /**
   * Get method metadata with JIT functions restored from the router cache by id.
   * This augments the MethodWithOptions with paramsJitFns and returnJitFns.
   * JIT functions are cached in the entry after first access for performance.
   * @param id - The method id
   * @returns The method metadata with JIT functions or undefined if not found
   */
  getMethodJitFns(id: string): MethodWithOptsAndJitFns | undefined {
    const cached = methodsCache[id] as any;
    if (cached && cached.paramsJitFns && cached.returnJitFns) return cached as MethodWithOptsAndJitFns;

    const metadata = this.getMetadata(id);
    if (!metadata) return undefined;

    // the resolved encoder rides the metadata; a payload without one reads as the built-in defaults
    const encoder = metadata.options.encoder ?? DEFAULT_ENCODER;
    const paramsJitFns = getJitFunctionsFromHash(metadata.paramsJitHash, jsonStrategyOf(encoder.params, 'params'));
    const returnJitFns = getJitFunctionsFromHash(metadata.returnJitHash, jsonStrategyOf(encoder.return, 'return'));
    const headersParam = metadata.headersParam
      ? {...metadata.headersParam, jitFns: getHeaderJitFunctionsFromHash(metadata.headersParam.jitHash)}
      : undefined;
    const headersReturn = metadata.headersReturn
      ? {...metadata.headersReturn, jitFns: getHeaderJitFunctionsFromHash(metadata.headersReturn.jitHash)}
      : undefined;

    const result: MethodWithOptsAndJitFns = {
      ...metadata,
      paramsJitFns,
      returnJitFns,
      headersParam,
      headersReturn,
    };

    methodsCache[id] = result;
    return result as MethodWithOptsAndJitFns;
  },

  /**
   * Get method metadata with JIT functions restored from the router cache by id.
   * @param id
   * @returns
   */
  useMethodJitFns(id: string): MethodWithOptsAndJitFns {
    const MethodWithOptsAndJitFns = this.getMethodJitFns(id);
    if (!MethodWithOptsAndJitFns) throw new Error(`Metadata for remote method ${id} not found`);
    return MethodWithOptsAndJitFns;
  },

  /**
   * Set method metadata with JIT functions in the router cache.
   * This stores the complete MethodWithOptsAndJitFns object directly.
   * @param id - The method id
   * @param MethodWithOptsAndJitFns - The method metadata with JIT functions
   */
  setMethodJitFns(id: string, MethodWithOptsAndJitFns: MethodWithOptsAndJitFns): void {
    methodsCache[id] = MethodWithOptsAndJitFns as any;
  },
};

/**
 * Adds new routes to the router cache.
 * This is the public API for registering routes - called by virtual modules or directly.
 * @param newCache
 */
export function addRoutesToCache(newCache: MethodsCache) {
  for (const key of Object.keys(newCache)) {
    if (!Object.hasOwn(methodsCache, key)) {
      // Clone the cache entry to avoid mutating the original
      methodsCache[key] = {...newCache[key]} as MethodWithOptions;
    }
  }
}

/** The mion cache keys of one fn set for a JSON strategy; the binary keys only when asked for. */
export function getJitFnHashes(jitHash: string, strategy: JsonStrategy, needsBinary: boolean = false): JitFunctionsHashes {
  return {
    isType: `${JIT_FUNCTION_IDS.isType}_${jitHash}`,
    typeErrors: `${JIT_FUNCTION_IDS.typeErrors}_${jitHash}`,
    encode: `${JIT_FUNCTION_IDS[ENCODE_FAMILY_BY_STRATEGY[strategy]]}_${jitHash}`,
    decode: `${JIT_FUNCTION_IDS[DECODE_FAMILY_BY_STRATEGY[strategy]]}_${jitHash}`,
    hasUnknownKeys: `${JIT_FUNCTION_IDS.hasUnknownKeys}_${jitHash}`,
    unknownKeyErrors: `${JIT_FUNCTION_IDS.unknownKeyErrors}_${jitHash}`,
    // Named for every hash: the entry only exists when a params marker demanded it (the return
    // markers never do), so the deps lane ships it exactly when it is real.
    formatTransform: `${JIT_FUNCTION_IDS.formatTransform}_${jitHash}`,
    ...(needsBinary
      ? {
          toBinary: `${JIT_FUNCTION_IDS.toBinary}_${jitHash}`,
          fromBinary: `${JIT_FUNCTION_IDS.fromBinary}_${jitHash}`,
        }
      : {}),
  };
}

/** Rebuilds a type's fn set from the mion cache (the client metadata lane): validators, the JSON pair
 *  of the given strategy, and the binary pair when both entries exist. Noop set for the empty hash,
 *  and results are cached per (strategy, hash). */
export function getJitFunctionsFromHash(jitHash: string, strategy: JsonStrategy): JitCompiledFunctions {
  // Empty hash means no JIT functions were generated (optimization for no params or void return)
  if (jitHash === EMPTY_HASH) return noopJitFns;

  const cacheKey = `${strategy}:${jitHash}`;
  const cached = jitFunctionsCache.get(cacheKey);
  if (cached) return cached;

  // getRT() materializes the entry and returns it typed InitializedTypeFn; the MionTypeFn cast
  // additionally asserts `code`, which holds because mion only allows emitMode 'code' | 'both'.
  const utl = getRTUtils();
  const hashes = getJitFnHashes(jitHash, strategy, true);
  const isType = utl.getRT(hashes.isType);
  const typeErrors = utl.getRT(hashes.typeErrors);
  const encode = utl.getRT(hashes.encode);
  const decode = utl.getRT(hashes.decode);
  if (!isType || !typeErrors || !encode || !decode) {
    const missing = (['isType', 'typeErrors', 'encode', 'decode'] as const).filter((key) => !utl.getRT(hashes[key]));
    throw new Error(`Jit function(s) ${missing.join(', ')} not found for jitHash ${jitHash} (${strategy})`);
  }
  const jitFns = {
    isType,
    typeErrors,
    json: {strategy, encode, decode},
  } as JitCompiledFunctions;
  // strictTypes fns are optional: only present when the type has object members
  const hasUnknownKeysJit = utl.getRT(hashes.hasUnknownKeys!);
  const unknownKeyErrorsJit = utl.getRT(hashes.unknownKeyErrors!);
  if (hasUnknownKeysJit) jitFns.hasUnknownKeys = hasUnknownKeysJit as JitCompiledFunctions['hasUnknownKeys'];
  if (unknownKeyErrorsJit) jitFns.unknownKeyErrors = unknownKeyErrorsJit as JitCompiledFunctions['unknownKeyErrors'];
  // the binary pair exists only for a `binary` direction, and only as a pair
  const toBinaryJit = utl.getRT(hashes.toBinary!);
  const fromBinaryJit = utl.getRT(hashes.fromBinary!);
  if (toBinaryJit && fromBinaryJit)
    jitFns.binary = {toBinary: toBinaryJit, fromBinary: fromBinaryJit} as JitCompiledFunctions['binary'];
  // sanitizeParams: exposed only as a LIVE entry, a noop transform has nothing to apply
  const formatTransformJit = utl.getRT(hashes.formatTransform!);
  if (formatTransformJit && !formatTransformJit.isNoop)
    jitFns.formatTransform = formatTransformJit as JitCompiledFunctions['formatTransform'];

  // Cache for future calls
  jitFunctionsCache.set(cacheKey, jitFns);
  return jitFns;
}

/**
 * Helper function to get header JIT functions from a JIT hash
 * Results are cached to avoid creating duplicate objects.
 */
export function getHeaderJitFunctionsFromHash(jitHash: string): Pick<JitCompiledFunctions, 'isType' | 'typeErrors'> {
  // Check cache first
  const cached = headerJitFunctionsCache.get(jitHash);
  if (cached) return cached;

  const utl = getRTUtils();
  const hashes = getJitFnHashes(jitHash, 'mutate');
  const jitFns = {
    isType: utl.getRT(hashes.isType),
    typeErrors: utl.getRT(hashes.typeErrors),
  } as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;

  // Cache for future calls
  headerJitFunctionsCache.set(jitHash, jitFns);
  return jitFns;
}

/**
 * Get the router id for Routes or MiddleFns
 * @param itemPointer - The pointer to the item within the Routes object
 * i.e:
 * const routes = {
 *   auth: () => {},
 *   users: {
 *    getUser: () => {}
 *   }
 *   login: () => {}
 * }
 *
 * then the pointer for getUser is => ['users', 'getUser']
 */
export function getRouterItemId(itemPointer: string[]) {
  return itemPointer.join(ROUTER_ITEM_SEPARATOR_CHAR);
}

/** Gets a route path from a route pointer */
export function getRoutePath(pathPointer: string[], routerOptions: CoreRouterOptions) {
  const pathId = getRouterItemId(pathPointer);
  const basePath = routerOptions.basePath.startsWith(ROUTE_PATH_ROOT)
    ? routerOptions.basePath
    : `${ROUTE_PATH_ROOT}${routerOptions.basePath}`;
  const routePath = basePath.endsWith(PATH_SEPARATOR) ? `${basePath}${pathId}` : `${basePath}${PATH_SEPARATOR}${pathId}`;
  return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
}

export function resetRoutesCache() {
  for (const k in methodsCache) delete methodsCache[k];
}

/** Resets the JIT functions cache. Useful for testing purposes only. */
export function resetJitFunctionsCache(): void {
  jitFunctionsCache.clear();
  headerJitFunctionsCache.clear();
}

// Noop fns for handlers with no params or void return; the json pair reads as `mutate`, which frames
// as a plain json value and never encodes anything.
// prettier-ignore
const noopJitFns: JitCompiledFunctions = {
    isType: fakeJitFn(JIT_FUNCTION_IDS.isType),
    typeErrors: fakeJitFn(JIT_FUNCTION_IDS.typeErrors),
    json: {strategy: 'mutate', encode: fakeJitFn(JIT_FUNCTION_IDS.pj), decode: fakeJitFn(JIT_FUNCTION_IDS.rj)},
} as any;

/** Creates a fake JIT function with isNoop=true for handlers with no params or void return */
function fakeJitFn(fnID: string): MionTypeFn<any> {
  return {
    typeName: 'mionNoopJit',
    fnID,
    rtFnHash: EMPTY_HASH,
    args: {vλl: 'v'},
    defaultParamValues: {vλl: 'v'},
    isNoop: true,
    code: '',
    createRTFn: () => {
      throw new Error('isNoop JIT functions should not be called, this is a function when jit is never used');
    },
    fn: () => {
      throw new Error('isNoop JIT functions should not be called, this is a function when jit is never used');
    },
  };
}

export function getNoopJitFns(): JitCompiledFunctions {
  return noopJitFns;
}
