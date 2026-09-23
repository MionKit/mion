/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  RpcError,
  FatalError,
  StatusCodes,
  HandlerType,
  getNoopJitFns,
  getOrCreateGlobal,
  getRoutePath,
  ROUTER_ITEM_SEPARATOR_CHAR,
  isRpcError,
  SerializerModes,
} from '@mionjs/core';
import {getInputMapper, hasInputMapper} from '@mionjs/core';
import type {BatchDefinition, BatchMapping} from '@mionjs/core';
import {getRouteExecutionChain, getPlatformRequestCap, getRouterOptions, startMiddlewares, endMiddlewares} from './router.ts';
import {getMethodCaller} from './dispatch.ts';
import {findMionQueryParam} from './lib/urlQuery.ts';
import {RouterOptions} from './types/general.ts';
import {MethodsExecutionChain, RemoteMethod} from './types/remoteMethods.ts';
import type {CallContext} from './types/context.ts';

// ############# BATCH REGISTRY #############
//
// A batch is several routes run in ONE request, with `inputFrom` mappings feeding one route's output
// into another's input on the server. The client build hashes each `batch([...])` call site's ordered
// route ids into an id and compiles the id → definition table into the server (the generated
// `.mion/rpc/batches.generated.js` calls replaceBatches), so a request carries only the id: nothing
// untrusted describes a chain, there is no shape to check and no count to cap. Batches are NOT routes:
// they live here apart from the route table, never looked up by path, and the merged chain is built
// once per id (once per tenant when a pathTransform reads the request) and kept on the entry.

export interface BatchEntry {
  readonly id: string;
  /** Route ids in call order */
  readonly routes: readonly string[];
  readonly mappings: readonly BatchMapping[];
  /** Merged chains keyed by the pathTransform-resolved paths ('' when there is no transform) */
  readonly chains: Map<string, MethodsExecutionChain>;
  /** The members' resolved limits plus the envelope, fixed when the first chain is built (see resolveBatchMaxBodySize) */
  maxBodySize?: number;
}

const batchesById = getOrCreateGlobal('mion.router.batchesById', () => new Map<string, BatchEntry>());
const mappingMethodCache = getOrCreateGlobal('mion.router.batchMappingMethodCache', () => new Map<string, RemoteMethod>());

/** A malformed definition is a configuration error and throws at registration, never at request time.
 *  Re-registering an id replaces it; ids not in `table` are left alone (replaceBatches is the whole-table form). */
export function registerBatches(table: Record<string, BatchDefinition>): void {
  for (const [id, definition] of Object.entries(table)) {
    assertValidBatchDefinition(id, definition);
    batchesById.set(id, {
      id,
      routes: [...definition.routes],
      mappings: definition.mappings ? definition.mappings.map((mapping) => ({...mapping})) : [],
      chains: new Map(),
    });
  }
}

/** Replaces the WHOLE table. What the generated `.mion/rpc/batches.generated.js` calls, so every
 *  evaluation of it leaves exactly that file's batches registered and nothing from before. */
export function replaceBatches(table: Record<string, BatchDefinition>): void {
  clearBatches();
  registerBatches(table);
}

/** The table is build-generated, so this only guards against a stale or hand-edited manifest. */
function assertValidBatchDefinition(id: string, definition: BatchDefinition): void {
  const invalid = (reason: string): never => {
    throw new Error(`[mion batches] batch '${id}' is malformed: ${reason}.`);
  };
  if (!id) invalid('empty id');
  if (!definition || typeof definition !== 'object') invalid('expected an object');
  if (!Array.isArray(definition.routes) || definition.routes.length === 0) invalid('`routes` must be a non-empty array');
  if (definition.routes.some((route) => typeof route !== 'string' || !route)) invalid('`routes` must be route ids');
  if (definition.mappings === undefined) return;
  if (!Array.isArray(definition.mappings)) invalid('`mappings` must be an array');
  for (const mapping of definition.mappings) {
    if (!mapping || typeof mapping !== 'object') invalid('every mapping must be an object');
    const {fromId, toId, mapperKey, paramIndex} = mapping;
    if (typeof fromId !== 'string' || typeof toId !== 'string' || typeof mapperKey !== 'string')
      invalid('mapping `fromId`, `toId` and `mapperKey` must be strings');
    if (!definition.routes.includes(fromId)) invalid(`mapping source '${fromId}' is not a route of the batch`);
    if (!definition.routes.includes(toId)) invalid(`mapping target '${toId}' is not a route of the batch`);
    // Integer + non-negative, so paramIndex can only ever be an array INDEX (never a property name
    // like '__proto__'); the upper bound needs the target's arity, checked while the chain is built.
    if (typeof paramIndex !== 'number' || !Number.isInteger(paramIndex) || paramIndex < 0)
      invalid('mapping `paramIndex` must be a non-negative integer');
  }
}

export function getBatch(id: string): BatchEntry | undefined {
  return batchesById.get(id);
}

/** Ids of every registered batch, for the metadata route. */
export function getBatchIds(): string[] {
  return [...batchesById.keys()];
}

/** Called by resetRouter and replaceBatches. */
export function clearBatches(): void {
  batchesById.clear();
  mappingMethodCache.clear();
}

/** The member routes' resolved limits (each already carries its factor and envelope, or the platform's
 *  number when its types cannot say) plus the outer braces, fixed the first time a chain is built. */
export function resolveBatchMaxBodySize(entry: BatchEntry, memberChains: MethodsExecutionChain[]): number {
  if (entry.maxBodySize === undefined) entry.maxBodySize = sumChainMaxBodySize(memberChains);
  return entry.maxBodySize;
}

function sumChainMaxBodySize(chains: MethodsExecutionChain[]): number {
  let total = 2;
  for (const chain of chains) total += chain.maxBodySize;
  return Math.min(total, getPlatformRequestCap() ?? Infinity);
}

/** The limits not yet settled read the platform ceiling when they are. */
export function capBatchBodySizes(maxRequestSize: number): void {
  for (const entry of batchesById.values()) {
    if (entry.maxBodySize !== undefined && entry.maxBodySize > maxRequestSize) entry.maxBodySize = maxRequestSize;
  }
}

/** Re-folds every ALREADY built chain from its entry's current number: without it a chain built before
 *  a later setPlatformConfig keeps serving a limit the platform has since promised to refuse. */
export function refreshBatchChainBodyLimits(platformMaxBodySize: number): void {
  for (const entry of batchesById.values()) {
    const limit = entry.maxBodySize ?? platformMaxBodySize;
    for (const chain of entry.chains.values()) {
      chain.declaredBodySize = entry.maxBodySize;
      chain.maxBodySize = limit;
    }
  }
}

/** The largest limit any registered batch resolves to, over the member routes' untransformed
 *  paths: what bun sizes its native server limit with (see getMaxRouteBodySize). */
export function getMaxBatchBodySize(): number {
  const opts = getRouterOptions();
  let largest = 0;
  for (const entry of batchesById.values()) {
    if (entry.maxBodySize !== undefined) {
      largest = Math.max(largest, entry.maxBodySize);
      continue;
    }
    const chains: MethodsExecutionChain[] = [];
    for (const routeId of entry.routes) {
      const chain = getRouteExecutionChain(getRoutePath(routeId.split(ROUTER_ITEM_SEPARATOR_CHAR), opts));
      if (chain) chains.push(chain);
    }
    largest = Math.max(largest, sumChainMaxBodySize(chains));
  }
  return largest;
}

// ############# REQUEST RESOLUTION #############

/** `id=<batchId>` is the only parameter the batch endpoint reads; missing or undecodable is an unknown id.
 *  The id is the one query value that IS percent-decoded, so it survives a `/` or a space in a route name. */
export function readBatchId(urlQuery: string | undefined): string | undefined {
  const rawId = findMionQueryParam(urlQuery, 'id');
  if (rawId === undefined) return undefined;
  try {
    return decodeURIComponent(rawId) || undefined;
  } catch {
    return undefined;
  }
}

/** Runs while the call context is acquired, BEFORE the body is read, so an unknown id costs nothing but
 *  a Map lookup: it answers undefined and the caller resolves the batch not-found chain.
 *  The id is the only untrusted input and it is never echoed back. */
export function getBatchExecutionChain(
  rawRequest: unknown,
  opts: RouterOptions,
  urlQuery?: string
): MethodsExecutionChain | undefined {
  const batchId = readBatchId(urlQuery);
  const entry = batchId ? getBatch(batchId) : undefined;
  if (!entry) return undefined;

  // pathTransform may read the request (a tenant header, the host), so with a transform the chains are
  // kept per resolved path list: the same id from two requests that resolve differently never shares a chain.
  const routePaths = entry.routes.map((routeId) => getRoutePath(routeId.split(ROUTER_ITEM_SEPARATOR_CHAR), opts));
  const transformedPaths = opts.pathTransform
    ? routePaths.map((routePath) => opts.pathTransform!(rawRequest, routePath) || routePath)
    : routePaths;
  const chainKey = opts.pathTransform ? transformedPaths.join(',') : '';
  let executionChain = entry.chains.get(chainKey);
  if (!executionChain) {
    executionChain = buildMergedExecutionChain(entry, transformedPaths);
    entry.chains.set(chainKey, executionChain);
  }
  return executionChain;
}

/** Merges the member chains (paths already transformed) deduplicating by id, the router's start and end
 *  middlewares kept at the two ends and each mapping step inserted between its source and target route. */
function buildMergedExecutionChain(entry: BatchEntry, transformedPaths: string[]): MethodsExecutionChain {
  const seenIds = new Set<string>();
  const middleMethods: RemoteMethod[] = [];
  const memberChains: MethodsExecutionChain[] = [];
  let firstRouteIndex = -1;

  const startMiddlewareIds = new Set(startMiddlewares.map((method) => method.id));
  const endMiddlewareIds = new Set(endMiddlewares.map((method) => method.id));

  transformedPaths.forEach((transformedPath, index) => {
    const chain = getRouteExecutionChain(transformedPath);
    if (!chain) {
      throw new FatalError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-route-not-found',
        publicMessage: `Route '${entry.routes[index]}' of batch '${entry.id}' is not registered on this server.`,
        errorData: {batchId: entry.id, routeId: entry.routes[index]},
      });
    }

    memberChains.push(chain);
    if (firstRouteIndex < 0) firstRouteIndex = chain.routeIndex;

    // start and end middlewares are added separately, so skip them here
    for (const method of chain.methods) {
      if (seenIds.has(method.id)) continue;
      if (startMiddlewareIds.has(method.id)) continue;
      if (endMiddlewareIds.has(method.id)) continue;
      seenIds.add(method.id);
      middleMethods.push(method);
    }
  });

  if (entry.mappings.length > 0) insertMappingMethods(entry, middleMethods);

  const methods = [...startMiddlewares, ...middleMethods, ...endMiddlewares];
  // The entry's own number IS the declared one for a batch: it is the sum its members resolved to.
  const declaredBodySize = resolveBatchMaxBodySize(entry, memberChains);
  return {
    // the first route's index: where the first route handler sits in the merged methods
    routeIndex: firstRouteIndex,
    methods,
    serializer: SerializerModes.json,
    // cached per member-path list, so one chain answers every endpoint path that reaches it
    path: undefined,
    batchId: entry.id,
    batchRouteIds: entry.routes as string[],
    declaredBodySize,
    maxBodySize: declaredBodySize,
    readsBody: true,
  };
}

// ############# MAPPING METHODS #############

/**
 * Inserts mapping methods into the middleMethods array in the correct position.
 * Each mapping method is inserted after the source route (fromId) and before the target route (toId).
 */
function insertMappingMethods(entry: BatchEntry, middleMethods: RemoteMethod[]): void {
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < middleMethods.length; i++) idToIndex.set(middleMethods[i].id, i);

  const insertions: Array<{index: number; method: RemoteMethod}> = [];

  for (const mapping of entry.mappings) {
    const fromIndex = idToIndex.get(mapping.fromId);
    const toIndex = idToIndex.get(mapping.toId);
    if (fromIndex === undefined) {
      throw new FatalError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapping-invalid-source',
        publicMessage: `Mapping source route '${mapping.fromId}' not found in batch '${entry.id}'.`,
        errorData: {batchId: entry.id, mapping},
      });
    }
    if (toIndex === undefined) {
      throw new FatalError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapping-invalid-target',
        publicMessage: `Mapping target route '${mapping.toId}' not found in batch '${entry.id}'.`,
        errorData: {batchId: entry.id, mapping},
      });
    }

    // paramIndex is a non-negative integer (registerBatches); the UPPER bound needs the target's
    // arity, only known here. A mapping can never write past the params the route declares.
    const targetParamsCount = middleMethods[toIndex].paramsCount ?? 0;
    if (mapping.paramIndex >= targetParamsCount) {
      throw new FatalError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapping-invalid-param-index',
        publicMessage:
          `Mapping paramIndex ${mapping.paramIndex} is out of range for target route '${mapping.toId}', ` +
          `which takes ${targetParamsCount} parameter(s).`,
        errorData: {batchId: entry.id, mapping},
      });
    }

    // The allow-list is the gate on what a table may reference: the mapper's pure-fn id, as
    // harvested from the client build. An id that came through no mion lane is REJECTED here,
    // never evaluated.
    if (!hasInputMapper(mapping.mapperKey)) {
      throw new FatalError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapper-not-allowed',
        publicMessage: `Input mapper '${mapping.mapperKey}' is not registered on the server.`,
        errorData: {batchId: entry.id, mapping},
      });
    }

    insertions.push({index: fromIndex + 1, method: createMappingMethod(mapping)});
    // The target runs only when every mapping into it produced a value: the mapping step answers
    // the target itself when its source failed, and this guard keeps the route from running on top.
    middleMethods[toIndex] = guardMappedTarget(middleMethods[toIndex]);
  }

  // descending, so a splice never shifts the indices still to come
  insertions.sort((a, b) => b.index - a.index);
  for (const {index, method} of insertions) middleMethods.splice(index, 0, method);
}

/** Skips the handler when a mapping step already answered the target with an error. A copy, never a
 *  mutation: the route's own RemoteMethod is shared with every plain call to that route. */
function guardMappedTarget(target: RemoteMethod): RemoteMethod {
  if ((target as GuardedTarget).mappedTargetOf) return target;
  const guarded = {
    ...target,
    mappedTargetOf: target,
    // the guard below is async whatever the target is, so the dispatcher must await this member
    isAsync: true,
    methodCaller: async (context: CallContext, executable: RemoteMethod, ...args: unknown[]) => {
      if (isRpcError(context.response.body[executable.id])) return undefined;
      // the shared method carries its caller from registration, same as the dispatcher reads
      return getMethodCaller(target)(context, executable, ...args);
    },
  } as GuardedTarget;
  return guarded;
}

type GuardedTarget = RemoteMethod & {mappedTargetOf?: RemoteMethod};

function createMappingMethod(mapping: BatchMapping): RemoteMethod {
  const id = `mionInputFrom_${mapping.fromId}_${mapping.mapperKey}_to_${mapping.toId}`;
  const cached = mappingMethodCache.get(id);
  if (cached) return cached;

  const noopJitFns = getNoopJitFns();
  const method = {
    type: HandlerType.rawMiddleware,
    id,
    hasReturnData: false,
    paramsJitHash: '',
    returnJitHash: '',
    paramsJitFns: noopJitFns,
    returnJitFns: noopJitFns,
    handler: createMappingHandler(mapping),
    options: {alwaysRun: false, validateParams: false},
    alwaysRun: false,
    // runMappingHandler is async, so this member must be awaited
    isAsync: true,
    methodCaller: runMappingHandler,
  } as RemoteMethod;

  mappingMethodCache.set(id, method);
  return method;
}

function createMappingHandler(mapping: BatchMapping) {
  return (ctx: CallContext) => {
    const sourceOutput = ctx.response.body[mapping.fromId];
    // A source that answered a DECLARED error has no output to map, so the target gets a typed error of
    // its own instead of running on the null placeholder and failing validation as if the params were bad.
    if (isRpcError(sourceOutput)) {
      (ctx.response.body as Record<string, unknown>)[mapping.toId] = new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapping-source-failed',
        publicMessage: `Route '${mapping.fromId}' returned an error, so the input it feeds into '${mapping.toId}' could not be computed.`,
        errorData: {fromId: mapping.fromId, toId: mapping.toId, paramIndex: mapping.paramIndex},
      });
      return;
    }
    const pureFn = getInputMapper(mapping.mapperKey);
    if (!pureFn) {
      throw new FatalError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapper-not-allowed',
        publicMessage: `Input mapper '${mapping.mapperKey}' not found at runtime.`,
      });
    }
    let mappedValue: unknown;
    try {
      mappedValue = pureFn(sourceOutput);
    } catch (error) {
      // thrown, so the batch stops like any handler error, but typed and with no registry key in the message
      throw new FatalError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapper-failed',
        publicMessage: `The input mapper feeding route '${mapping.toId}' from '${mapping.fromId}' threw.`,
        errorData: {fromId: mapping.fromId, toId: mapping.toId, paramIndex: mapping.paramIndex},
        originalError: error as Error,
      });
    }
    // the client sent a null placeholder at paramIndex
    const targetParams = ctx.request.body[mapping.toId] as any[];
    if (targetParams) targetParams[mapping.paramIndex] = mappedValue;
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function runMappingHandler(context: CallContext, executable: RemoteMethod, ...args: unknown[]) {
  return executable.handler(context);
}
