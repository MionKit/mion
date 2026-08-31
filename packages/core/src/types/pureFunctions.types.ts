import type {PureFunctionData, CompiledPureFunction} from '@mionjs/run-types';

// ########################################### PURE FNs ##########################################

/** Pure-fn data + its compiled form are @ts-runtypes' own types, re-exported rather than mirrored.
 *  mion's former copies declared `code` and `createPureFn` as REQUIRED where upstream has both
 *  optional — a mirror that lied, and the reason several call sites needed `as never` casts. */
export type {PureFunctionData, CompiledPureFunction};

/** A pure fn as mion SERIALIZES it: `code` is guaranteed because mion restricts `emitMode` to
 *  'code' | 'both' (see mionVitePlugin). The client rebuilds the factory from `code`+`paramNames`,
 *  so an entry without code cannot be restored and must never reach the wire. */
export type SerializablePureFunction = PureFunctionData & Required<Pick<PureFunctionData, 'code'>>;
/** Reference built by serverMapFrom(): identifies a server-side mapper by its ts-runtypes
 *  registry key. The mapper function itself never rides the ref — only `bodyHash` travels
 *  on the wire and the server resolves it against its own registry. */
export interface MapFromServerFnRef<F extends (...args: any[]) => any = (...args: any[]) => any> {
  /** Full ts-runtypes registry key on the wire: `rt::<contentHash>` (inline lane) | `mionjs::<name>` (name lane) */
  readonly bodyHash: string;
  /** Registry namespace half of bodyHash ('rt' | 'mionjs') */
  readonly namespace: string;
  /** Function-name half of bodyHash (content hash, or the registered name) */
  readonly fnName: string;
  /** Always false: mappers resolve as plain pure fns (kept for wire-shape stability) */
  readonly isFactory: boolean;
  fromRequestId: string;
  toRequestId: string;
  /** Index of the parameter in the target route's params array this mapping replaces */
  paramIndex: number;
  mapFromSymbol: symbol;
  /** Returns this reference cast as ReturnType<F>, allowing it to be passed as a parameter to subrequests */
  asArg(): ReturnType<F>;
}

// ########################################### ROUTES FLOW ##########################################

/** Decoded routesFlow query payload sent as base64-encoded JSON in the URL query string */
export interface RoutesFlowQuery {
  /** Route paths to execute, e.g. ["/route1", "/route2"] */
  routes: string[];
  /** Optional mappings that transform one route's output into another route's input */
  mappings?: RoutesFlowMapping[];
}

/** Describes a mapping from one route's output to another route's input parameter */
export interface RoutesFlowMapping {
  /** Source route ID whose output to map from */
  fromId: string;
  /** Target route ID whose input parameter to update */
  toId: string;
  /** Pure function body hash identifier in the @ts-runtypes pure-fn cache */
  bodyHash: string;
  /** Index of the parameter in the target route's params array to replace */
  paramIndex: number;
}
