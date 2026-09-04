/* ########
 * 2023 mion
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
  fromBase64Url,
  getOrCreateGlobal,
} from '@mionjs/core';
import {getServerMapper, hasServerMapper} from '@mionjs/core';
import {getRouteExecutionChain, getRouterOptions, startMiddleFns, endMiddleFns} from './router.ts';
import {RouterOptions} from './types/general.ts';
import {MethodsExecutionChain, RemoteMethod} from './types/remoteMethods.ts';
import {RoutesFlowExecutionResult} from './types/context.ts';
import type {CallContext} from './types/context.ts';
import type {RoutesFlowQuery, RoutesFlowMapping} from '@mionjs/core';

// ############# ROUTES_FLOW CACHE #############

/** FILO cache for merged execution chains. Key is the query string, value is the cached chain. */
/** A routesFlow query names at most this many routes: the chain is built and cached per query, so an
 *  unbounded list is an allocation the caller controls. */
export const MAX_ROUTES_FLOW_ROUTES = 32;

const routesFlowCache = getOrCreateGlobal('mion.routesFlow.routesFlowCache', () => new Map<string, MethodsExecutionChain>());
const cacheOrder = getOrCreateGlobal('mion.routesFlow.cacheOrder', () => [] as string[]);
/** Cache for mapping RemoteMethods keyed by their unique ID */
const mappingMethodCache = getOrCreateGlobal('mion.routesFlow.mappingMethodCache', () => new Map<string, RemoteMethod>());

/** Clears the routesFlow cache and mapping method cache - useful for testing */
export function clearRoutesFlowCache(): void {
  routesFlowCache.clear();
  cacheOrder.length = 0;
  mappingMethodCache.clear();
}

/** Returns the current routesFlow cache size */
export function getRoutesFlowCacheSize(): number {
  return routesFlowCache.size;
}

/** Returns a cached routesFlow chain by query string */
export function getCachedRoutesFlow(query: string): MethodsExecutionChain | undefined {
  return routesFlowCache.get(query);
}

/** Adds a merged chain to the cache with FILO eviction */
function addToRoutesFlowCache(query: string, chain: MethodsExecutionChain): void {
  const routerOpts = getRouterOptions();
  const maxSize = routerOpts.maxRoutesFlowsCacheSize;
  // Caching disabled
  if (maxSize <= 0) return;
  // Evict oldest entries if cache is full (FILO - First In, Last Out)
  while (cacheOrder.length >= maxSize) {
    const oldestKey = cacheOrder.shift();
    if (oldestKey) routesFlowCache.delete(oldestKey);
  }
  routesFlowCache.set(query, chain);
  cacheOrder.push(query);
}

// ############# QUERY PARSING #############

/** Rejects a decoded query whose shape does not match RoutesFlowQuery.
 *
 *  ⚠️ THIS IS THE TRUST BOUNDARY. Everything here arrives in the URL query string, so `RoutesFlowQuery`
 *  is a claim about the wire, not a fact — `JSON.parse` returns whatever the caller sent and the cast
 *  checks nothing. Downstream code indexes arrays and looks up registry keys with these values, so the
 *  shape has to be established once, here, rather than assumed at each use.
 *
 *  Hand-written rather than a compiled `createValidateFn<RoutesFlowQuery>()`: the router's src has no
 *  direct validator calls today (only its specs do), and adding one would make every consumer's build
 *  responsible for injecting it. The shape is four primitives deep, so the check is cheap either way. */
function assertValidRoutesFlowQuery(parsed: unknown): RoutesFlowQuery {
  const invalid = (reason: string, errorData?: Record<string, unknown>): never => {
    throw new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'routesFlow-invalid-query',
      publicMessage: `RoutesFlow query is malformed: ${reason}.`,
      errorData,
    });
  };

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid('expected an object');
  const query = parsed as Record<string, unknown>;

  if (!Array.isArray(query.routes) || query.routes.some((route) => typeof route !== 'string'))
    invalid('`routes` must be an array of strings');
  if ((query.routes as string[]).length > MAX_ROUTES_FLOW_ROUTES)
    invalid(`\`routes\` can name at most ${MAX_ROUTES_FLOW_ROUTES} routes`);

  if (query.mappings !== undefined) {
    if (!Array.isArray(query.mappings)) invalid('`mappings` must be an array');
    for (const mapping of query.mappings as unknown[]) {
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) invalid('every mapping must be an object');
      const {fromId, toId, bodyHash, paramIndex} = mapping as Record<string, unknown>;
      if (typeof fromId !== 'string' || typeof toId !== 'string' || typeof bodyHash !== 'string')
        invalid('mapping `fromId`, `toId` and `bodyHash` must be strings', {mapping});
      // Integer + non-negative, so paramIndex can only ever be an array INDEX. Without this a
      // string sails through the `number` type and lands in `params[mapping.paramIndex] = value`
      // as a plain property write — '__proto__', 'length', a negative index, a float. The upper
      // bound needs the target route's arity, so it is enforced in insertMappingMethods.
      if (typeof paramIndex !== 'number' || !Number.isInteger(paramIndex) || paramIndex < 0)
        invalid('mapping `paramIndex` must be a non-negative integer', {mapping});
    }
  }

  return query as unknown as RoutesFlowQuery;
}

/** Decodes a base64url-encoded JSON routesFlow query string, expects `data=<base64url>` format */
function decodeRoutesFlowQuery(urlQuery: string): RoutesFlowQuery {
  let parsed: unknown;
  try {
    const dataParam = urlQuery.startsWith('data=') ? urlQuery.slice(5) : urlQuery;
    const jsonString = fromBase64Url(dataParam);
    parsed = JSON.parse(jsonString);
  } catch (e: any) {
    throw new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'routesFlow-invalid-query',
      publicMessage: 'RoutesFlow query string is not valid base64url-encoded JSON.',
      originalError: e,
    });
  }
  // deliberately OUTSIDE the try: a shape rejection must not be reported as a parse failure
  return assertValidRoutesFlowQuery(parsed);
}

// ############# ROUTES_FLOW #############

/** Builds or retrieves a cached merged execution chain for routesFlow requests */
export function getRoutesFlowExecutionChain(
  rawRequest: unknown,
  opts: RouterOptions,
  urlQuery?: string
): RoutesFlowExecutionResult {
  // Validate urlQuery is provided
  if (!urlQuery) {
    throw new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'routesFlow-missing-query',
      publicMessage: 'RoutesFlow request requires a query string with route paths.',
    });
  }

  // Decode base64+JSON query
  const query = decodeRoutesFlowQuery(urlQuery);
  const routePaths = query.routes;
  const mappings = query.mappings;

  if (!routePaths || routePaths.length === 0) {
    throw new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'routesFlow-empty-routes',
      publicMessage: 'RoutesFlow request requires at least one route path in query string.',
    });
  }

  // Convert paths to route IDs (remove leading slash)
  const routeIds = routePaths.map((path) => (path.startsWith('/') ? path.slice(1) : path));

  // Check cache first. The chain is built from the TRANSFORMED paths, and pathTransform may read the
  // request (a tenant header, the host), so with a transform the key carries the resolved paths too:
  // the same query from two requests that resolve differently must never share a chain.
  const cacheKey = opts.pathTransform
    ? `${urlQuery}\u0000${routePaths.map((routePath) => opts.pathTransform!(rawRequest, routePath) || routePath).join(',')}`
    : urlQuery;
  let executionChain = routesFlowCache.get(cacheKey);
  if (executionChain) return {executionChain, routesFlowRouteIds: routeIds, mappings};

  // Build merged execution chain
  executionChain = buildMergedExecutionChain(routePaths, rawRequest, opts, mappings);
  addToRoutesFlowCache(cacheKey, executionChain);
  return {executionChain, routesFlowRouteIds: routeIds, mappings};
}

/**
 * Builds a merged execution chain from multiple route paths.
 * The merged chain includes all methods from all routes, with deduplication by ID.
 *
 * The chain is structured as:
 * 1. Start middleFns (e.g., mionDeserializeRequest) - from first route, at the beginning
 * 2. Middle methods (routes and their middleFns) - merged from all routes, with mapping steps inserted
 * 3. End middleFns (e.g., mionSerializeResponse) - from first route, at the end
 *
 * When mappings are provided, mapping steps are inserted after the source route
 * and before the target route to transform output → input.
 */
function buildMergedExecutionChain(
  routePaths: string[],
  rawRequest: unknown,
  opts: RouterOptions,
  mappings?: RoutesFlowMapping[]
): MethodsExecutionChain {
  const seenIds = new Set<string>();
  const middleMethods: RemoteMethod[] = [];
  let resolvedSerializer: SerializerCode | undefined;
  let firstRouteIndex = -1;
  const defaultSerializerCode = SerializerModes[opts.serializer];

  // Build sets of start and end middleFn IDs for filtering
  const startMiddleFnIds = new Set(startMiddleFns.map((m) => m.id));
  const endMiddleFnIds = new Set(endMiddleFns.map((m) => m.id));

  // Process each route path
  for (const routePath of routePaths) {
    // Apply path transform if configured
    const transformedPath = opts.pathTransform?.(rawRequest, routePath) || routePath;
    const chain = getRouteExecutionChain(transformedPath);
    if (!chain) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'routesFlow-route-not-found',
        publicMessage: `Route not found in routesFlow: ${routePath}`,
        errorData: {routePath},
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

    // Add middle methods from this route's chain, deduplicating by ID
    // Skip start and end middleFns - they will be added separately
    for (const method of chain.methods) {
      if (seenIds.has(method.id)) continue;
      if (startMiddleFnIds.has(method.id)) continue;
      if (endMiddleFnIds.has(method.id)) continue;
      seenIds.add(method.id);
      middleMethods.push(method);
    }
  }

  // Insert mapping methods between source and target routes
  if (mappings && mappings.length > 0) {
    insertMappingMethods(middleMethods, mappings);
  }

  // Build final chain: start middleFns + middle methods + end middleFns
  const mergedMethods = [...startMiddleFns, ...middleMethods, ...endMiddleFns];

  return {
    // Use the first route's routeIndex since that's where the first route handler is
    routeIndex: firstRouteIndex,
    methods: mergedMethods,
    serializer: resolvedSerializer ?? defaultSerializerCode,
  };
}

// ############# MAPPING METHODS #############

/**
 * Inserts mapping methods into the middleMethods array in the correct position.
 * Each mapping method is inserted after the source route (fromId) and before the target route (toId).
 * Mappings are processed in reverse insertion order to maintain correct indices.
 */
function insertMappingMethods(middleMethods: RemoteMethod[], mappings: RoutesFlowMapping[]): void {
  // Build a map of route ID → index in middleMethods for quick lookup
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < middleMethods.length; i++) {
    idToIndex.set(middleMethods[i].id, i);
  }

  // Collect insertions: each mapping creates one insertion point
  const insertions: Array<{index: number; method: RemoteMethod}> = [];

  for (const mapping of mappings) {
    const fromIndex = idToIndex.get(mapping.fromId);
    const toIndex = idToIndex.get(mapping.toId);

    if (fromIndex === undefined) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'routesFlow-mapping-invalid-source',
        publicMessage: `Mapping source route '${mapping.fromId}' not found in routesFlow execution chain.`,
        errorData: {mapping},
      });
    }
    if (toIndex === undefined) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'routesFlow-mapping-invalid-target',
        publicMessage: `Mapping target route '${mapping.toId}' not found in routesFlow execution chain.`,
        errorData: {mapping},
      });
    }

    // paramIndex is already known to be a non-negative integer (assertValidRoutesFlowQuery); the
    // UPPER bound needs the target's arity, which is only resolvable here. Rejecting now means a
    // mapping can never write past the params the route actually declares — checked while the
    // chain is built, so a bad mapping never reaches dispatch.
    const targetParamsCount = middleMethods[toIndex].paramsCount ?? 0;
    if (mapping.paramIndex >= targetParamsCount) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'routesFlow-mapping-invalid-param-index',
        publicMessage:
          `Mapping paramIndex ${mapping.paramIndex} is out of range for target route '${mapping.toId}', ` +
          `which takes ${targetParamsCount} parameter(s).`,
        errorData: {mapping},
      });
    }

    // ⚠️ bodyHash is ATTACKER-CONTROLLED: it rides the URL query string, decoded by
    // decodeRoutesFlowQuery with a bare JSON.parse and no schema validation. hasServerMapper
    // gates it on the allow-list, which is the ONLY thing standing between a request and an
    // arbitrary entry in the shared mion pure-fn registry. It is the FULL registry key:
    // 'rt::<hash>' (build-harvested inline mapper) or 'mionjs::<name>' (server-registered and
    // opted in with allowServerMapper). An unknown key is REJECTED here — never evaluated.
    if (!hasServerMapper(mapping.bodyHash)) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'routesFlow-mapping-missing-pure-fn',
        publicMessage: `Mapping pure function '${mapping.bodyHash}' not found. Ensure the function is registered on the server.`,
        errorData: {mapping},
      });
    }

    // Insert after the source route (fromIndex + 1)
    insertions.push({
      index: fromIndex + 1,
      method: createMappingMethod(mapping),
    });
  }

  // Sort insertions by index descending so splice doesn't shift subsequent indices
  insertions.sort((a, b) => b.index - a.index);

  for (const {index, method} of insertions) {
    middleMethods.splice(index, 0, method);
  }
}

/** Creates or retrieves a cached RemoteMethod that acts as a raw middleFn to execute a mapping between routes */
function createMappingMethod(mapping: RoutesFlowMapping): RemoteMethod {
  const id = `mionMapFrom_${mapping.fromId}_${mapping.bodyHash}_to_${mapping.toId}`;
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
function createMappingHandler(mapping: RoutesFlowMapping) {
  return (ctx: CallContext) => {
    // Get the output from the source route
    const sourceOutput = ctx.response.body[mapping.fromId];

    // Resolve and execute the mapper from the mion registry (full key on the wire)
    const pureFn = getServerMapper(mapping.bodyHash);
    if (!pureFn) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'routesFlow-mapping-missing-pure-fn',
        publicMessage: `Mapping pure function '${mapping.bodyHash}' not found at runtime.`,
      });
    }
    const mappedValue = pureFn(sourceOutput);

    // Replace null at paramIndex in target route's params
    const targetParams = ctx.request.body[mapping.toId] as any[];
    if (targetParams) (targetParams as any[])[mapping.paramIndex] = mappedValue;
  };
}

/** Custom method caller for mapping handlers — only passes the context */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function runMappingHandler(context: CallContext, executable: RemoteMethod, ...args: unknown[]) {
  return executable.handler(context);
}
