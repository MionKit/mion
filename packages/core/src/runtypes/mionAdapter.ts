/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTFnCaches, getRTFunction, getRTUtils, getRunType, getRunTypeId, RunTypeKind} from '@mionjs/run-types';
import type {FnHashKey, GetValidationErrorsFn, InjectRunTypeId, RunType, ValidateFn} from '@mionjs/run-types';
import {buildPureFnFactoryFromCode} from '@mionjs/run-types';
import {getJitFnHashes} from '../routerUtils.ts';
import {DECODE_FAMILY_BY_STRATEGY, STRATEGY_BY_ENCODE_FAMILY, type DecodeFamily} from '../constants.ts';
import type {
  AnyFn,
  MionTypeFn,
  CompiledFnData,
  JitCompiledFunctions,
  JitFunctionsHashes,
  JsonEncodeFn,
  JsonStrategy,
  PureFnsDataCache,
} from '../types/general.types.ts';
import type {CompiledPureFunction} from '../types/pureFunctions.types.ts';

// ############# mion <-> mion adapter #############
// the helpers createMionRouter returns (mion.route() / mion.middleFn()) declare trailing mion injection markers;
// the @mionjs/devtools vite plugin fills them at build time. This module turns
// those injected payloads into the JitCompiledFunctions/reflection shapes the router
// already consumes, so dispatch and serialization code stay untouched.

/** The VOCABULARY of fn keys a route marker may name; the helpers compute which ones each call
 *  requests from its `encoder`. Order is irrelevant, the payload is projected by family tag.
 *  ⚠️ Markers must be spelled InjectTypeFnArgs<T, 'val', 'verr', …> in the helper signatures: a local
 *  alias over the marker is NOT recognized by the scanner (verified 2026-07-11). */
export const MION_FN_KEYS = [
  'val',
  'verr',
  'huk',
  'uke',
  'fmt',
  'pjs',
  'pj',
  'sj',
  'cj',
  'rj',
  'cjr',
] as const satisfies readonly FnHashKey[];

/** Projects the injected payload onto its family tags. Each entry tuple's slot 0 is the emitting
 *  family (`pj`, `cjr`, `sj`, …, the tag `CompiledFnData.familyTag` carries), so no positional
 *  contract is needed: the array is only as long as the families the strategy demanded. */
function byFamilyTag(injected: unknown[]): Partial<Record<FnHashKey, unknown>> {
  const out: Record<string, unknown> = {};
  for (const tuple of injected) {
    if (!Array.isArray(tuple)) continue;
    const tag = tuple[0];
    if (typeof tag === 'string') out[tag] = tuple;
  }
  return out as Partial<Record<FnHashKey, unknown>>;
}

/** Injected marker payloads stashed on a route/middleFn definition by the factory helpers. */
export interface RtMarkerPayload {
  paramsFns?: unknown;
  returnFns?: unknown;
  paramsId?: string;
  returnId?: string;
  /** build time: the id of a `true`/`false` literal saying whether the handler answers with a
   *  promise. `returnId` is the AWAITED type, so it cannot answer this. */
  isAsyncId?: string;
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
  /** Parameter names from reflection; '' for an unlabelled tuple member (a plain string, so the
   *  value rides the metadata wire untagged). Rides the client methods-metadata payload so a client
   *  can name the parameter that failed. */
  paramNames: string[];
  paramsJitFns: JitCompiledFunctions;
  returnJitFns: JitCompiledFunctions;
  paramsJitHash: string;
  returnJitHash: string;
  hasReturnData: boolean;
  isAsync: boolean;
  /** The build-time compact-JSON maximum of the params tuple / return value (see `jsonMaxBytes` on
   *  RunType); undefined when the type has an unbounded part. */
  paramsJsonMaxBytes?: number;
  headersParam?: RtHeadersReflection;
  headersReturn?: RtHeadersReflection;
}

const identity = (value: unknown) => value;
const alwaysTrue = (() => true) as unknown as ValidateFn;
const alwaysFalse = () => false;
const noErrors: GetValidationErrorsFn = () => [];
const noUnknownKeyErrors = () => [];

// ############# serialized cache restore (client metadata lane) #############

/**
 * Registers serialized fn caches + pure fns (from server methods-metadata payloads) into
 * the mion runtime cache. Fns materialize lazily from their code strings on first
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
 * Clears every compiled fn from the mion cache. Tests only (simulates a fresh
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

/** Fabricates an entry for a fn with no mion cache entry (marker present, tuple elided).
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

/** Resolves one fn, preferring the real mion cache entry (real code/isNoop/deps) when present. */
function resolveFn<Fn extends AnyFn>(fn: Fn, fnID: string, label: string, rtFnHash: string): MionTypeFn<Fn> {
  const entry = getRTUtils().getRT(rtFnHash);
  if (entry) return entry as MionTypeFn<Fn>;
  return fabricateEntry(fn, fnID, label, rtFnHash);
}

const ENCODE_FAMILIES = Object.keys(STRATEGY_BY_ENCODE_FAMILY) as (keyof typeof STRATEGY_BY_ENCODE_FAMILY)[];
const DECODE_FAMILIES = ['rj', 'cjr'] as const;
type CompiledJsonFamilies = {strategy: JsonStrategy; encodeFamily: (typeof ENCODE_FAMILIES)[number]; decodeFamily: DecodeFamily};

/** The JSON strategy a fn set was compiled for, read off its injected families: exactly one encode
 *  family and its matching decode family. Anything else is build / version skew and fails closed. */
function strategyFromFamilies(fns: Partial<Record<FnHashKey, unknown>>, label: string): CompiledJsonFamilies {
  const encodeFamilies = ENCODE_FAMILIES.filter((family) => fns[family] !== undefined);
  const decodeFamilies = DECODE_FAMILIES.filter((family) => fns[family] !== undefined);
  if (encodeFamilies.length !== 1 || decodeFamilies.length !== 1)
    throw new Error(
      `RunTypes: incomplete compiled-fn payload for '${label}' (expected exactly one JSON encode family and one decode ` +
        `family, got encode [${encodeFamilies.join(', ')}] decode [${decodeFamilies.join(', ')}]). ` +
        `Rebuild with a matching @mionjs/devtools + RunTypes version.`
    );
  const strategy = STRATEGY_BY_ENCODE_FAMILY[encodeFamilies[0]];
  if (DECODE_FAMILY_BY_STRATEGY[strategy] !== decodeFamilies[0])
    throw new Error(
      `RunTypes: mismatched JSON families for '${label}': encoder '${encodeFamilies[0]}' (${strategy}) needs decoder ` +
        `'${DECODE_FAMILY_BY_STRATEGY[strategy]}', got '${decodeFamilies[0]}'.`
    );
  return {strategy, encodeFamily: encodeFamilies[0], decodeFamily: decodeFamilies[0]};
}

/** Builds mion JitCompiledFunctions from one injected marker payload: the validators and ONE json
 *  pair. Throws when the marker was never injected. */
export function buildJitFnsFromMarker(injected: unknown, typeId: string, label: string): JitCompiledFunctions {
  if (!isInjectedFnsArray(injected))
    throw new Error(
      `RunTypes: no compiled type functions injected for '${label}'. ` +
        `The @mionjs/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active at build time.`
    );
  const fns = byFamilyTag(injected);
  // FAIL CLOSED on a partial payload: a present-but-short array means plugin/marker version
  // skew — falling back would silently DISABLE validation/serialization for this method.
  if (fns.val === undefined || fns.verr === undefined)
    throw new Error(
      `RunTypes: incomplete compiled-fn payload for '${label}' (got ${injected.length} entries; ` +
        `val/verr are required). Rebuild with a matching @mionjs/devtools + RunTypes version.`
    );
  const {strategy, encodeFamily, decodeFamily} = strategyFromFamilies(fns, label);
  const isType = getRTFunction<'val'>(fns.val, alwaysTrue);
  const typeErrors = getRTFunction<'verr'>(fns.verr, noErrors);
  const encode = getRTFunction<'pj'>(fns[encodeFamily], identity as JsonEncodeFn);
  const decode = getRTFunction<'rj'>(fns[decodeFamily], identity as never);
  // formatTransform (sanitizeParams) follows the same rule: a real, non-noop entry or nothing
  if (fns.fmt !== undefined) getRTFunction<'fmt'>(fns.fmt);
  // getRTFunction initialized the injected tuples, so the full entries are now
  // resolvable from the mion cache under `<fnHashPrefix>_<typeId>`.
  const hashes: JitFunctionsHashes = getJitFnHashes(typeId, strategy);
  const utl = getRTUtils();
  const formatTransformEntry = hashes.formatTransform ? utl.getRT(hashes.formatTransform) : undefined;
  return {
    isType: resolveFn(isType as AnyFn, 'isType', label, hashes.isType),
    typeErrors: resolveFn(typeErrors as AnyFn, 'typeErrors', label, hashes.typeErrors) as JitCompiledFunctions['typeErrors'],
    // The strictTypes pair is absent whenever the marker did not ask for it: on the answer side,
    // which nothing reads, and on a compact params wire, where no key name from the caller survives
    // the decode. Left OFF the set rather than stood in for, so both readers take their own
    // `!hasUnknownKeys` early return instead of calling a function that always answers false.
    ...unknownKeysEntries(fns, hashes, label),
    json: {
      strategy,
      encode: resolveFn(encode as AnyFn, encodeFamily, label, hashes.encode),
      decode: resolveFn(decode as AnyFn, decodeFamily, label, hashes.decode),
    },
    ...(formatTransformEntry && !formatTransformEntry.isNoop ? {formatTransform: formatTransformEntry} : {}),
  } as JitCompiledFunctions;
}

/** The strictTypes pair of a fn set, or nothing when the marker requested neither. */
function unknownKeysEntries(
  fns: Partial<Record<FnHashKey, unknown>>,
  hashes: JitFunctionsHashes,
  label: string
): Pick<JitCompiledFunctions, 'hasUnknownKeys' | 'unknownKeyErrors'> {
  if (fns.huk === undefined && fns.uke === undefined) return {};
  const hasUnknownKeys = getRTFunction<'huk'>(fns.huk, alwaysFalse);
  const unknownKeyErrors = getRTFunction<'uke'>(fns.uke, noUnknownKeyErrors);
  return {
    hasUnknownKeys: resolveFn(hasUnknownKeys as AnyFn, 'hasUnknownKeys', label, hashes.hasUnknownKeys ?? ''),
    unknownKeyErrors: resolveFn(unknownKeyErrors as AnyFn, 'unknownKeyErrors', label, hashes.unknownKeyErrors ?? ''),
  };
}

/** Registers the injected InjectRunTypeId handle and returns its stable type id string. */
export function resolveInjectedTypeId(idHandle: unknown, label: string): string {
  if (idHandle === undefined)
    throw new Error(
      `RunTypes: no type id injected for '${label}'. ` +
        `The @mionjs/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active at build time.`
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

/** Runtime-only async detection: true for an `async function`, false for anything else. It cannot
 *  see a plain function that returns a promise (`(ctx, id) => db.find(id)`), which is why the build
 *  injects the answer as well. Kept as the fallback for a handler with no injected marker. */
export function isAsyncHandler(handler: AnyFn): boolean {
  return handler.constructor?.name === 'AsyncFunction';
}

/** The build-time answer, read off the injected literal runtype. Falls back to the runtime check
 *  when the marker is absent, so a handler declared outside the helpers still resolves. */
function resolveIsAsync(isAsyncId: string | undefined, handler: AnyFn): boolean {
  if (isAsyncId) {
    const literal = resolveInjectedRunType(isAsyncId) as {kind?: unknown; literal?: unknown};
    if (literal?.kind === RunTypeKind.literal) return literal.literal === true;
  }
  return isAsyncHandler(handler);
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
      `RunTypes: route/middleFn '${methodId}' has no injected type information. ` +
        `Handlers must be declared through the helpers createMionRouter returns (mion.route() / mion.middleFn()) ` +
        `and built with mionVitePlugin active.`
    );
  const paramsTypeId = resolveInjectedTypeId(rtFns.paramsId, `${methodId}#params`);
  const returnTypeId = resolveInjectedTypeId(rtFns.returnId, `${methodId}#return`);
  const returnRunType = resolveInjectedRunType(rtFns.returnId);
  const paramsRunType = resolveInjectedRunType(rtFns.paramsId);
  const params = getParamsFromRunType(paramsRunType);
  const paramsArity = params.length;
  const paramsJitFns = buildJitFnsFromMarker(rtFns.paramsFns, paramsTypeId, `${methodId}#params`);
  const returnJitFns = buildJitFnsFromMarker(rtFns.returnFns, returnTypeId, `${methodId}#return`);
  const reflection: RtMethodReflection = {
    paramsCount: paramsArity,
    paramNames: params.map((param) => param.name ?? ''),
    paramsJitFns,
    returnJitFns,
    paramsJitHash: paramsTypeId,
    returnJitHash: returnTypeId,
    hasReturnData: runTypeHasData(returnRunType),
    isAsync: resolveIsAsync(rtFns.isAsyncId, handler),
  };
  // the size maxima ride the reflection ROOT rows the markers already inject, so this is one
  // property read per direction and no walk at runtime
  if (typeof paramsRunType?.jsonMaxBytes === 'number') reflection.paramsJsonMaxBytes = paramsRunType.jsonMaxBytes;
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
      `RunTypes: no compiled header type functions injected for '${label}'. ` +
        `The @mionjs/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active at build time.`
    );
  const fns = byFamilyTag(injected);
  // fail closed on partial payloads (see buildJitFnsFromMarker)
  if (fns.val === undefined || fns.verr === undefined)
    throw new Error(
      `RunTypes: incomplete compiled-fn payload for '${label}' (val/verr required). ` +
        `Rebuild with a matching @mionjs/devtools + RunTypes version.`
    );
  const isType = getRTFunction<'val'>(fns.val, alwaysTrue);
  const typeErrors = getRTFunction<'verr'>(fns.verr, noErrors);
  const hashes: JitFunctionsHashes = getJitFnHashes(typeId, 'mutate');
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
      `RunTypes: headers middleFn '${methodId}' has no injected header type information. ` +
        `Handlers must be declared through the mion.headersFn() helper createMionRouter returns (2nd param a HeadersSubset) ` +
        `and built with mionVitePlugin active.`
    );
  const headersTypeId = resolveInjectedTypeId(rtFns.headersId, `${methodId}#headers`);
  const headersRunType = resolveInjectedRunType(rtFns.headersId);
  const headerNames = getHeaderNamesFromRunType(headersRunType);
  if (!headerNames)
    throw new Error(`RunTypes: headers middleFn '${methodId}' must declare its 2nd param as HeadersSubset<Required, Optional>.`);
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
