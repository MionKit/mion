/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  JIT_FUNCTION_IDS,
  PARSE_MODES,
  PATH_SEPARATOR,
  ROUTER_ITEM_SEPARATOR_CHAR,
  ROUTE_PATH_ROOT,
  EMPTY_HASH,
} from './constants.ts';
import {DEFAULT_PARSER} from './parser.ts';
import type {MethodWithOptions, MethodsCache, MethodWithOptsAndJitFns} from './types/method.types.ts';
import type {
  CoreRouterOptions,
  MionTypeFn,
  JitCompiledFunctions,
  JitFunctionsHashes,
  ParserStrategy,
} from './types/general.types.ts';
import {getRTUtils} from '@mionjs/run-types/runtime';
import {getOrCreateGlobal} from './utils.ts';

// Null-prototype on purpose: the id comes off the wire, so a plain object would answer `constructor` /
// `toString` / `__proto__` with an inherited value. Every lookup below is an own-key lookup for the same reason.
const methodsCache: MethodsCache = getOrCreateGlobal('mion.routerUtils.methodsCache', () => Object.create(null) as MethodsCache);

const jitFunctionsCache = getOrCreateGlobal('mion.routerUtils.jitFunctionsCache', () => new Map<string, JitCompiledFunctions>());
const headerJitFunctionsCache = getOrCreateGlobal(
  'mion.routerUtils.headerJitFunctionsCache',
  () => new Map<string, Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>>()
);

/** The router cache: method metadata for routes registered via addRoutesToCache() or virtual modules. */
export const routesCache = {
  getMetadata(id: string): MethodWithOptions | undefined {
    // a plain read is an own-key read on a null-prototype table
    return methodsCache[id] as MethodWithOptions | undefined;
  },

  setMetadata(id: string, methodData: MethodWithOptions): void {
    methodsCache[id] = methodData as any;
  },

  hasMetadata(id: string): boolean {
    return methodsCache[id] !== undefined;
  },

  /** Removes a method, materialized jit fns included: the client drops metadata restored from an older server build. */
  removeMetadata(id: string): void {
    delete methodsCache[id];
  },

  /** The raw cache object; prefer the get/set/has methods. */
  getCache(): MethodsCache {
    return methodsCache;
  },

  /** Metadata plus its restored JIT functions; the augmented entry is written back to the cache on first access. */
  getMethodJitFns(id: string): MethodWithOptsAndJitFns | undefined {
    const cached = methodsCache[id] as any;
    if (cached && cached.paramsJitFns && cached.returnJitFns) return cached as MethodWithOptsAndJitFns;

    const metadata = this.getMetadata(id);
    if (!metadata) return undefined;

    const parser = metadata.options.parser ?? DEFAULT_PARSER;
    const paramsJitFns = getJitFunctionsFromHash(metadata.paramsJitHash, parser.params);
    const returnJitFns = getJitFunctionsFromHash(metadata.returnJitHash, parser.return);
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

  /** getMethodJitFns, but throws instead of returning undefined. */
  useMethodJitFns(id: string): MethodWithOptsAndJitFns {
    const MethodWithOptsAndJitFns = this.getMethodJitFns(id);
    if (!MethodWithOptsAndJitFns) throw new Error(`Metadata for remote method ${id} not found`);
    return MethodWithOptsAndJitFns;
  },

  setMethodJitFns(id: string, MethodWithOptsAndJitFns: MethodWithOptsAndJitFns): void {
    methodsCache[id] = MethodWithOptsAndJitFns as any;
  },
};

/** The public API for registering routes, called by virtual modules or directly. Existing entries are kept. */
export function addRoutesToCache(newCache: MethodsCache) {
  for (const key of Object.keys(newCache)) {
    if (!Object.hasOwn(methodsCache, key)) {
      // cloned so the caller's object is never mutated
      methodsCache[key] = {...newCache[key]} as MethodWithOptions;
    }
  }
}

/** One row of PARSE_MODES names every family a wire compiled. */
export function getJitFnHashes(jitHash: string, strategy: ParserStrategy): JitFunctionsHashes {
  const row = PARSE_MODES[strategy];
  return {
    isType: `${JIT_FUNCTION_IDS[row.validate]}_${jitHash}`,
    typeErrors: `${JIT_FUNCTION_IDS[row.validationErrors]}_${jitHash}`,
    encode: `${JIT_FUNCTION_IDS[row.encode]}_${jitHash}`,
    decode: `${JIT_FUNCTION_IDS[row.decode]}_${jitHash}`,
    // Named for every hash: the entry only exists when a params marker demanded it (the return
    // markers never do), so the deps lane ships it exactly when it is real.
    formatTransform: `${JIT_FUNCTION_IDS.formatTransform}_${jitHash}`,
  };
}

/** Rebuilds a type's fn set from the mion cache (the client metadata lane), cached per strategy and hash. */
export function getJitFunctionsFromHash(jitHash: string, strategy: ParserStrategy): JitCompiledFunctions {
  // no JIT functions were generated for this type (no params, or a void return)
  if (jitHash === EMPTY_HASH) return noopJitFns;

  const cacheKey = `${strategy}:${jitHash}`;
  const cached = jitFunctionsCache.get(cacheKey);
  if (cached) return cached;

  // the MionTypeFn cast also asserts `code`, which holds because mion only allows emitMode 'code' | 'both'
  const utl = getRTUtils();
  const hashes = getJitFnHashes(jitHash, strategy);
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
  // sanitizeParams: exposed only as a LIVE entry, a noop transform has nothing to apply
  const formatTransformJit = utl.getRT(hashes.formatTransform!);
  if (formatTransformJit && !formatTransformJit.isNoop)
    jitFns.formatTransform = formatTransformJit as JitCompiledFunctions['formatTransform'];

  jitFunctionsCache.set(cacheKey, jitFns);
  return jitFns;
}

/** Header validation fns for a jit hash; cached so the same hash never builds a second object. */
export function getHeaderJitFunctionsFromHash(jitHash: string): Pick<JitCompiledFunctions, 'isType' | 'typeErrors'> {
  const cached = headerJitFunctionsCache.get(jitHash);
  if (cached) return cached;

  const utl = getRTUtils();
  const hashes = getJitFnHashes(jitHash, 'mutate');
  const jitFns = {
    isType: utl.getRT(hashes.isType),
    typeErrors: utl.getRT(hashes.typeErrors),
  } as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;

  headerJitFunctionsCache.set(jitHash, jitFns);
  return jitFns;
}

/** True when every compiled function this method points at is already in the cache.
 *  A stored client cache can lose a function without losing the method that names it, and
 *  getJitFunctionsFromHash only finds out at call time, where it throws. This checks presence instead,
 *  materializing no code, so a restore can refuse the method and refetch it. */
export function hasJitFnsForMethod(metadata: MethodWithOptions): boolean {
  const utl = getRTUtils();
  const parser = metadata.options.parser ?? DEFAULT_PARSER;
  const hasFullSet = (jitHash: string, strategy: ParserStrategy): boolean => {
    if (jitHash === EMPTY_HASH) return true;
    const hashes = getJitFnHashes(jitHash, strategy);
    return (
      utl.hasRTFn(hashes.isType) && utl.hasRTFn(hashes.typeErrors) && utl.hasRTFn(hashes.encode) && utl.hasRTFn(hashes.decode)
    );
  };
  // Header sets are left out because getHeaderJitFunctionsFromHash returns them empty instead of throwing.
  if (!hasFullSet(metadata.paramsJitHash, parser.params)) return false;
  return hasFullSet(metadata.returnJitHash, parser.return);
}

/** The router id of a Route or Middleware: its pointer inside the Routes object, e.g. ['users', 'getUser']. */
export function getRouterItemId(itemPointer: string[]) {
  return itemPointer.join(ROUTER_ITEM_SEPARATOR_CHAR);
}

export function getRoutePath(pathPointer: string[], routerOptions: Pick<CoreRouterOptions, 'basePath' | 'suffix'>) {
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

// resetJitFunctionsCache moved to @mionjs/core/testing: a shipped client must not carry a cache reset.

// Noop fns for handlers with no params or void return; the json pair reads as `mutate`, which frames
// as a plain json value and never encodes anything.
// prettier-ignore
const noopJitFns: JitCompiledFunctions = {
    isType: fakeJitFn(JIT_FUNCTION_IDS.validate),
    typeErrors: fakeJitFn(JIT_FUNCTION_IDS.validationErrors),
    json: {strategy: 'mutate', encode: fakeJitFn(JIT_FUNCTION_IDS.prepareForJsonMutate), decode: fakeJitFn(JIT_FUNCTION_IDS.restoreFromJsonMutate)},
} as any;

/** isNoop stand-in for handlers with no params or a void return. */
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
