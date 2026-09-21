import type {PureFunctionData, CompiledPureFunction} from '@mionjs/run-types';

// ########################################### PURE FNs ##########################################

/** RunTypes' own types, re-exported rather than mirrored: mion's old copies declared `code` and
 *  `createPureFn` REQUIRED where upstream has both optional, which is what forced `as never` casts. */
export type {PureFunctionData, CompiledPureFunction};

/** A pure fn as mion SERIALIZES it: `code` is guaranteed because mion restricts `emitMode` to
 *  'code' | 'both' (see mionVitePlugin). The client rebuilds the factory from `code`+`paramNames`,
 *  so an entry without code cannot be restored and must never reach the wire. */
export type SerializablePureFunction = PureFunctionData & Required<Pick<PureFunctionData, 'code'>>;
/** Reference built by inputFrom(): names a server-side mapper by its mion registry key. The mapper never
 *  rides the ref, its id lives in the batch table the build compiled into the server, so nothing travels. */
export interface InputFromRef<F extends (...args: any[]) => any = (...args: any[]) => any> {
  /** The mapper's pure-fn id, the one the build injected at its `inputFrom` call */
  readonly mapperKey: string;
  fromRequestId: string;
  toRequestId: string;
  /** Index of the parameter in the target route's params array this mapping replaces */
  paramIndex: number;
  inputFromSymbol: symbol;
  /** This reference cast as ReturnType<F>, so it can be passed as a parameter to subrequests. */
  asArg(): ReturnType<F>;
}

// ########################################### BATCHES ##########################################

/** One compiled batch, extracted by the build from a `batch([...])` call site and registered on the server under its id. */
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
  /** The mapper's pure-fn id */
  mapperKey: string;
}
