import type {PureFunctionData, CompiledPureFunction} from '@mionjs/run-types';

// ########################################### PURE FNs ##########################################

/** Pure-fn data + its compiled form are RunTypes' own types, re-exported rather than mirrored.
 *  mion's former copies declared `code` and `createPureFn` as REQUIRED where upstream has both
 *  optional — a mirror that lied, and the reason several call sites needed `as never` casts. */
export type {PureFunctionData, CompiledPureFunction};

/** A pure fn as mion SERIALIZES it: `code` is guaranteed because mion restricts `emitMode` to
 *  'code' | 'both' (see mionVitePlugin). The client rebuilds the factory from `code`+`paramNames`,
 *  so an entry without code cannot be restored and must never reach the wire. */
export type SerializablePureFunction = PureFunctionData & Required<Pick<PureFunctionData, 'code'>>;
/** Reference built by inputFrom(): names a server-side mapper by its mion registry key. The
 *  mapper function never rides the ref; the key lives in the batch table the build compiled
 *  into the server, so nothing about the mapper travels on the wire. */
export interface InputFromRef<F extends (...args: any[]) => any = (...args: any[]) => any> {
  /** Full mion registry key: `rt::<contentHash>` (inline lane) | `mionjs::<name>` (name lane) */
  readonly mapperKey: string;
  /** Registry namespace half of mapperKey ('rt' | 'mionjs') */
  readonly namespace: string;
  /** Function-name half of mapperKey (content hash, or the registered name) */
  readonly fnName: string;
  fromRequestId: string;
  toRequestId: string;
  /** Index of the parameter in the target route's params array this mapping replaces */
  paramIndex: number;
  inputFromSymbol: symbol;
  /** Returns this reference cast as ReturnType<F>, allowing it to be passed as a parameter to subrequests */
  asArg(): ReturnType<F>;
}

// ########################################### BATCHES ##########################################

/** One compiled batch: the ordered route ids it runs and the mappings between them. The build
 *  extracts it from every `batch([...])` call site and the server registers it under its id. */
export interface BatchDefinition {
  /** Route ids to execute, in call order, e.g. ["orders/getById", "users/getById"] */
  routes: string[];
  /** Mappings that feed one route's output into another route's input parameter */
  mappings?: BatchMapping[];
}

/** Describes a mapping from one route's output to another route's input parameter */
export interface BatchMapping {
  /** Source route id whose output to map from */
  fromId: string;
  /** Target route id whose input parameter to replace */
  toId: string;
  /** Index of the parameter in the target route's params array to replace */
  paramIndex: number;
  /** Full mion registry key of the mapper (`rt::<hash>` | `mionjs::<name>`) */
  mapperKey: string;
}
