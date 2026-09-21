/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type RouterEntry, type Routes} from '../types/general.ts';
import {type RemoteMethod} from '../types/remoteMethods.ts';
import type {PublicApi} from '../types/publicMethods.ts';
import type {AnyObject, CompiledTypeFn, CompiledFnData, MethodWithOptions, PureFnsDataCache} from '@mionjs/core';
import {isRoute, isHeadersMiddleFnDef, isMiddleFnDef} from '../types/guards.ts';
import {getMiddleFnExecutable, getRouteExecutable, isPrivateDefinition, getPlatformMaxBodySize} from '../router.ts';
import {
  getRouterItemId,
  MAX_STACK_DEPTH,
  getJitFnHashes,
  DEFAULT_PARSER,
  resolveCompiledPureFn,
  EMPTY_HASH,
  getOrCreateGlobal,
  HandlerType,
} from '@mionjs/core';
import {getRTUtils, RUN_TYPES_PURE_FN_ID_PREFIX} from '@mionjs/run-types/runtime';

// ############# PRIVATE STATE #############
const publicMethods = getOrCreateGlobal('mion.remoteMethods.publicMethods', () => new Map<string, MethodWithOptions>());

// ############# PUBLIC METHODS #############
export function resetRemoteMethodsMetadata() {
  publicMethods.clear();
}

/** All the public information and types of the routes, what a router client is generated from. */
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
    // a route whose types could not say takes the platform's number: filled in here, once, so the
    // client sees the limit the server really applies (the adapter has published it by now)
    options:
      executable.type === HandlerType.route && executable.options.maxBodySize === undefined
        ? {...executable.options, maxBodySize: getPlatformMaxBodySize()}
        : executable.options,
  };
  if (executable.headersParam) newRemoteMethod.headersParam = executable.headersParam;
  // the client rebuilds a returned HeadersSubset from these names, so they must ride the wire
  if (executable.headersReturn) {
    newRemoteMethod.headersReturn = {
      headerNames: executable.headersReturn.headerNames,
      jitHash: executable.headersReturn.jitHash,
    };
  }
  if (executable.middleFnIds) newRemoteMethod.middleFnIds = executable.middleFnIds;
  publicMethods.set(executable.id, newRemoteMethod);
  return newRemoteMethod as MethodWithOptions;
}

/** Serializes a pure function and everything it reaches into the wire cache, keyed by id. */
export function serializePureDeps(id: string, purFnDeps: PureFnsDataCache, depth = 0) {
  if (depth >= MAX_STACK_DEPTH) throw new Error(`Max depth reached serializing pure function dependencies, for: ${id}`);
  // Run-types' own pure fns never ride the wire: their bodies are hollowed in the dist build and served by
  // the compiler, so each is already registered wherever `@mionjs/run-types` is loaded, guaranteed on the
  // client since @mionjs/core value-imports it. addSerializedJitCaches skipped them on restore anyway.
  if (id.startsWith(RUN_TYPES_PURE_FN_ID_PREFIX)) return;
  // prevents infinite recursion on circular dependencies
  if (purFnDeps[id]) return;
  const pureDep = resolveCompiledPureFn(id);
  if (!pureDep) throw new Error(`Pure function ${id} not found`);
  // The client rebuilds a pure fn as `new Function(...paramNames, code)` and nothing else, so an entry with
  // no code is unrecoverable there: fail here instead of shipping a payload that breaks on first use. With
  // built-ins filtered out above, only a fn registered at runtime with no body reaches this: server-only.
  if (!pureDep.code)
    throw new Error(
      `Pure function ${id} has no code payload and cannot be serialized to the client. ` +
        `Runtime-registered pure fns are server-only; the client can rebuild only build-extracted ones.`
    );
  purFnDeps[id] = {
    ...pureDep,
    code: pureDep.code,
    pureFnDependencies: pureDep.pureFnDependencies ? [...pureDep.pureFnDependencies] : undefined,
  };
  pureDep.pureFnDependencies?.forEach((depId) => serializePureDeps(depId, purFnDeps, depth + 1));
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
  // an empty hash means no params, or a void return
  const utl = getRTUtils();
  const parser = method.options.parser ?? DEFAULT_PARSER;
  if (paramsJitHash !== EMPTY_HASH) {
    const paramsJitHashes = getJitFnHashes(paramsJitHash, parser.params, 'params');
    for (const k in paramsJitHashes) {
      if (utl.getRT(paramsJitHashes[k])) serializeJitFn(paramsJitHashes[k], deps, purFnDeps);
    }
  }
  if (returnJitHash !== EMPTY_HASH) {
    const returnJitHashes = getJitFnHashes(returnJitHash, parser.return, 'return');
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
