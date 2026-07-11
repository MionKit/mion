/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTFunction, getRunType, getRunTypeId, RunTypeKind} from '@ts-runtypes/core';
import type {
    GetValidationErrorsFn,
    InjectRunTypeId,
    PrepareForJsonFn,
    RestoreFromJsonFn,
    RunType,
    StringifyJsonFn,
    ValidateFn,
} from '@ts-runtypes/core';
import type {AnyFn, JitCompiledFn, JitCompiledFunctions} from '@mionjs/core';

// ############# mion <-> ts-runtypes adapter #############
// mion's route()/middleFn() factories declare trailing ts-runtypes injection markers;
// the @ts-runtypes/devtools vite plugin fills them at build time. This module turns
// those injected payloads into the JitCompiledFunctions/reflection shapes the router
// already consumes, so dispatch and serialization code stay untouched.

/** fn keys requested per marker side, IN ORDER. Keep in sync with the markers declared in router lib/handlers.ts.
 *  ⚠️ The markers in factory signatures MUST be spelled as InjectTypeFnArgs<T, 'val', 'verr', 'pj', 'rj', 'sj'> —
 *  a local type alias over the marker is NOT recognized by the ts-runtypes scanner (verified 2026-07-11). */
export const MION_FN_KEYS = ['val', 'verr', 'pj', 'rj', 'sj'] as const;

/** Injected marker payloads stashed on a route/middleFn definition by the factory helpers. */
export interface RtMarkerPayload {
    paramsFns?: unknown;
    returnFns?: unknown;
    paramsId?: string;
    returnId?: string;
}

/** Reflection data derived exclusively from injected markers (no runtime type reflection). */
export interface RtMethodReflection {
    paramNames: string[];
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    paramsJitHash: string;
    returnJitHash: string;
    hasReturnData: boolean;
    isAsync: boolean;
}

const identity = (value: unknown) => value;
const alwaysTrue = (() => true) as unknown as ValidateFn;
const noErrors: GetValidationErrorsFn = () => [];
const nativeStringify: StringifyJsonFn = (value: unknown) => JSON.stringify(value);

/** Wraps a compiled ts-runtypes fn into the JitCompiledFn shape mion dispatch consumes (.fn/.isNoop reads). */
function toJitCompiledFn<Fn extends AnyFn>(fn: Fn, fnID: string, typeName: string, jitFnHash: string): JitCompiledFn<Fn> {
    return {
        typeName,
        fnID,
        jitFnHash,
        args: {vλl: 'v'},
        defaultParamValues: {vλl: 'v'},
        isNoop: false,
        code: '',
        createJitFn: () => fn,
        fn,
    };
}

/** True when the injected value looks like the multi-key marker payload (array of entry tuples). */
function isInjectedFnsArray(injected: unknown): injected is unknown[] {
    return Array.isArray(injected);
}

/**
 * Builds mion JitCompiledFunctions from one injected MionSideFns marker payload.
 * The payload is an array of entry tuples matching MION_FN_KEYS order.
 * Throws when the marker was never injected (plugin not active) unless allowMissing.
 */
export function buildJitFnsFromMarker(injected: unknown, typeId: string, label: string): JitCompiledFunctions {
    if (!isInjectedFnsArray(injected))
        throw new Error(
            `mion run-types: no compiled type functions injected for '${label}'. ` +
                `The @ts-runtypes/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active at build time.`
        );
    const [valT, verrT, pjT, rjT, sjT] = injected;
    const isType = getRTFunction<'val'>(valT, alwaysTrue);
    const typeErrors = getRTFunction<'verr'>(verrT, noErrors);
    const prepareForJson = getRTFunction<'pj'>(pjT, identity as PrepareForJsonFn);
    const restoreFromJson = getRTFunction<'rj'>(rjT, identity as RestoreFromJsonFn);
    const stringifyJson = getRTFunction<'sj'>(sjT, nativeStringify);
    return {
        isType: toJitCompiledFn(isType as AnyFn, 'isType', label, `val_${typeId}`),
        typeErrors: toJitCompiledFn(
            typeErrors as AnyFn,
            'typeErrors',
            label,
            `verr_${typeId}`
        ) as JitCompiledFunctions['typeErrors'],
        prepareForJson: toJitCompiledFn(prepareForJson as AnyFn, 'prepareForJson', label, `pj_${typeId}`),
        restoreFromJson: toJitCompiledFn(restoreFromJson as AnyFn, 'restoreFromJson', label, `rj_${typeId}`),
        stringifyJson: toJitCompiledFn(stringifyJson as AnyFn, 'stringifyJson', label, `sj_${typeId}`),
    } as JitCompiledFunctions;
}

/** Registers the injected InjectRunTypeId handle and returns its stable type id string. */
export function resolveInjectedTypeId(idHandle: unknown, label: string): string {
    if (idHandle === undefined)
        throw new Error(
            `mion run-types: no type id injected for '${label}'. ` +
                `The @ts-runtypes/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active at build time.`
        );
    return getRunTypeId<unknown>(undefined, idHandle as InjectRunTypeId<unknown>);
}

/** Returns the traversable RunType node for an injected InjectRunTypeId handle. */
export function resolveInjectedRunType(idHandle: unknown): RunType<unknown> {
    return getRunType<unknown>(undefined, idHandle as InjectRunTypeId<unknown>);
}

/** Extracts parameter names from a params-tuple RunType (labeled tuple members). */
export function getParamNamesFromRunType(paramsRunType: RunType<unknown>): string[] {
    const children = (paramsRunType as {children?: {name?: unknown}[]}).children;
    if (!children) return [];
    return children.map((member, index) => (typeof member.name === 'string' ? member.name : `param${index}`));
}

const NO_DATA_KINDS: unknown[] = [RunTypeKind.void, RunTypeKind.never, RunTypeKind.undefined];

/** True when a return RunType carries actual data (not void/never/undefined). */
export function runTypeHasData(returnRunType: RunType<unknown>): boolean {
    return !NO_DATA_KINDS.includes((returnRunType as {kind: unknown}).kind);
}

/** Detects async handlers. Sync functions returning promises are treated as sync (dispatch always awaits results). */
export function isAsyncHandler(handler: AnyFn): boolean {
    return handler.constructor?.name === 'AsyncFunction';
}

/**
 * Builds the full mion method reflection from the marker payload stashed on a route/middleFn definition.
 * This replaces the old runtime reflectFunction(handler) + JIT compilation pipeline.
 */
export function getReflectionFromMarkers(
    rtFns: RtMarkerPayload | undefined,
    handler: AnyFn,
    methodId: string
): RtMethodReflection {
    if (!rtFns)
        throw new Error(
            `mion run-types: route/middleFn '${methodId}' has no injected type information. ` +
                `Handlers must be declared through route()/middleFn() factories and built with mionVitePlugin active.`
        );
    const paramsTypeId = resolveInjectedTypeId(rtFns.paramsId, `${methodId}#params`);
    const returnTypeId = resolveInjectedTypeId(rtFns.returnId, `${methodId}#return`);
    const paramsRunType = resolveInjectedRunType(rtFns.paramsId);
    const returnRunType = resolveInjectedRunType(rtFns.returnId);
    return {
        paramNames: getParamNamesFromRunType(paramsRunType),
        paramsJitFns: buildJitFnsFromMarker(rtFns.paramsFns, paramsTypeId, `${methodId}#params`),
        returnJitFns: buildJitFnsFromMarker(rtFns.returnFns, returnTypeId, `${methodId}#return`),
        paramsJitHash: paramsTypeId,
        returnJitHash: returnTypeId,
        hasReturnData: runTypeHasData(returnRunType),
        isAsync: isAsyncHandler(handler),
    };
}
