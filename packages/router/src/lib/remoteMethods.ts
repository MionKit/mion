/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type RouterEntry, type Routes} from '../types/general.ts';
import {type RemoteMethod} from '../types/remoteMethods.ts';
import type {PublicApi} from '../types/publicMethods.ts';
import type {
  AnyObject,
  CompiledTypeFn,
  CompiledFnData,
  SerializablePureFunction,
  MethodWithOptions,
  PureFnsDataCache,
} from '@mionjs/core';
import {isRoute, isHeadersMiddleFnDef, isMiddleFnDef} from '../types/guards.ts';
import {getMiddleFnExecutable, getRouteExecutable, isPrivateDefinition} from '../router.ts';
import {
  getRouterItemId,
  MAX_STACK_DEPTH,
  getJitFnHashes,
  resolveCompiledPureFn,
  EMPTY_HASH,
  getOrCreateGlobal,
} from '@mionjs/core';
import {getRTUtils} from '@mionjs/run-types';

// ############# PRIVATE STATE #############
const publicMethods = getOrCreateGlobal('mion.remoteMethods.publicMethods', () => new Map<string, MethodWithOptions>());

// ############# PUBLIC METHODS #############
export function resetRemoteMethodsMetadata() {
  publicMethods.clear();
}

/**
 * Returns a data structure containing all public information and types of the routes.
 * This data and types can be used to generate router clients, etc...
 */
export function getPublicApi<R extends Routes>(routes: R): PublicApi<R> {
  return recursiveGetSerializableRoutes(routes) as PublicApi<R>;
}

// ############# PRIVATE METHODS #############

function recursiveGetSerializableRoutes<R extends Routes>(
  routes: R,
  currentPointer: string[] = [],
  publicData: AnyObject = {}
): AnyObject {
  const entries = Object.entries(routes);
  entries.forEach(([key, item]: [string, RouterEntry]) => {
    const itemPointer = [...currentPointer, key];
    const id = getRouterItemId(itemPointer);

    if (isPrivateDefinition(item, id)) {
      publicData[key] = null; // middleFns that don't receive or return data are not public
    } else if (isMiddleFnDef(item) || isHeadersMiddleFnDef(item) || isRoute(item)) {
      const executable = getMiddleFnExecutable(id) || getRouteExecutable(id);
      if (!executable) throw new Error(`Route or MiddleFn ${id} not found. Please check you have called mion.initRoutes first.`);
      publicData[key] = getSerializableMethod(executable as RemoteMethod);
    } else {
      const subRoutes: Routes = routes[key] as Routes;
      publicData[key] = recursiveGetSerializableRoutes(subRoutes, itemPointer);
    }
  });

  return publicData;
}

export function getSerializableMethod(executable: RemoteMethod): MethodWithOptions {
  const existing = publicMethods.get(executable.id);
  if (existing) return existing as MethodWithOptions;

  const newRemoteMethod: MethodWithOptions = {
    type: executable.type,
    id: executable.id,
    nestLevel: executable.nestLevel,
    isAsync: executable.isAsync,
    hasReturnData: executable.hasReturnData,
    paramsJitHash: executable.paramsJitHash,
    returnJitHash: executable.returnJitHash,
    pointer: executable.pointer,
    paramsCount: executable.paramsCount ?? 0,
    paramNames: executable.paramNames,
    options: executable.options,
  };
  if (executable.headersParam) newRemoteMethod.headersParam = executable.headersParam;
  if (executable.middleFnIds) newRemoteMethod.middleFnIds = executable.middleFnIds;
  publicMethods.set(executable.id, newRemoteMethod);
  return newRemoteMethod as MethodWithOptions;
}

/** RunTypes' package-owned pure-fn namespaces. Their bodies are hollowed in the dist build and
 *  supplied from the built-in table at runtime, so every entry is already registered wherever
 *  `@mionjs/run-types` is loaded — which on the client is guaranteed, since @mionjs/core
 *  value-imports it. Kept in sync with upstream's own `isBuiltinPureFnNamespace` (pureFn.ts), which
 *  is module-private, and with the Go `builtinPureFnNamespaces` set. */
const BUILTIN_PURE_FN_NAMESPACES = new Set(['rt', 'rtFormats']);

/** Serializes pure function dependencies into a namespaced cache structure.
 * @param namespacedDepHash - Pure function dependency in format "namespace::fnHash"
 * @param purFnDeps - Namespaced cache to store serialized pure functions
 * @param depth - Current recursion depth for stack overflow protection
 */
export function serializePureDeps(namespacedDepHash: string, purFnDeps: PureFnsDataCache, depth = 0) {
  if (depth >= MAX_STACK_DEPTH)
    throw new Error(`Max depth reached serializing pure function dependencies, for: ${namespacedDepHash}`);
  // Parse "namespace::fnHash" format
  const parts = namespacedDepHash.split('::');
  if (parts.length !== 2)
    throw new Error(`Invalid pure function dependency format: ${namespacedDepHash}, expected "namespace::fnHash"`);
  const [namespace, fnHash] = parts;
  // Built-ins never ride the wire: the client already has them, and their bodies are hollowed
  // server-side so there would be nothing to send. addSerializedJitCaches skipped them on restore
  // anyway (hasPureFnByKey short-circuit) — skipping here just stops shipping the dead weight.
  if (BUILTIN_PURE_FN_NAMESPACES.has(namespace)) return;
  // Ensure namespace exists in the cache
  if (!purFnDeps[namespace]) purFnDeps[namespace] = {};
  // Check if already serialized (prevent infinite recursion on circular dependencies)
  if (purFnDeps[namespace][fnHash]) return;
  const pureDep = resolveCompiledPureFn(namespace, fnHash);
  if (!pureDep) throw new Error(`Pure function ${fnHash} not found in namespace ${namespace}`);
  // The client rebuilds a pure fn as `new Function(...paramNames, code)` — there is no other
  // lane. An entry with no code is unrecoverable there, so fail here instead of shipping a
  // payload that breaks on first use. With built-ins already filtered out above, this can only
  // fire for a user/framework fn registered at runtime with no body: server-only by nature.
  if (!pureDep.code)
    throw new Error(
      `Pure function ${namespace}::${fnHash} has no code payload and cannot be serialized to the client. ` +
        `Runtime-registered pure fns are server-only; the client can rebuild only build-extracted ones.`
    );
  const serializedPureDep: SerializablePureFunction = {
    ...pureDep,
    code: pureDep.code,
    pureFnDependencies: pureDep.pureFnDependencies ? [...pureDep.pureFnDependencies] : undefined,
  };
  purFnDeps[namespace][fnHash] = serializedPureDep;
  // Dependencies within the same namespace are stored as just fnHash, not namespaced
  pureDep.pureFnDependencies?.forEach((depFnHash) => serializePureDeps(`${namespace}::${depFnHash}`, purFnDeps, depth + 1));
}

export function serializeJitFn(rtFnHash: string, deps: Record<string, CompiledFnData>, purFnDeps: PureFnsDataCache, depth = 0) {
  if (depth >= MAX_STACK_DEPTH)
    throw new Error(`Max depth reached serializing jit function dependencies for jitHash: ${rtFnHash}`);
  const jitFn = getRTUtils().getRT(rtFnHash);
  if (!jitFn) throw new Error(`Jit function ${rtFnHash} not found`);
  if (deps[rtFnHash]) return; // already serialized and prevent infinite recursion on circular dependencies
  const serializedJitFn = getSerializableJitCompiler(jitFn);
  deps[rtFnHash] = serializedJitFn;
  jitFn.rtDependencies?.forEach((h) => serializeJitFn(h, deps, purFnDeps, depth + 1));
  jitFn.pureFnDependencies?.forEach((h) => serializePureDeps(h, purFnDeps));
}

export function serializeMethodDeps(
  method: MethodWithOptions,
  deps: Record<string, CompiledFnData>,
  purFnDeps: PureFnsDataCache
) {
  const {paramsJitHash, returnJitHash} = method;
  // Skip serialization for empty hashes (no params or void return)
  // Always request binary hashes so they are included when available (e.g. middleware in binary routes).
  // serializeJitFn is only called when the JIT function exists in the store, so non-binary methods are unaffected.
  const utl = getRTUtils();
  if (paramsJitHash !== EMPTY_HASH) {
    const paramsJitHashes = getJitFnHashes(paramsJitHash, true);
    for (const k in paramsJitHashes) {
      if (utl.getRT(paramsJitHashes[k])) serializeJitFn(paramsJitHashes[k], deps, purFnDeps);
    }
  }
  if (returnJitHash !== EMPTY_HASH) {
    const returnJitHashes = getJitFnHashes(returnJitHash, true);
    let foundAny = false;
    for (const k in returnJitHashes) {
      if (utl.getRT(returnJitHashes[k])) {
        serializeJitFn(returnJitHashes[k], deps, purFnDeps);
        foundAny = true;
      }
    }
    if (!foundAny) {
      throw new Error(
        `Method "${method.id}" declares returnJitHash="${returnJitHash}" but no JIT functions are registered under that hash. ` +
          `This usually means a Promise/Function return type was not unwrapped before computing the hash.`
      );
    }
  }
}

function getSerializableJitCompiler(comp: CompiledTypeFn): CompiledFnData {
  return {
    typeName: comp.typeName,
    fnID: comp.fnID,
    // the exact emitting family — upstream's findRTForType gates on it, and unlike fnID it is
    // not composited, so the client cannot recover it from anything else on the wire
    familyTag: comp.familyTag,
    rtFnHash: comp.rtFnHash,
    args: {...comp.args},
    isNoop: comp.isNoop,
    defaultParamValues: {...comp.defaultParamValues},
    code: comp.code,
    rtDependencies: comp.rtDependencies ? [...comp.rtDependencies] : undefined,
    pureFnDependencies: comp.pureFnDependencies ? [...comp.pureFnDependencies] : undefined,
    // an alwaysThrow entry has no code, only this message; without it the client cannot rebuild
    // the throwing factory and surfaces a bare TypeError instead of the build-time diagnostic
    alwaysThrowMessage: comp.alwaysThrowMessage,
  };
}
