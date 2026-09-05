/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MethodWithJitFns} from '@mionjs/core';
import {EMPTY_HASH, getNoopJitFns, getOrCreateGlobal} from '@mionjs/core';
import {getHeadersReflectionFromMarkers, getReflectionFromMarkers, isAsyncHandler} from '@mionjs/core';
import {Handler} from '../types/handlers.ts';
import {RouterOptions} from '../types/general.ts';
import {RouteOptions, MiddleFnOptions, HeadersMiddleFnOptions, MiddleFnMethod, HeadersMethod} from '../types/remoteMethods.ts';
import {AnyHandlerDef, RawMiddleFnDef} from '../types/definitions.ts';

// ############ This file is the only one consuming type reflection within the router ########
// mion migration: all type information is injected AT BUILD TIME into the
// route()/middleFn() factory call sites (see lib/handlers.ts). This module only adapts
// those injected payloads into the MethodReflect shape the router consumes. There is no
// runtime reflection, no JIT compilation and no AOT cache layer anymore — the generated
// function modules emitted by the mion vite plugin ARE the AOT artifacts.

type MethodReflect = Omit<MethodWithJitFns, 'id' | 'type' | 'nestLevel' | 'pointer' | 'options'>;

/**
 * Error thrown when a route/middleFn definition carries no injected type information.
 * This means the code was built/executed without the mion vite plugin being active.
 */
export class MissingRtFnsError extends Error {
  constructor(routeId: string, cause?: string) {
    super(
      `Route/middleFn "${routeId}" has no build-time type information.\n` +
        `Declare it through route()/middleFn() and make sure mionVitePlugin (@mionjs/devtools) is active in the build.` +
        (cause ? `\nCause: ${cause}` : '')
    );
    this.name = 'MissingRtFnsError';
  }
}

/**
 * Error thrown when the injected type information IS present but cannot be materialized because
 * the host runtime forbids building functions from strings (workerd, Vercel's EdgeVM, any CSP
 * without 'unsafe-eval'). This is a BUILD-CONFIG problem, not a missing-plugin one.
 */
export class RuntimeCodeGenBlockedError extends Error {
  constructor(routeId: string, cause?: string) {
    super(
      `Route/middleFn "${routeId}" carries build-time type information, but this runtime forbids ` +
        `compiling functions from strings.\n` +
        `Build with \`mionVitePlugin({runTypes: {emitMode: 'both'}})\`: the default 'code' ships each ` +
        `compiled fn as a source string that is turned into a function on first use, which edge ` +
        `runtimes (Cloudflare Workers / workerd, Vercel Edge) refuse. 'both' also emits the live ` +
        `factory, so nothing is compiled at runtime.` +
        (cause ? `\nCause: ${cause}` : '')
    );
    this.name = 'RuntimeCodeGenBlockedError';
  }
}

// workerd: "Code generation from strings disallowed for this context"; V8/EdgeVM with a CSP:
// "Code generation from strings disallowed"/"unsafe-eval". Matched on the shared stem so both land.
const CODE_GEN_BLOCKED = /code generation from strings|unsafe-eval/i;

/** True when an error from the mion runtime is a blocked `new Function`, not a missing payload. */
function isCodeGenBlocked(message?: string): boolean {
  return !!message && CODE_GEN_BLOCKED.test(message);
}

// ############ Raw MiddleFn Reflection ############

// Cache for common raw middleFn reflections
const rawMiddleFnReflectionCache = getOrCreateGlobal(
  'mion.reflection.rawMiddleFnReflectionCache',
  () => new Map<string, MethodReflect>()
);

/** Creates a MethodReflect for raw middleFns: no type info, NoopJitFns. */
function createRawMiddleFnReflection(isAsync: boolean, hasReturnData: boolean = false, paramsCount: number = 0): MethodReflect {
  const cacheKey = `${isAsync}_${hasReturnData}_${paramsCount}`;
  const cached = rawMiddleFnReflectionCache.get(cacheKey);
  if (cached) return cached;

  const reflection: MethodReflect = {
    paramsCount,
    paramsJitFns: getNoopJitFns(),
    returnJitFns: getNoopJitFns(),
    paramsJitHash: EMPTY_HASH,
    returnJitHash: EMPTY_HASH,
    hasReturnData,
    isAsync,
  };

  rawMiddleFnReflectionCache.set(cacheKey, reflection);
  return reflection;
}

// ############ Main Reflection Functions ############

/** Definitions that carry an injected `rtFns` payload. RawMiddleFnDef is excluded: a raw
 *  middleFn declares no extra params, so it has no reflection and goes through
 *  getRawMethodReflection instead. */
type ReflectableDef = Exclude<AnyHandlerDef, RawMiddleFnDef>;

/**
 * Gets reflection data for a route or middleFn definition.
 * All data derives from the mion marker payload the factory stashed on the definition
 * (`def.rtFns`); registration fails loudly when the payload is missing (plugin not active).
 */
export function getHandlerReflection(
  def: ReflectableDef,
  routeId: string,
  routerOptions: RouterOptions,
  // handlerOptions/strictTypes stay unused here: option-dependent behavior (strictTypes)
  // is runtime-gated at dispatch against the compiled unknown-keys fns.
  handlerOptions: RouteOptions | MiddleFnOptions | HeadersMiddleFnOptions = {}, // eslint-disable-line @typescript-eslint/no-unused-vars
  isHeadersMiddleFn: boolean = false,
  methodStrictTypes?: boolean // eslint-disable-line @typescript-eslint/no-unused-vars
): MethodReflect {
  try {
    return isHeadersMiddleFn
      ? getHeadersReflectionFromMarkers(def.rtFns, def.handler, routeId)
      : getReflectionFromMarkers(def.rtFns, def.handler, routeId);
  } catch (error: any) {
    if (isCodeGenBlocked(error?.message)) throw new RuntimeCodeGenBlockedError(routeId, error.message);
    throw new MissingRtFnsError(routeId, error?.message);
  }
}

/**
 * Gets reflection data for a raw middleFn. Raw middleFns receive raw request/response and
 * handle their own (de)serialization, so they carry no type info at all.
 */
export function getRawMethodReflection(
  handler: Handler,
  routeId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  routerOptions: RouterOptions // eslint-disable-line @typescript-eslint/no-unused-vars
): MethodReflect {
  return createRawMiddleFnReflection(isAsyncHandler(handler));
}

// ############ Binary serialization ############

const binaryWarned = getOrCreateGlobal('mion.reflection.binaryWarned', () => new Set<string>());

/**
 * Checks the binary pair of a middleFn that sits in the execution chain of a binary route, per direction the
 * route rides binary. The pair is compiled AT BUILD TIME only where the `serializer` option asks for `binary`
 * (on the middleFn, or as the router default), and a type that is not binary-serializable has no entries either.
 * A missing pair is a WARNING, not an error: the wire degrades safely — serializeBinaryBody skips methods
 * without toBinary, and deserializeBinaryBody throws a clear error only if a binary body actually carries the
 * method's key.
 */
export function ensureBinaryJitFns(method: MiddleFnMethod | HeadersMethod, needs: {params: boolean; return: boolean}): void {
  const missing: string[] = [];
  const hasParams = !method.paramsJitFns.isType.isNoop;
  if (needs.params && hasParams && !method.paramsJitFns.binary) missing.push('params');
  if (needs.return && method.hasReturnData && !method.returnJitFns.binary) missing.push('return');
  if (missing.length && !binaryWarned.has(method.id)) {
    binaryWarned.add(method.id);
    console.warn(
      `mion: middleFn "${method.id}" runs in a binary route's chain but has no binary serialization fns for its ${missing.join(' and ')}; ` +
        `its data will not ride binary bodies. Declare it with \`serializer: 'binary'\` (or set 'binary' as the router default), ` +
        `unless the type is not binary-serializable.`
    );
  }
}
