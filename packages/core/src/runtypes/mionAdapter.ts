/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRunTypeId, RunTypeKind} from '@mionjs/run-types';
import {FAMILY_TAG_TO_FN_KEY, getRTFunction, getRTUtils} from '@mionjs/run-types/runtime';
import {getRunType} from '@mionjs/run-types';
import type {GetValidationErrorsFn, InjectRunTypeId, RunType, ValidateFn} from '@mionjs/run-types';
import type {FnHashKey} from '@mionjs/run-types/runtime';
import {buildPureFnFactoryFromCode} from '@mionjs/run-types/runtime';
import {getJitFnHashes} from '../routerUtils.ts';
import {PARSE_MODES, type ParseModeRow} from '../constants.ts';
import type {
  AnyFn,
  MionTypeFn,
  CompiledFnData,
  JitCompiledFunctions,
  JitFunctionsHashes,
  JsonEncodeFn,
  ParserStrategy,
  PureFnsDataCache,
} from '../types/general.types.ts';
import type {CompiledPureFunction} from '../types/pureFunctions.types.ts';

// ############# mion <-> mion adapter #############
// The helpers createMionRouter returns declare trailing mion injection markers that the @mionjs/devtools vite
// plugin fills at build time. This module turns those payloads into the JitCompiledFunctions / reflection
// shapes the router already consumes, so dispatch and serialization code stay untouched.

/** The VOCABULARY of fn keys a route marker may name; the helpers pick which ones each call requests from its
 *  `parser`. Order is irrelevant, the payload is projected by fn key.
 *  ⚠️ Helper signatures must spell the marker out as InjectTypeFnArgs<T, 'validate', …>: the scanner does not
 *  recognize a local alias over it (verified 2026-07-11). */
export const MION_FN_KEYS = [
  'validate',
  'validationErrors',
  // One validate pair per parser strategy; PARSE_MODES picks which pair a route requests.
  'validateUnionKeys',
  'validationErrorsUnionKeys',
  'validateStrict',
  'validationErrorsStrict',
  'formatTransform',
  'prepareForJsonClone',
  'prepareForJsonMutate',
  'compactForJson',
  'restoreFromJsonMutate',
  'restoreFromJsonClone',
  'compactFromJson',
] as const satisfies readonly FnHashKey[];

/** Projects the injected payload onto the fn keys a marker names. A compiled entry carries the SHORT family tag
 *  at slot 0 (`CompiledFnData.familyTag`) while a marker names the readable key, so the tag is translated back
 *  through the generated map. No positional contract: the array is only as long as the families the strategy asked for. */
function byFnKey(injected: unknown[]): Partial<Record<FnHashKey, unknown>> {
  const out: Record<string, unknown> = {};
  for (const tuple of injected) {
    if (!Array.isArray(tuple)) continue;
    const tag = tuple[0];
    if (typeof tag !== 'string') continue;
    // An unmapped tag is a composite (jeCL, jdCL, …) or build skew, kept as-is so the checks below report it.
    out[FAMILY_TAG_TO_FN_KEY[tag as keyof typeof FAMILY_TAG_TO_FN_KEY] ?? tag] = tuple;
  }
  return out as Partial<Record<FnHashKey, unknown>>;
}

/** Injected marker payloads stashed on a route/middleware definition by the factory helpers. */
export interface RtMarkerPayload {
  paramsFns?: unknown;
  returnFns?: unknown;
  paramsId?: string;
  returnId?: string;
  /** Id of a build-time `true`/`false` literal: whether the handler answers with a promise.
   *  `returnId` is the AWAITED type, so it cannot answer this. */
  isAsyncId?: string;
  /** headers middlewares only: fns + id for the handler's HeadersSubset param */
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
  /** Parameter names from reflection, '' for an unlabelled tuple member. Rides the client
   *  methods-metadata payload so a client can name the parameter that failed. */
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
const noErrors: GetValidationErrorsFn = () => [];

// ############# serialized cache restore (client metadata lane) #############

/** Registers serialized fn caches + pure fns (from server methods-metadata payloads) into the mion runtime
 *  cache. Fns materialize lazily from their code strings; entries already present are never overwritten. */
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
      // alwaysThrow entries carry no code, only a throwing factory built from the build-time diagnostic.
      // Without rebuilding it materializeRTFn bails and the call site gets "fn is not a function" instead.
      alwaysThrowMessage: data.alwaysThrowMessage,
      createRTFn: data.alwaysThrowMessage !== undefined ? utl.alwaysThrowFactory(data.alwaysThrowMessage) : undefined,
    } as never);
  }
  for (const [id, pureFnData] of Object.entries(pureFnDeps)) {
    if (utl.hasPureFnByKey(id)) continue;
    // paramNames are the AUTHOR's own factory parameter names, recorded verbatim at build time:
    // hardcoding 'utl' would make any factory written as `(rtu) => ...` ReferenceError on first call.
    utl.addPureFn(id, {
      ...pureFnData,
      createPureFn: buildPureFnFactoryFromCode(pureFnData.paramNames, pureFnData.code),
    } as never);
  }
}

// resetJitFnCaches moved to @mionjs/core/testing: a shipped client must not carry a cache reset.

/** Reads the compiled pure fn an id names, for wire serialization. The UNTRACKED lookup, not
 *  `getCompiledPureFn`, which needs a branded id readable at build time; this id comes off a compiled entry. */
export function resolveCompiledPureFn(id: string): CompiledPureFunction | undefined {
  return getRTUtils().getCompiledPureFnByKey(id);
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

// No row matches a payload from a different build, so version skew fails closed here rather than at call time.
// `mutate` and `mutateStrict` share an encoder and a decoder, so only the whole row tells their validators apart.
/** The strategy a fn set was compiled for: the ONE PARSE_MODES row whose encoder, decoder and validator are present. */
function strategyFromFamilies(fns: Partial<Record<FnHashKey, unknown>>, label: string): ParserStrategy {
  const matched = (Object.keys(PARSE_MODES) as ParserStrategy[]).filter((strategy) => {
    const row: ParseModeRow = PARSE_MODES[strategy];
    return fns[row.encode] !== undefined && fns[row.decode] !== undefined && fns[row.validate] !== undefined;
  });
  if (matched.length !== 1)
    throw new Error(
      `RunTypes: the compiled-fn payload for '${label}' matches ${matched.length} parser strategies ` +
        `(got [${Object.keys(fns).join(', ')}]${matched.length ? `, matched [${matched.join(', ')}]` : ''}). ` +
        `Rebuild with a matching @mionjs/devtools + RunTypes version.`
    );
  return matched[0];
}

/** Builds mion JitCompiledFunctions from one injected marker payload: the validators and ONE json
 *  pair. Throws when the marker was never injected. */
export function buildJitFnsFromMarker(injected: unknown, typeId: string, label: string): JitCompiledFunctions {
  if (!isInjectedFnsArray(injected))
    throw new Error(
      `RunTypes: no compiled type functions injected for '${label}'. ` +
        `The @mionjs/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active at build time.`
    );
  const fns = byFnKey(injected);
  // FAIL CLOSED on a partial payload: a present-but-short array means plugin/marker version
  // skew — falling back would silently DISABLE validation/serialization for this method.
  const strategy = strategyFromFamilies(fns, label);
  const row: ParseModeRow = PARSE_MODES[strategy];
  if (fns[row.validationErrors] === undefined)
    throw new Error(
      `RunTypes: incomplete compiled-fn payload for '${label}' (got ${injected.length} entries; ${strategy} ` +
        `needs ${row.validationErrors} beside ${row.validate}). ` +
        `Rebuild with a matching @mionjs/devtools + RunTypes version.`
    );
  const isType = getRTFunction<'validate'>(fns[row.validate], alwaysTrue);
  const typeErrors = getRTFunction<'validationErrors'>(fns[row.validationErrors], noErrors);
  const encode = getRTFunction<'prepareForJsonMutate'>(fns[row.encode], identity as JsonEncodeFn);
  const decode = getRTFunction<'restoreFromJsonMutate'>(fns[row.decode], identity as never);
  // formatTransform (sanitizeParams) follows the same rule: a real, non-noop entry or nothing
  if (fns.formatTransform !== undefined) getRTFunction<'formatTransform'>(fns.formatTransform);
  // getRTFunction initialized the injected tuples, so the full entries are now
  // resolvable from the mion cache under `<fnHashPrefix>_<typeId>`.
  const hashes: JitFunctionsHashes = getJitFnHashes(typeId, strategy);
  const utl = getRTUtils();
  const formatTransformEntry = hashes.formatTransform ? utl.getRT(hashes.formatTransform) : undefined;
  return {
    isType: resolveFn(isType as AnyFn, 'isType', label, hashes.isType),
    typeErrors: resolveFn(typeErrors as AnyFn, 'typeErrors', label, hashes.typeErrors) as JitCompiledFunctions['typeErrors'],
    json: {
      strategy,
      encode: resolveFn(encode as AnyFn, row.encode, label, hashes.encode),
      decode: resolveFn(decode as AnyFn, row.decode, label, hashes.decode),
    },
    ...(formatTransformEntry && !formatTransformEntry.isNoop ? {formatTransform: formatTransformEntry} : {}),
  } as JitCompiledFunctions;
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

/** Arity comes from the params tuple runtype (HandlerParams<H> / HeaderHandlerParams<H> are always tuples),
 *  which is build-time-known and transpile-stable. The client gates pre-validation and param serialization on arity > 0. */
export function getParamCountFromRunType(paramsRunType: RunType<unknown>): number {
  return getParamsFromRunType(paramsRunType).length;
}

/** Handler parameters read from the params tuple runtype: member LABELS survive into the run-type graph, so
 *  names never come from parsing handler.toString(), which is unreliable under minified bundles.
 *  `name` is undefined for an unlabelled member (`[string, number]` rather than `[pet: Pet, notes?: string]`). */
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

/** Builds the full mion method reflection from the marker payload stashed on a route/middleware definition. */
export function getReflectionFromMarkers(
  rtFns: RtMarkerPayload | undefined,
  handler: AnyFn,
  methodId: string
): RtMethodReflection {
  if (!rtFns)
    throw new Error(
      `RunTypes: route/middleware '${methodId}' has no injected type information. ` +
        `Handlers must be declared through the helpers createMionRouter returns (mion.route() / mion.middleware()) ` +
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
  // the size maxima sit on the reflection ROOT rows the markers already inject: one property read, no walk
  if (typeof paramsRunType?.jsonMaxBytes === 'number') reflection.paramsJsonMaxBytes = paramsRunType.jsonMaxBytes;
  // any handler returning a HeadersSubset (directly or in a union) sets response headers, so the declared
  // names + validation fns are exposed for dispatch to apply and validate
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

// ############# headers middlewares #############

/** Node shape used while walking the runtype graph for header names. */
interface RtNodeLike {
  kind?: unknown;
  typeName?: unknown;
  name?: unknown;
  optional?: unknown;
  child?: RtNodeLike;
  children?: RtNodeLike[];
}

/** The declared header names of a HeadersSubset<Required, Optional> runtype: class node -> 'headers' property ->
 *  one object prop per header name. A union is searched for a HeadersSubset member; undefined when there is none. */
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

/** Builds the isType/typeErrors pair from a 2-key ('validate','validationErrors') HeadersSubset marker payload. */
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
  const fns = byFnKey(injected);
  // fail closed on partial payloads (see buildJitFnsFromMarker)
  if (fns.validate === undefined || fns.validationErrors === undefined)
    throw new Error(
      `RunTypes: incomplete compiled-fn payload for '${label}' (val/verr required). ` +
        `Rebuild with a matching @mionjs/devtools + RunTypes version.`
    );
  const isType = getRTFunction<'validate'>(fns.validate, alwaysTrue);
  const typeErrors = getRTFunction<'validationErrors'>(fns.validationErrors, noErrors);
  const hashes: JitFunctionsHashes = getJitFnHashes(typeId, 'mutate');
  return {
    isType: resolveFn(isType as AnyFn, 'isType', label, hashes.isType),
    typeErrors: resolveFn(typeErrors as AnyFn, 'typeErrors', label, hashes.typeErrors) as JitCompiledFunctions['typeErrors'],
  };
}

/** Headers middleware reflection: the shared one plus headersParam; headersReturn already rides the shared call. */
export function getHeadersReflectionFromMarkers(
  rtFns: RtMarkerPayload | undefined,
  handler: AnyFn,
  methodId: string
): RtMethodReflection {
  if (!rtFns || rtFns.headersId === undefined)
    throw new Error(
      `RunTypes: headers middleware '${methodId}' has no injected header type information. ` +
        `Handlers must be declared through the mion.headersFn() helper createMionRouter returns (2nd param a HeadersSubset) ` +
        `and built with mionVitePlugin active.`
    );
  const headersTypeId = resolveInjectedTypeId(rtFns.headersId, `${methodId}#headers`);
  const headersRunType = resolveInjectedRunType(rtFns.headersId);
  const headerNames = getHeaderNamesFromRunType(headersRunType);
  if (!headerNames)
    throw new Error(
      `RunTypes: headers middleware '${methodId}' must declare its 2nd param as HeadersSubset<Required, Optional>.`
    );
  // `paramsId` holds HeaderHandlerParams<H>, so the shared paramsCount is already the body arity
  const reflection = getReflectionFromMarkers(rtFns, handler, methodId);
  reflection.headersParam = {
    headerNames,
    jitHash: headersTypeId,
    jitFns: buildHeaderJitFnsFromMarker(rtFns.headersFns, headersTypeId, `${methodId}#headers`),
  };
  return reflection;
}
