/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTFnCaches, getRTFunction, getRTUtils, getRunType, getRunTypeId, RunTypeKind} from '@mionjs/run-types';
import type {
  FnHashKey,
  GetValidationErrorsFn,
  InjectRunTypeId,
  PrepareForJsonFn,
  RestoreFromJsonFn,
  RunType,
  StringifyJsonFn,
  ValidateFn,
} from '@mionjs/run-types';
import {buildPureFnFactoryFromCode} from '@mionjs/run-types';
import {getJitFnHashes} from '../routerUtils.ts';
import type {
  AnyFn,
  MionTypeFn,
  CompiledFnData,
  JitCompiledFunctions,
  JitFunctionsHashes,
  PureFnsDataCache,
} from '../types/general.types.ts';
import type {CompiledPureFunction} from '../types/pureFunctions.types.ts';

// ############# mion <-> ts-runtypes adapter #############
// mion's route()/middleFn() factories declare trailing ts-runtypes injection markers;
// the @ts-runtypes/devtools vite plugin fills them at build time. This module turns
// those injected payloads into the JitCompiledFunctions/reflection shapes the router
// already consumes, so dispatch and serialization code stay untouched.

/** fn keys requested per marker side, IN ORDER. Keep in sync with the markers declared in router lib/handlers.ts.
 *  ⚠️ The markers in factory signatures MUST be spelled as InjectTypeFnArgs<T, 'val', 'verr', 'pj', 'rj', 'sj'> —
 *  a local type alias over the marker is NOT recognized by the ts-runtypes scanner (verified 2026-07-11). */
export const MION_FN_KEYS = ['val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'] as const satisfies readonly FnHashKey[];

/** fn keys requested for the HeadersSubset marker side (validation only, no serialization). */
export const MION_HEADER_FN_KEYS = ['val', 'verr'] as const satisfies readonly FnHashKey[];

/** Projects the positional marker payload onto its fn keys. The resolver hands over an ARRAY, so
 *  something has to map slot -> key; doing it here makes the key lists above the single source of
 *  truth instead of a comment. Add a key to the list and the projection follows automatically. */
function byFnKey<Keys extends readonly FnHashKey[]>(injected: unknown[], keys: Keys): Partial<Record<Keys[number], unknown>> {
  const out: Record<string, unknown> = {};
  keys.forEach((key, index) => {
    if (injected[index] !== undefined) out[key] = injected[index];
  });
  return out as Partial<Record<Keys[number], unknown>>;
}

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
  paramsCount: number;
  /** Parameter names from reflection; an entry is undefined for an unlabelled tuple member.
   *  Rides the client methods-metadata payload so a client can name the parameter that failed. */
  paramNames: (string | undefined)[];
  paramsJitFns: JitCompiledFunctions;
  returnJitFns: JitCompiledFunctions;
  paramsJitHash: string;
  returnJitHash: string;
  hasReturnData: boolean;
  isAsync: boolean;
  /** Compile-time binary size estimates (bytes) for the params / return types, read from the `tb`
   *  entry tuples. Used to size a cold binary buffer to the type. SERVER-SIDE only — deliberately
   *  kept off the client methods-metadata payload (getSerializableMethod's explicit field list). */
  paramsBinarySizeEstimate?: number;
  returnBinarySizeEstimate?: number;
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
export function addSerializedJitCaches(deps: Record<string, CompiledFnData>, pureFnDeps: PureFnsDataCache): void {
  const utl = getRTUtils();
  for (const [rtFnHash, data] of Object.entries(deps)) {
    if (utl.hasRTFn(rtFnHash)) continue;
    utl.addToRTCache({
      typeName: data.typeName,
      fnID: data.fnID,
      familyTag: data.familyTag,
      rtFnHash,
      args: data.args,
      defaultParamValues: data.defaultParamValues,
      isNoop: data.isNoop,
      code: data.code,
      rtDependencies: data.rtDependencies,
      pureFnDependencies: data.pureFnDependencies,
      // alwaysThrow entries carry no code — only a throwing factory built from the build-time
      // diagnostic. Rebuild it, or materializeRTFn bails (no code, no factory) and the call
      // site gets a bare "fn is not a function" instead of the real message.
      alwaysThrowMessage: data.alwaysThrowMessage,
      createRTFn: data.alwaysThrowMessage !== undefined ? utl.alwaysThrowFactory(data.alwaysThrowMessage) : undefined,
    } as never);
  }
  for (const [namespace, fns] of Object.entries(pureFnDeps)) {
    for (const [fnName, pureFnData] of Object.entries(fns)) {
      const key = `${namespace}::${fnName}`;
      if (utl.hasPureFnByKey(key)) continue;
      // paramNames are the AUTHOR's own factory parameter names, recorded verbatim at build
      // time. Hardcoding 'utl' here would bind the single parameter under the wrong name and
      // any factory written as e.g. `(rtu) => ...` would ReferenceError on first call.
      utl.addPureFn(key, {
        ...pureFnData,
        createPureFn: buildPureFnFactoryFromCode(pureFnData.paramNames, pureFnData.code),
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

/** Reads the compiled pure fn behind `<namespace>::<name>` for wire serialization.
 *
 *  Reads the raw cache rather than `rtUtils.getCompiledPureFn` deliberately: that API takes a
 *  `CompTimeArgs<PureFnId>`, which the scanner requires to be a literal — the key here is built at
 *  runtime from a template expression, so every consumer build would emit CTA003. Upstream exposes
 *  untracked `getPureFnByKey`/`hasPureFnByKey` for exactly this wire-driven case but has no
 *  `getCompiledPureFnByKey` returning the full entry, which is what serialization needs.
 *  Worth an upstream request; until then this read is the only way. */
export function resolveCompiledPureFn(namespace: string, name: string): CompiledPureFunction | undefined {
  const cache = getRTFnCaches().pureFnsCache as Record<string, unknown>;
  return cache[`${namespace}::${name}`] as CompiledPureFunction | undefined;
}

/** True when the injected value looks like the multi-key marker payload (array of entry tuples). */
function isInjectedFnsArray(injected: unknown): injected is unknown[] {
  return Array.isArray(injected);
}

/** Fabricates an entry for a fn with no ts-runtypes cache entry (marker present, tuple elided).
 *  No upstream equivalent — upstream never needs to invent an entry, it always has one. */
function fabricateEntry<Fn extends AnyFn>(fn: Fn, fnID: string, typeName: string, rtFnHash: string): MionTypeFn<Fn> {
  return {
    typeName,
    fnID,
    rtFnHash,
    args: {vλl: 'v'},
    defaultParamValues: {vλl: 'v'},
    isNoop: false,
    code: '',
    createRTFn: () => fn,
    fn,
  };
}

/** Resolves one fn, preferring the real ts-runtypes cache entry (real code/isNoop/deps) when present. */
function resolveFn<Fn extends AnyFn>(fn: Fn, fnID: string, label: string, rtFnHash: string): MionTypeFn<Fn> {
  const entry = getRTUtils().getRT(rtFnHash);
  if (entry) return entry as MionTypeFn<Fn>;
  return fabricateEntry(fn, fnID, label, rtFnHash);
}

/**
 * Builds mion JitCompiledFunctions from one injected MionSideFns marker payload.
 * The payload is an array of entry tuples; byFnKey projects it onto MION_FN_KEYS.
 * Throws when the marker was never injected (plugin not active) unless allowMissing.
 */
export function buildJitFnsFromMarker(injected: unknown, typeId: string, label: string): JitCompiledFunctions {
  if (!isInjectedFnsArray(injected))
    throw new Error(
      `mion run-types: no compiled type functions injected for '${label}'. ` +
        `The @ts-runtypes/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active at build time.`
    );
  const fns = byFnKey(injected, MION_FN_KEYS);
  // FAIL CLOSED on a partial payload: a present-but-short array means plugin/marker version
  // skew — falling back would silently DISABLE validation/serialization for this method.
  // Only the trailing huk/uke/tb/fb entries are genuinely optional.
  if (fns.val === undefined || fns.verr === undefined || fns.pj === undefined || fns.rj === undefined || fns.sj === undefined)
    throw new Error(
      `mion run-types: incomplete compiled-fn payload for '${label}' (got ${injected.length} entries; ` +
        `val/verr/pj/rj/sj are required). Rebuild with a matching @mionjs/devtools + @ts-runtypes version.`
    );
  const isType = getRTFunction<'val'>(fns.val, alwaysTrue);
  const typeErrors = getRTFunction<'verr'>(fns.verr, noErrors);
  const prepareForJson = getRTFunction<'pj'>(fns.pj, identity as PrepareForJsonFn);
  const restoreFromJson = getRTFunction<'rj'>(fns.rj, identity as RestoreFromJsonFn);
  const stringifyJson = getRTFunction<'sj'>(fns.sj, nativeStringify);
  const hasUnknownKeys = getRTFunction<'huk'>(fns.huk, alwaysFalse);
  const unknownKeyErrors = getRTFunction<'uke'>(fns.uke, noUnknownKeyErrors);
  // initialize the binary tuples (if requested) so their entries land in the cache;
  // toBinary/fromBinary are only exposed when a REAL entry exists — an identity
  // fallback would silently corrupt binary streams
  if (fns.tb !== undefined) getRTFunction<'tb'>(fns.tb);
  if (fns.fb !== undefined) getRTFunction<'fb'>(fns.fb);
  // getRTFunction initialized the injected tuples, so the full entries are now
  // resolvable from the ts-runtypes cache under `<fnHashPrefix>_<typeId>`.
  const hashes: JitFunctionsHashes = getJitFnHashes(typeId, true);
  const utl = getRTUtils();
  const toBinaryEntry = hashes.toBinary ? utl.getRT(hashes.toBinary) : undefined;
  const fromBinaryEntry = hashes.fromBinary ? utl.getRT(hashes.fromBinary) : undefined;
  return {
    isType: resolveFn(isType as AnyFn, 'isType', label, hashes.isType),
    typeErrors: resolveFn(typeErrors as AnyFn, 'typeErrors', label, hashes.typeErrors) as JitCompiledFunctions['typeErrors'],
    prepareForJson: resolveFn(prepareForJson as AnyFn, 'prepareForJson', label, hashes.prepareForJson),
    restoreFromJson: resolveFn(restoreFromJson as AnyFn, 'restoreFromJson', label, hashes.restoreFromJson),
    stringifyJson: resolveFn(stringifyJson as AnyFn, 'stringifyJson', label, hashes.stringifyJson),
    hasUnknownKeys: resolveFn(hasUnknownKeys as AnyFn, 'hasUnknownKeys', label, hashes.hasUnknownKeys ?? ''),
    unknownKeyErrors: resolveFn(unknownKeyErrors as AnyFn, 'unknownKeyErrors', label, hashes.unknownKeyErrors ?? ''),
    ...(toBinaryEntry ? {toBinary: toBinaryEntry} : {}),
    ...(fromBinaryEntry ? {fromBinary: fromBinaryEntry} : {}),
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

// ############# param arity (from the params tuple runtype) #############

/**
 * R34 — the param arity comes from the params tuple runtype (HandlerParams<H> / HeaderHandlerParams<H>
 * are always tuples), which is build-time-known and transpile-stable. It is the ONLY param info mion
 * keeps: the client gates pre-validation + param serialization on arity > 0. Display param names were
 * dropped (they were unused, and the old handler.toString() parsing degraded under minified bundles).
 */
export function getParamCountFromRunType(paramsRunType: RunType<unknown>): number {
  return getParamsFromRunType(paramsRunType).length;
}

/** Handler parameters read straight from the params tuple runtype. Tuple member LABELS survive
 *  into the run-type graph, so names come from reflection — never from parsing handler.toString(),
 *  which is unreliable under minified bundles. `name` is undefined for an unlabelled tuple
 *  member (e.g. `[string, number]` rather than `[pet: Pet, notes?: string]`). */
export function getParamsFromRunType(paramsRunType: RunType<unknown>): {name?: string; optional?: boolean}[] {
  const root = paramsRunType as RtNodeLike;
  if (root.kind !== RunTypeKind.tuple) return [];
  return (root.children ?? []).map((child) => {
    const member = child as {name?: unknown; optional?: unknown};
    return {
      name: typeof member.name === 'string' ? member.name : undefined,
      optional: member.optional === true ? true : undefined,
    };
  });
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
  const params = getParamsFromRunType(resolveInjectedRunType(rtFns.paramsId));
  const paramsArity = params.length;
  const paramsJitFns = buildJitFnsFromMarker(rtFns.paramsFns, paramsTypeId, `${methodId}#params`);
  const returnJitFns = buildJitFnsFromMarker(rtFns.returnFns, returnTypeId, `${methodId}#return`);
  const reflection: RtMethodReflection = {
    paramsCount: paramsArity,
    paramNames: params.map((param) => param.name),
    paramsJitFns,
    returnJitFns,
    paramsJitHash: paramsTypeId,
    returnJitHash: returnTypeId,
    hasReturnData: runTypeHasData(returnRunType),
    isAsync: isAsyncHandler(handler),
    // Read off the registered cache entry: @mionjs/run-types 0.12.1 carries the compile-time
    // estimate on CompiledFnData, so this is a named field rather than a tuple slot index.
    paramsBinarySizeEstimate: paramsJitFns.toBinary?.binarySizeEstimate,
    returnBinarySizeEstimate: returnJitFns.toBinary?.binarySizeEstimate,
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
  const fns = byFnKey(injected, MION_HEADER_FN_KEYS);
  // fail closed on partial payloads (see buildJitFnsFromMarker)
  if (fns.val === undefined || fns.verr === undefined)
    throw new Error(
      `mion run-types: incomplete compiled-fn payload for '${label}' (val/verr required). ` +
        `Rebuild with a matching @mionjs/devtools + @ts-runtypes version.`
    );
  const isType = getRTFunction<'val'>(fns.val, alwaysTrue);
  const typeErrors = getRTFunction<'verr'>(fns.verr, noErrors);
  const hashes: JitFunctionsHashes = getJitFnHashes(typeId);
  return {
    isType: resolveFn(isType as AnyFn, 'isType', label, hashes.isType),
    typeErrors: resolveFn(typeErrors as AnyFn, 'typeErrors', label, hashes.typeErrors) as JitCompiledFunctions['typeErrors'],
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
  // arity comes from the params runtype (R34); display param names are no longer tracked
  const bodyArity = getParamCountFromRunType(resolveInjectedRunType(rtFns.paramsId));
  reflection.paramsCount = bodyArity;
  reflection.headersParam = {
    headerNames,
    jitHash: headersTypeId,
    jitFns: buildHeaderJitFnsFromMarker(rtFns.headersFns, headersTypeId, `${methodId}#headers`),
  };
  return reflection;
}
