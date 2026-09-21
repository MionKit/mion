/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MethodWithJitFns} from '@mionjs/core';
import {EMPTY_HASH, getNoopJitFns, getOrCreateGlobal, type ResolvedParser} from '@mionjs/core';
import {getHeadersReflectionFromMarkers, getReflectionFromMarkers, isAsyncHandler} from '@mionjs/core';
import {Handler} from '../types/handlers.ts';
import {RouterOptions} from '../types/general.ts';
import {RouteOptions, MiddleFnOptions} from '../types/remoteMethods.ts';
import {AnyHandlerDef, RawMiddleFnDef} from '../types/definitions.ts';

// ############ This file is the only one consuming type reflection within the router ########
// All type information is injected AT BUILD TIME into the route()/middleFn() call sites (lib/handlers.ts)
// and this module only adapts those payloads into the MethodReflect shape the router consumes. No runtime
// reflection, no JIT compilation, no AOT cache: the modules the mion vite plugin emits ARE the artifacts.

type MethodReflect = Omit<MethodWithJitFns, 'id' | 'type' | 'nestLevel' | 'pointer' | 'options'>;

/** The definition carries no injected type information: it was built or run without the mion plugin active. */
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

/** The injected type information IS present but the host forbids building functions from strings (workerd,
 *  Vercel's EdgeVM, a CSP without 'unsafe-eval'). A BUILD-CONFIG problem, not a missing-plugin one. */
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

/** All data derives from the mion marker payload the factory stashed on the definition (`def.rtFns`);
 *  registration fails loudly when that payload is missing (plugin not active). */
export function getHandlerReflection(
  def: ReflectableDef,
  routeId: string,
  routerOptions: RouterOptions,
  // handlerOptions stays unused here: what a route compiles is decided at build time by its parser strategy.
  handlerOptions: RouteOptions | MiddleFnOptions = {}, // eslint-disable-line @typescript-eslint/no-unused-vars
  isHeadersMiddleFn: boolean = false
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

/** Raw middleFns receive the raw request / response and handle their own (de)serialization, so they
 *  carry no type info at all. */
export function getRawMethodReflection(
  handler: Handler,
  routeId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  routerOptions: RouterOptions // eslint-disable-line @typescript-eslint/no-unused-vars
): MethodReflect {
  return createRawMiddleFnReflection(isAsyncHandler(handler));
}

/** Checks each direction's compiled strategy against the resolved one: they differ only when the
 *  build saw a different literal than the runtime value. */
export function assertCompiledParser(methodId: string, encoder: ResolvedParser, reflection: MethodReflect): void {
  const sides = [
    ['params', reflection.paramsJitHash, reflection.paramsJitFns],
    ['return', reflection.returnJitHash, reflection.returnJitFns],
  ] as const;
  for (const [direction, hash, fns] of sides) {
    if (hash === EMPTY_HASH) continue;
    const wanted = encoder[direction];
    if (fns.json.strategy !== wanted)
      throw new Error(
        `mion: ${direction} encoder of "${methodId}" is '${encoder[direction]}' at runtime but the build compiled ` +
          `'${fns.json.strategy}'. Write the encoder option inline on the route (or as an \`as const\` preset) and the ` +
          `router-wide default as a literal on createMionRouter, so the build sees the same value the runtime reads.`
      );
  }
}
