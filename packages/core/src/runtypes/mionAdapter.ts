/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTFnCaches, getRTFunction, getRTUtils, getRunType, getRunTypeId, RunTypeKind} from '@ts-runtypes/core';
import type {
    GetValidationErrorsFn,
    InjectRunTypeId,
    PrepareForJsonFn,
    RestoreFromJsonFn,
    RunType,
    StringifyJsonFn,
    ValidateFn,
} from '@ts-runtypes/core';
import {getJitFnHashes} from '../routerUtils.ts';
import type {
    AnyFn,
    JitCompiledFn,
    JitCompiledFnData,
    JitCompiledFunctions,
    JitFunctionsHashes,
    PureFnsDataCache,
} from '../types/general.types.ts';
import {getRtEntry, toJitCompiledFn, wrapRtEntry} from './rtResolver.ts';

// ############# mion <-> ts-runtypes adapter #############
// mion's route()/middleFn() factories declare trailing ts-runtypes injection markers;
// the @ts-runtypes/devtools vite plugin fills them at build time. This module turns
// those injected payloads into the JitCompiledFunctions/reflection shapes the router
// already consumes, so dispatch and serialization code stay untouched.

/** fn keys requested per marker side, IN ORDER. Keep in sync with the markers declared in router lib/handlers.ts.
 *  ⚠️ The markers in factory signatures MUST be spelled as InjectTypeFnArgs<T, 'val', 'verr', 'pj', 'rj', 'sj'> —
 *  a local type alias over the marker is NOT recognized by the ts-runtypes scanner (verified 2026-07-11). */
export const MION_FN_KEYS = ['val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'] as const;

/** fn keys requested for the HeadersSubset marker side (validation only, no serialization). */
export const MION_HEADER_FN_KEYS = ['val', 'verr'] as const;

/** Injected marker payloads stashed on a route/middleFn definition by the factory helpers. */
export interface RtMarkerPayload {
    paramsFns?: unknown;
    returnFns?: unknown;
    paramsId?: string;
    returnId?: string;
    /** headers middleFns only: fns + id for the handler's HeadersSubset param */
    headersFns?: unknown;
    headersId?: string;
}

/** Header validation fns + metadata derived from a HeadersSubset marker/runtype. */
export interface RtHeadersReflection {
    headerNames: string[];
    jitHash: string;
    jitFns: Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;
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
    headersParam?: RtHeadersReflection;
    headersReturn?: RtHeadersReflection;
}

const identity = (value: unknown) => value;
const alwaysTrue = (() => true) as unknown as ValidateFn;
const alwaysFalse = () => false;
const noErrors: GetValidationErrorsFn = () => [];
const noUnknownKeyErrors = () => [];
const nativeStringify: StringifyJsonFn = (value: unknown) => JSON.stringify(value);

// ############# serialized cache restore (client metadata lane) #############

/**
 * Registers serialized fn caches + pure fns (from server methods-metadata payloads) into
 * the ts-runtypes runtime cache. Fns materialize lazily from their code strings on first
 * lookup; entries already present (e.g. build-injected) are never overwritten.
 */
export function addSerializedJitCaches(deps: Record<string, JitCompiledFnData>, pureFnDeps: PureFnsDataCache): void {
    const utl = getRTUtils();
    for (const [rtFnHash, data] of Object.entries(deps)) {
        if (utl.hasRTFn(rtFnHash)) continue;
        utl.addToRTCache({
            typeName: data.typeName,
            familyTag: data.fnID,
            rtFnHash,
            args: data.args,
            defaultParamValues: data.defaultParamValues,
            isNoop: data.isNoop,
            code: data.code,
            rtDependencies: data.jitDependencies,
            pureFnDependencies: data.pureFnDependencies,
            ...(data.paramNames ? {paramNames: [...data.paramNames]} : {}),
        } as never);
    }
    for (const [namespace, fns] of Object.entries(pureFnDeps)) {
        for (const [fnName, pureFnData] of Object.entries(fns)) {
            const key = `${namespace}::${fnName}`;
            if (utl.hasPureFnByKey(key)) continue;
            utl.addPureFn(key, {
                ...pureFnData,
                createPureFn: (rtu: unknown) => new Function('utl', `'use strict'; ${pureFnData.code}`)(rtu),
            } as never);
        }
    }
}

/**
 * Clears every compiled fn from the ts-runtypes cache. Tests only (simulates a fresh
 * client): build-injected entries re-register from their tuples on next use; runtime
 * pure-fn/format registrations are left in place.
 */
export function resetJitFnCaches(): void {
    const utl = getRTUtils();
    const cache = getRTFnCaches().rtFnsCache as Record<string, {rtFnHash: string} | undefined>;
    for (const entry of Object.values(cache)) {
        if (entry) utl.removeFromRTCache(entry as never);
    }
}

/** True when the injected value looks like the multi-key marker payload (array of entry tuples). */
function isInjectedFnsArray(injected: unknown): injected is unknown[] {
    return Array.isArray(injected);
}

/** Wraps one resolved fn, preferring the full ts-runtypes cache entry (real code/isNoop/deps) when present. */
function wrapResolvedFn<Fn extends AnyFn>(fn: Fn, fnID: string, label: string, rtFnHash: string): JitCompiledFn<Fn> {
    const entry = getRtEntry(rtFnHash);
    if (entry) return wrapRtEntry<Fn>(entry, fnID);
    return toJitCompiledFn(fn, fnID, label, rtFnHash);
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
    const [valT, verrT, pjT, rjT, sjT, hukT, ukeT, tbT, fbT] = injected;
    // FAIL CLOSED on a partial payload: a present-but-short array means plugin/marker version
    // skew — falling back would silently DISABLE validation/serialization for this method.
    // Only the trailing huk/uke/tb/fb entries are genuinely optional.
    if (valT === undefined || verrT === undefined || pjT === undefined || rjT === undefined || sjT === undefined)
        throw new Error(
            `mion run-types: incomplete compiled-fn payload for '${label}' (got ${injected.length} entries; ` +
                `val/verr/pj/rj/sj are required). Rebuild with a matching @mionjs/devtools + @ts-runtypes version.`
        );
    const isType = getRTFunction<'val'>(valT, alwaysTrue);
    const typeErrors = getRTFunction<'verr'>(verrT, noErrors);
    const prepareForJson = getRTFunction<'pj'>(pjT, identity as PrepareForJsonFn);
    const restoreFromJson = getRTFunction<'rj'>(rjT, identity as RestoreFromJsonFn);
    const stringifyJson = getRTFunction<'sj'>(sjT, nativeStringify);
    const hasUnknownKeys = getRTFunction<'huk'>(hukT, alwaysFalse);
    const unknownKeyErrors = getRTFunction<'uke'>(ukeT, noUnknownKeyErrors);
    // initialize the binary tuples (if requested) so their entries land in the cache;
    // toBinary/fromBinary are only exposed when a REAL entry exists — an identity
    // fallback would silently corrupt binary streams
    if (tbT !== undefined) getRTFunction<'tb'>(tbT);
    if (fbT !== undefined) getRTFunction<'fb'>(fbT);
    // getRTFunction initialized the injected tuples, so the full entries are now
    // resolvable from the ts-runtypes cache under `<fnHashPrefix>_<typeId>`.
    const hashes: JitFunctionsHashes = getJitFnHashes(typeId, true);
    const toBinaryEntry = hashes.toBinary ? getRtEntry(hashes.toBinary) : undefined;
    const fromBinaryEntry = hashes.fromBinary ? getRtEntry(hashes.fromBinary) : undefined;
    return {
        isType: wrapResolvedFn(isType as AnyFn, 'isType', label, hashes.isType),
        typeErrors: wrapResolvedFn(
            typeErrors as AnyFn,
            'typeErrors',
            label,
            hashes.typeErrors
        ) as JitCompiledFunctions['typeErrors'],
        prepareForJson: wrapResolvedFn(prepareForJson as AnyFn, 'prepareForJson', label, hashes.prepareForJson),
        restoreFromJson: wrapResolvedFn(restoreFromJson as AnyFn, 'restoreFromJson', label, hashes.restoreFromJson),
        stringifyJson: wrapResolvedFn(stringifyJson as AnyFn, 'stringifyJson', label, hashes.stringifyJson),
        hasUnknownKeys: wrapResolvedFn(hasUnknownKeys as AnyFn, 'hasUnknownKeys', label, hashes.hasUnknownKeys ?? ''),
        unknownKeyErrors: wrapResolvedFn(unknownKeyErrors as AnyFn, 'unknownKeyErrors', label, hashes.unknownKeyErrors ?? ''),
        ...(toBinaryEntry ? {toBinary: wrapRtEntry(toBinaryEntry, 'toBinary')} : {}),
        ...(fromBinaryEntry ? {fromBinary: wrapRtEntry(fromBinaryEntry, 'fromBinary')} : {}),
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

// ############# param names #############
// ⚠️ paramNames DISPLAY strings come from the HANDLER SOURCE, not the runtype graph: ts-runtypes
// dedupes types structurally and tuple labels are NOT part of the structural id, so the canonical
// node for `[s: string]` may carry the labels of whichever call site got interned first (e.g.
// `[name: string]`). Parsing the function source gives the exact declared names. The param COUNT,
// however, is taken from the params tuple runtype (getParamCountFromRunType) and reconciled in —
// see R34: minified server bundles degrade the parsed names and an empty parse used to silently
// disable client-side pre-validation + param serialization (both early-return on length === 0).

/** Extracts declared parameter names from a handler's source, skipping the leading context param. */
export function getParamNamesFromHandler(handler: AnyFn, skipParams = 1): string[] {
    const src = handler.toString();
    const params = splitParamList(extractParamList(src));
    return params.slice(skipParams).map((param, index) => {
        const name = paramName(param);
        return name ?? `param${index}`;
    });
}

/**
 * R34 — the AUTHORITATIVE param arity comes from the params tuple runtype (HandlerParams<H> /
 * HeaderHandlerParams<H> are always tuples), which is build-time-known and transpile-stable.
 * Source parsing (handler.toString()) only supplies display names and degrades under minified
 * server bundles: an empty parse used to silently disable client-side pre-validation and param
 * serialization (both early-return on paramNames.length === 0). Counting tuple members closes that.
 */
export function getParamCountFromRunType(paramsRunType: RunType<unknown>): number {
    const root = paramsRunType as RtNodeLike;
    return root.kind === RunTypeKind.tuple ? (root.children?.length ?? 0) : 0;
}

/**
 * Reconciles source-parsed param names against the runtype arity so paramNames.length always
 * equals the real param count. Parsed names fill display slots; missing slots (degraded source)
 * fall back to positional `param{i}` markers instead of vanishing.
 */
export function reconcileParamNames(sourceNames: string[], arity: number): string[] {
    if (sourceNames.length === arity) return sourceNames;
    const names: string[] = [];
    for (let i = 0; i < arity; i++) names.push(sourceNames[i] ?? `param${i}`);
    return names;
}

/** Returns the raw text between the param parens (or the bare identifier of a paren-less arrow). */
function extractParamList(src: string): string {
    const noComments = src.replace(/\/\*[^]*?\*\//g, ' ');
    const start = noComments.search(/\(/);
    const arrow = noComments.indexOf('=>');
    // paren-less single-param arrow: `ctx => ...` / `async ctx => ...`
    if (arrow !== -1 && (start === -1 || start > arrow)) {
        const head = noComments
            .slice(0, arrow)
            .replace(/^async\b/, '')
            .trim();
        return head;
    }
    if (start === -1) return '';
    let depth = 0;
    for (let i = start; i < noComments.length; i++) {
        const ch = noComments[i];
        if (ch === '(') depth++;
        else if (ch === ')') {
            depth--;
            if (depth === 0) return noComments.slice(start + 1, i);
        } else if (ch === "'" || ch === '"' || ch === '`') {
            i = skipString(noComments, i);
        }
    }
    return '';
}

/** Advances past a string literal starting at `start`, honoring escapes. */
function skipString(src: string, start: number): number {
    const quote = src[start];
    for (let i = start + 1; i < src.length; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === quote) return i;
    }
    return src.length;
}

/** Splits a param-list string on top-level commas (default values / destructuring stay intact). */
function splitParamList(list: string): string[] {
    if (!list.trim()) return [];
    const params: string[] = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < list.length; i++) {
        const ch = list[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === "'" || ch === '"' || ch === '`') {
            const end = skipString(list, i);
            current += list.slice(i, end + 1);
            i = end;
            continue;
        } else if (ch === ',' && depth === 0) {
            params.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) params.push(current);
    return params;
}

/** Resolves the declared name of one param text; undefined for destructuring patterns. */
function paramName(param: string): string | undefined {
    const head = param.trim().replace(/^\.\.\./, '');
    const match = /^([A-Za-z_$][\w$]*)\s*(?:=[^]*)?$/.exec(head);
    return match ? match[1] : undefined;
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
    const returnRunType = resolveInjectedRunType(rtFns.returnId);
    const paramsArity = getParamCountFromRunType(resolveInjectedRunType(rtFns.paramsId));
    const reflection: RtMethodReflection = {
        paramNames: reconcileParamNames(getParamNamesFromHandler(handler), paramsArity),
        paramsJitFns: buildJitFnsFromMarker(rtFns.paramsFns, paramsTypeId, `${methodId}#params`),
        returnJitFns: buildJitFnsFromMarker(rtFns.returnFns, returnTypeId, `${methodId}#return`),
        paramsJitHash: paramsTypeId,
        returnJitHash: returnTypeId,
        hasReturnData: runTypeHasData(returnRunType),
        isAsync: isAsyncHandler(handler),
    };
    // any handler returning a HeadersSubset (directly or in a union) sets response headers:
    // expose the declared names + validation fns so dispatch can apply/validate them
    const returnHeaderNames = getHeaderNamesFromRunType(returnRunType);
    if (returnHeaderNames) {
        reflection.headersReturn = {
            headerNames: returnHeaderNames,
            jitHash: returnTypeId,
            jitFns: {isType: reflection.returnJitFns.isType, typeErrors: reflection.returnJitFns.typeErrors},
        };
    }
    return reflection;
}

// ############# headers middleFns #############

/** Node shape used while walking the runtype graph for header names. */
interface RtNodeLike {
    kind?: unknown;
    typeName?: unknown;
    name?: unknown;
    optional?: unknown;
    child?: RtNodeLike;
    children?: RtNodeLike[];
}

/**
 * Extracts the declared header names from a HeadersSubset<Required, Optional> runtype:
 * class node -> 'headers' property -> object literal props (one per header name).
 * Unions are searched for a HeadersSubset member (e.g. `HeadersSubset<'x'> | RpcError<...>`).
 * Returns undefined when the type contains no HeadersSubset class.
 */
export function getHeaderNamesFromRunType(runType: RunType<unknown>): string[] | undefined {
    const root = runType as RtNodeLike;
    if (root.kind === RunTypeKind.union) {
        for (const member of root.children ?? []) {
            const names = getHeaderNamesFromRunType(member as RunType<unknown>);
            if (names) return names;
        }
        return undefined;
    }
    if (root.kind !== RunTypeKind.class || root.typeName !== 'HeadersSubset') return undefined;
    const headersProp = root.children?.find((child) => child.name === 'headers');
    const propNodes = headersProp?.child?.children;
    if (!propNodes) return [];
    return propNodes.map((prop) => prop.name).filter((name): name is string => typeof name === 'string');
}

/** Builds the isType/typeErrors pair from a 2-key ('val','verr') HeadersSubset marker payload. */
export function buildHeaderJitFnsFromMarker(
    injected: unknown,
    typeId: string,
    label: string
): Pick<JitCompiledFunctions, 'isType' | 'typeErrors'> {
    if (!isInjectedFnsArray(injected))
        throw new Error(
            `mion run-types: no compiled header type functions injected for '${label}'. ` +
                `The @ts-runtypes/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active at build time.`
        );
    const [valT, verrT] = injected;
    // fail closed on partial payloads (see buildJitFnsFromMarker)
    if (valT === undefined || verrT === undefined)
        throw new Error(
            `mion run-types: incomplete compiled-fn payload for '${label}' (val/verr required). ` +
                `Rebuild with a matching @mionjs/devtools + @ts-runtypes version.`
        );
    const isType = getRTFunction<'val'>(valT, alwaysTrue);
    const typeErrors = getRTFunction<'verr'>(verrT, noErrors);
    const hashes: JitFunctionsHashes = getJitFnHashes(typeId);
    return {
        isType: wrapResolvedFn(isType as AnyFn, 'isType', label, hashes.isType),
        typeErrors: wrapResolvedFn(
            typeErrors as AnyFn,
            'typeErrors',
            label,
            hashes.typeErrors
        ) as JitCompiledFunctions['typeErrors'],
    };
}

/**
 * Builds the mion method reflection for a headers middleFn: body params/return as usual,
 * plus headersParam (extracted from the HeadersSubset param) and headersReturn (when the
 * handler returns a HeadersSubset, its headers get written onto the response).
 */
export function getHeadersReflectionFromMarkers(
    rtFns: RtMarkerPayload | undefined,
    handler: AnyFn,
    methodId: string
): RtMethodReflection {
    if (!rtFns || rtFns.headersId === undefined)
        throw new Error(
            `mion run-types: headers middleFn '${methodId}' has no injected header type information. ` +
                `Handlers must be declared through the headersFn() factory (2nd param a HeadersSubset) ` +
                `and built with mionVitePlugin active.`
        );
    const headersTypeId = resolveInjectedTypeId(rtFns.headersId, `${methodId}#headers`);
    const headersRunType = resolveInjectedRunType(rtFns.headersId);
    const headerNames = getHeaderNamesFromRunType(headersRunType);
    if (!headerNames)
        throw new Error(
            `mion run-types: headers middleFn '${methodId}' must declare its 2nd param as HeadersSubset<Required, Optional>.`
        );
    const reflection = getReflectionFromMarkers(rtFns, handler, methodId);
    // skip ctx + headers params for display names; arity still comes from the params runtype (R34)
    const bodyArity = getParamCountFromRunType(resolveInjectedRunType(rtFns.paramsId));
    reflection.paramNames = reconcileParamNames(getParamNamesFromHandler(handler, 2), bodyArity);
    reflection.headersParam = {
        headerNames,
        jitHash: headersTypeId,
        jitFns: buildHeaderJitFnsFromMarker(rtFns.headersFns, headersTypeId, `${methodId}#headers`),
    };
    return reflection;
}
