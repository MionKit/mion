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
import {AnyHandlerDef} from '../types/definitions.ts';

// ############ This file is the only one consuming type reflection within the router ########
// ts-runtypes migration: all type information is injected AT BUILD TIME into the
// route()/middleFn() factory call sites (see lib/handlers.ts). This module only adapts
// those injected payloads into the MethodReflect shape the router consumes. There is no
// runtime reflection, no JIT compilation and no AOT cache layer anymore — the generated
// function modules emitted by the ts-runtypes vite plugin ARE the AOT artifacts.

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

/** No-op since the ts-runtypes migration (kept so existing specs/utilities keep working). */
export function resetRunTypesCache(): void {}

/** Resets reflection caches. Only the raw-middleFn memo remains since the ts-runtypes migration. */
export function resetReflectionCaches(): void {
    rawMiddleFnReflectionCache.clear();
}

// ############ Raw MiddleFn Reflection ############

// Cache for common raw middleFn reflections
const rawMiddleFnReflectionCache = getOrCreateGlobal(
    'mion.reflection.rawMiddleFnReflectionCache',
    () => new Map<string, MethodReflect>()
);

/** Creates a MethodReflect for raw middleFns: no type info, NoopJitFns. */
function createRawMiddleFnReflection(isAsync: boolean, hasReturnData: boolean = false, paramNames: string[] = []): MethodReflect {
    const cacheKey = `${isAsync}_${hasReturnData}_${paramNames.join(',')}`;
    const cached = rawMiddleFnReflectionCache.get(cacheKey);
    if (cached) return cached;

    const reflection: MethodReflect = {
        paramNames,
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

/**
 * Gets reflection data for a route or middleFn definition.
 * All data derives from the ts-runtypes marker payload the factory stashed on the definition
 * (`def.rtFns`); registration fails loudly when the payload is missing (plugin not active).
 */
export async function getHandlerReflection(
    def: AnyHandlerDef,
    routeId: string,
    routerOptions: RouterOptions,
    // handlerOptions/strictTypes stay unused here: option-dependent behavior (strictTypes)
    // is runtime-gated at dispatch against the compiled unknown-keys fns.
    handlerOptions: RouteOptions | MiddleFnOptions | HeadersMiddleFnOptions = {}, // eslint-disable-line @typescript-eslint/no-unused-vars
    isHeadersMiddleFn: boolean = false,
    methodStrictTypes?: boolean // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<MethodReflect> {
    try {
        return isHeadersMiddleFn
            ? getHeadersReflectionFromMarkers(def.rtFns, def.handler, routeId)
            : getReflectionFromMarkers(def.rtFns, def.handler, routeId);
    } catch (error: any) {
        throw new MissingRtFnsError(routeId, error?.message);
    }
}

/**
 * Gets reflection data for a raw middleFn. Raw middleFns receive raw request/response and
 * handle their own (de)serialization, so they carry no type info at all.
 */
export async function getRawMethodReflection(
    handler: Handler,
    routeId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    routerOptions: RouterOptions // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<MethodReflect> {
    return createRawMiddleFnReflection(isAsyncHandler(handler));
}

// ############ Binary serialization ############

const binaryWarned = getOrCreateGlobal('mion.reflection.binaryWarned', () => new Set<string>());

/**
 * Checks binary (de)serialization fns for a middleFn in a binary route's execution chain.
 * Since the ts-runtypes migration tb/fb are compiled AT BUILD TIME per call site; a type
 * that is not binary-serializable (e.g. the mion metadata middleFn's union, which always
 * forces stringifyJson responses anyway) simply has no entries. That is a WARNING, not an
 * error: the wire already degrades safely — serializeBinaryBody skips methods without
 * toBinary, and deserializeBinaryBody throws a clear error only if a binary body actually
 * carries the method's key.
 */
export async function ensureBinaryJitFns(method: MiddleFnMethod | HeadersMethod): Promise<void> {
    const missing: string[] = [];
    const hasParams = !method.paramsJitFns.isType.isNoop;
    if (hasParams && !method.paramsJitFns.fromBinary) missing.push('params fromBinary');
    if (hasParams && !method.paramsJitFns.toBinary) missing.push('params toBinary');
    if (method.hasReturnData && !method.returnJitFns.toBinary) missing.push('return toBinary');
    if (method.hasReturnData && !method.returnJitFns.fromBinary) missing.push('return fromBinary');
    if (missing.length && !binaryWarned.has(method.id)) {
        binaryWarned.add(method.id);
        console.warn(
            `mion: middleFn "${method.id}" has no binary serialization fns (${missing.join(', ')}); ` +
                `its data will not ride binary bodies (type not binary-serializable, or built without mionVitePlugin).`
        );
    }
}
