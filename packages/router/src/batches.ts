/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  RpcError,
  SerializerCode,
  SerializerModes,
  StatusCodes,
  HandlerType,
  getNoopJitFns,
  getOrCreateGlobal,
  getRoutePath,
  ROUTER_ITEM_SEPARATOR_CHAR,
  isRpcError,
} from '@mionjs/core';
import {getInputMapper, hasInputMapper} from '@mionjs/core';
import type {BatchDefinition, BatchMapping} from '@mionjs/core';
import {getRouteExecutionChain, getRouterOptions, getPlatformConfig, startMiddleFns, endMiddleFns} from './router.ts';
import {getMethodCaller} from './dispatch.ts';
import {RouterOptions} from './types/general.ts';
import {MethodsExecutionChain, RemoteMethod} from './types/remoteMethods.ts';
import {BatchExecutionResult} from './types/context.ts';
import type {CallContext} from './types/context.ts';

// ############# BATCH REGISTRY #############
//
// A batch is several routes run in ONE request, with `inputFrom` mappings feeding one route's output
// into another's input on the server. The build reads every `batch([...])` call site in the client,
// hashes its ordered route ids into an id, and compiles the id → definition table into the server
// (the generated `.mion/rpc/batches.generated.js` calls replaceBatches). A request carries only the id:
// nothing untrusted describes a chain any more, so there is no shape to check and no count to cap.
//
// Batches are NOT routes: they live in this registry, apart from the route table, and are never
// looked up by path. The merged execution chain is built once per id (once per tenant when a
// pathTransform reads the request) and kept on the entry.

/** One registered batch: its definition, its merged chains and its request limit. */
export interface BatchEntry {
  readonly id: string;
  /** Route ids in call order, e.g. ['orders/getById', 'users/getById'] */
  readonly routes: readonly string[];
  readonly mappings: readonly BatchMapping[];
  /** Merged chains keyed by the pathTransform-resolved paths ('' when there is no transform) */
  readonly chains: Map<string, MethodsExecutionChain>;
  /** Largest request body this batch accepts, resolved on first use (see resolveBatchMaxBodySize) */
  maxBodySize?: number;
}

const batchesById = getOrCreateGlobal('mion.router.batchesById', () => new Map<string, BatchEntry>());
/** Cache for mapping RemoteMethods keyed by their unique ID */
const mappingMethodCache = getOrCreateGlobal('mion.router.batchMappingMethodCache', () => new Map<string, RemoteMethod>());

/** Registers compiled batches; a hand-written server may call it. A malformed definition is a
 *  configuration error and throws at registration, never at request time. Re-registering an id
 *  replaces it; ids not in `table` are left alone (see replaceBatches for the whole-table form). */
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

/** Replaces the WHOLE table with `table`. What the generated `.mion/rpc/batches.generated.js`
 *  calls, so every evaluation of it, the first or a dev reload after the client build rewrote it,
 *  leaves exactly the batches in the file registered and nothing from before. */
export function replaceBatches(table: Record<string, BatchDefinition>): void {
  clearBatches();
  registerBatches(table);
}

/** Rejects a definition the server cannot run. The table is build-generated, so this is a guard
 *  against a stale or hand-edited manifest, reported at boot with the batch id. */
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

/** Returns a registered batch. */
export function getBatch(id: string): BatchEntry | undefined {
  return batchesById.get(id);
}

/** Ids of every registered batch, for the metadata route. */
export function getBatchIds(): string[] {
  return [...batchesById.keys()];
}

/** Drops every registered batch and its chains. Called by resetRouter and replaceBatches. */
export function clearBatches(): void {
  batchesById.clear();
  mappingMethodCache.clear();
}

/** Largest body a batch request accepts: fixed on the entry at first use so the limit is read from
 *  the table, and initialised from the same number a plain route gets today (the platform's own
 *  limit when it publishes one, else the router option). */
export function resolveBatchMaxBodySize(entry: BatchEntry): number {
  if (entry.maxBodySize === undefined) {
    const platformLimit = getPlatformConfig()?.maxBodySize;
    entry.maxBodySize = typeof platformLimit === 'number' ? platformLimit : getRouterOptions().maxBodySize;
  }
  return entry.maxBodySize;
}

// ############# REQUEST RESOLUTION #############

/** Reads the batch id out of the query string (`id=<batchId>`, the only parameter the batch
 *  endpoint reads). Anything else, missing or undecodable, is an unknown id. */
export function readBatchId(urlQuery: string | undefined): string | undefined {
  if (!urlQuery) return undefined;
  for (const part of urlQuery.split('&')) {
    if (!part.startsWith('id=')) continue;
    try {
      return decodeURIComponent(part.slice(3)) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Resolves a batch request to its merged execution chain by id. Runs while the call context is
 *  acquired, BEFORE the request body is deserialized, so an unknown id costs the server nothing
 *  but a Map lookup. The id is the only untrusted input and it is never echoed back. */
export function getBatchExecutionChain(rawRequest: unknown, opts: RouterOptions, urlQuery?: string): BatchExecutionResult {
  const batchId = readBatchId(urlQuery);
  const entry = batchId ? getBatch(batchId) : undefined;
  if (!entry) {
    throw new RpcError({
      statusCode: StatusCodes.NOT_FOUND,
      type: 'batch-unknown-id',
      publicMessage:
        'Batch id not registered on this server. Batches are compiled by the build; rebuild the client and the server together.',
    });
  }

  // The chain is built from the TRANSFORMED paths, and pathTransform may read the request (a tenant
  // header, the host), so with a transform the chains are kept per resolved path list: the same id
  // from two requests that resolve differently must never share a chain.
  const routePaths = entry.routes.map((routeId) => getRoutePath(routeId.split(ROUTER_ITEM_SEPARATOR_CHAR), opts));
  const transformedPaths = opts.pathTransform
    ? routePaths.map((routePath) => opts.pathTransform!(rawRequest, routePath) || routePath)
    : routePaths;
  const chainKey = opts.pathTransform ? transformedPaths.join(',') : '';
  let executionChain = entry.chains.get(chainKey);
  if (!executionChain) {
    executionChain = buildMergedExecutionChain(entry, transformedPaths, opts);
    entry.chains.set(chainKey, executionChain);
  }
  return {executionChain, batchId: entry.id, batchRouteIds: entry.routes as string[]};
}

/**
 * Builds a merged execution chain from the batch's routes (already path-transformed).
 * The merged chain includes all methods from all routes, with deduplication by ID:
 * 1. Start middleFns (e.g., mionDeserializeRequest) - from the router, at the beginning
 * 2. Middle methods (routes and their middleFns) - merged from all routes, with mapping steps inserted
 * 3. End middleFns (e.g., mionSerializeResponse) - from the router, at the end
 * Mapping steps are inserted after the source route and before the target route.
 */
function buildMergedExecutionChain(entry: BatchEntry, transformedPaths: string[], opts: RouterOptions): MethodsExecutionChain {
  const seenIds = new Set<string>();
  const middleMethods: RemoteMethod[] = [];
  let resolvedSerializer: SerializerCode | undefined;
  let firstRouteIndex = -1;
  const defaultSerializerCode = SerializerModes[opts.serializer];

  // Build sets of start and end middleFn IDs for filtering
  const startMiddleFnIds = new Set(startMiddleFns.map((method) => method.id));
  const endMiddleFnIds = new Set(endMiddleFns.map((method) => method.id));

  transformedPaths.forEach((transformedPath, index) => {
    const chain = getRouteExecutionChain(transformedPath);
    if (!chain) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-route-not-found',
        publicMessage: `Route '${entry.routes[index]}' of batch '${entry.id}' is not registered on this server.`,
        errorData: {batchId: entry.id, routeId: entry.routes[index]},
      });
    }

    // Resolve serializer - use first route's serializer, or fall back to default if conflicting
    if (!resolvedSerializer) {
      resolvedSerializer = chain.serializer;
      // Track the route index from the first route (relative to start middleFns)
      firstRouteIndex = chain.routeIndex;
    } else if (resolvedSerializer !== chain.serializer) {
      resolvedSerializer = defaultSerializerCode;
    }

    // Add middle methods from this route's chain, deduplicating by ID; start and end middleFns are added separately
    for (const method of chain.methods) {
      if (seenIds.has(method.id)) continue;
      if (startMiddleFnIds.has(method.id)) continue;
      if (endMiddleFnIds.has(method.id)) continue;
      seenIds.add(method.id);
      middleMethods.push(method);
    }
  });

  if (entry.mappings.length > 0) insertMappingMethods(entry, middleMethods);

  return {
    // Use the first route's routeIndex since that's where the first route handler is
    routeIndex: firstRouteIndex,
    methods: [...startMiddleFns, ...middleMethods, ...endMiddleFns],
    serializer: resolvedSerializer ?? defaultSerializerCode,
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
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapping-invalid-source',
        publicMessage: `Mapping source route '${mapping.fromId}' not found in batch '${entry.id}'.`,
        errorData: {batchId: entry.id, mapping},
      });
    }
    if (toIndex === undefined) {
      throw new RpcError({
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
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapping-invalid-param-index',
        publicMessage:
          `Mapping paramIndex ${mapping.paramIndex} is out of range for target route '${mapping.toId}', ` +
          `which takes ${targetParamsCount} parameter(s).`,
        errorData: {batchId: entry.id, mapping},
      });
    }

    // The allow-list is the gate on what a table may reference: the FULL registry key, 'rt::<hash>'
    // (build-harvested inline mapper) or 'mionjs::<name>' (server-registered and opted in with
    // allowInputMapper). A key outside a mion lane is REJECTED here, never evaluated.
    if (!hasInputMapper(mapping.mapperKey)) {
      throw new RpcError({
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

  // Sort insertions by index descending so splice doesn't shift subsequent indices
  insertions.sort((a, b) => b.index - a.index);
  for (const {index, method} of insertions) middleMethods.splice(index, 0, method);
}

/** A shallow copy of the target route whose caller skips the handler when a mapping step already
 *  answered it with an error. A copy, never a mutation: the route's own RemoteMethod is shared with
 *  every plain call to that route. */
function guardMappedTarget(target: RemoteMethod): RemoteMethod {
  if ((target as GuardedTarget).mappedTargetOf) return target;
  const guarded = {
    ...target,
    mappedTargetOf: target,
    methodCaller: async (context: CallContext, executable: RemoteMethod, ...args: unknown[]) => {
      if (isRpcError(context.response.body[executable.id])) return undefined;
      // resolved lazily on the shared method, exactly as the dispatcher does on its first run
      return getMethodCaller(target)(context, executable, ...args);
    },
  } as GuardedTarget;
  return guarded;
}

type GuardedTarget = RemoteMethod & {mappedTargetOf?: RemoteMethod};

/** Creates or retrieves a cached RemoteMethod that acts as a raw middleFn to execute a mapping between routes */
function createMappingMethod(mapping: BatchMapping): RemoteMethod {
  const id = `mionInputFrom_${mapping.fromId}_${mapping.mapperKey}_to_${mapping.toId}`;
  const cached = mappingMethodCache.get(id);
  if (cached) return cached;

  const noopJitFns = getNoopJitFns();
  const method = {
    type: HandlerType.rawMiddleFn,
    id,
    isAsync: false,
    hasReturnData: false,
    paramsJitHash: '',
    returnJitHash: '',
    paramsJitFns: noopJitFns,
    returnJitFns: noopJitFns,
    handler: createMappingHandler(mapping),
    options: {runOnError: false, validateParams: false},
    methodCaller: runMappingHandler,
  } as RemoteMethod;

  mappingMethodCache.set(id, method);
  return method;
}

/** Creates the handler function for a mapping step */
function createMappingHandler(mapping: BatchMapping) {
  return (ctx: CallContext) => {
    const sourceOutput = ctx.response.body[mapping.fromId];
    // A source that answered a DECLARED error has no output to map: the target gets a typed error
    // of its own (its guard then skips the handler) instead of running on a null placeholder and
    // failing validation as if the caller had sent bad params.
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
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapper-not-allowed',
        publicMessage: `Input mapper '${mapping.mapperKey}' not found at runtime.`,
      });
    }
    let mappedValue: unknown;
    try {
      mappedValue = pureFn(sourceOutput);
    } catch (error) {
      // thrown, so the batch stops like any thrown handler error, but typed and without the
      // registry key in the public message
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'batch-mapper-failed',
        publicMessage: `The input mapper feeding route '${mapping.toId}' from '${mapping.fromId}' threw.`,
        errorData: {fromId: mapping.fromId, toId: mapping.toId, paramIndex: mapping.paramIndex},
        originalError: error as Error,
      });
    }
    // Replace the null placeholder at paramIndex in the target route's params
    const targetParams = ctx.request.body[mapping.toId] as any[];
    if (targetParams) targetParams[mapping.paramIndex] = mappedValue;
  };
}

/** Custom method caller for mapping handlers, only passes the context */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function runMappingHandler(context: CallContext, executable: RemoteMethod, ...args: unknown[]) {
  return executable.handler(context);
}
