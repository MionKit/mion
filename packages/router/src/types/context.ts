/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyObject, SerializerCode} from '@mionjs/core';
import type {RpcError} from '@mionjs/core';
import type {MethodsExecutionChain} from './remoteMethods.ts';

// ####### Call Context #######

// type-call-context-start
/** The call Context object passed as first parameter to any middleFn or route */
export interface CallContext<ContextData extends Record<string, any> = any> {
  /** Route's path after internal transformation */
  readonly path: string;
  /** Router's own request object */
  readonly request: MionRequest;
  /** Router's own response object */
  readonly response: MionResponse;
  /** context data between handlers (route/middleFns) and that is not returned in the response. */
  shared: ContextData;
  /** The execution chain of the current route */
  readonly executionChain: MethodsExecutionChain;
  /** The request limit this request was read against: the chain's number capped by the platform's */
  readonly maxBodySize: number;
  /** False when the path or batch id resolved to a not-found chain: the adapter skips the body
   *  read and the router never parses it, while the global middleFns still run */
  readonly readsBody: boolean;
  /** Query string from URL, used by the batch endpoint (`id=<batchId>`) and by query routes */
  readonly urlQuery?: string;
  /** Id of the batch a batch request is running */
  readonly batchId?: string;
  /** Route ids a batch request is running, in call order. Exposed for consumers (logging,
   *  metrics, middleFns that branch on the batch). */
  readonly batchRouteIds?: string[];
}
// type-call-context-end

// ####### REQUEST & RESPONSE #######

/** Request body as the adapter hands it over: a JSON string, or an object a host already parsed */
export type RawRequestBody = string | AnyObject;
/** Response body can be a string or an object (for pre-serialized responses) */
export type RawResponseBody = string | AnyObject;

// type-mion-request-start
/** Router's own request object, do not confuse with the underlying raw request */
export interface MionRequest {
  /** parsed headers */
  readonly headers: Readonly<Omit<MionHeaders, 'append' | 'set' | 'delete'>>;
  /** Raw request body, a string for json or a javascript object in the case of pre-parsed body */
  readonly rawBody: RawRequestBody;
  readonly bodyType: SerializerCode;
  /** parsed request body */
  readonly body: Readonly<AnyObject>;
  /**
   * Unexpected or thrown errors that are not part of the route/handler return type.
   * This includes:
   * - Validation errors (params, headers)
   * - Deserialization/serialization errors
   * - Errors thrown by user code (not returned)
   * - Route not found errors
   * - Any other errors thrown during execution
   *
   * These errors are serialized separately from the route response and sent to the client
   * in the thrownErrors middleFn response, allowing them to be properly deserialized
   * without being part of the route's type signature.
   */
  readonly thrownErrors?: Readonly<Record<string, RpcError<string>>>;
}
// type-mion-request-end

// type-mion-response-start
/** Router's own response object, do not confuse with the underlying raw response */
export interface MionResponse {
  /** response http status code */
  readonly statusCode: number;
  /** response headers */
  readonly headers: Readonly<MionHeaders>;
  /** Raw response body, a string for json. */
  readonly rawBody: RawResponseBody;
  readonly serializer: SerializerCode;
  /** the router response data, body should not be modified manually so marked as Read Only */
  readonly body: Readonly<ResponseBody>;
  /** true once something ended the execution chain: a thrown error or a returned FatalError */
  readonly hasErrors: boolean;
  /** The error that ended the execution chain (thrown, or a returned FatalError), the first one wins.
   *  Undefined while nothing halted. One place for an `alwaysRun` middleFn (a logger) to look. */
  readonly fatalError?: RpcError<string>;
}
// type-mion-response-end

/**
 * Similar to Fetch API Headers.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Headers
 * Headers names must be case insensitive.
 */
// type-mion-headers-start
export interface MionHeaders {
  append(name: string, value: string): void;
  delete(name: string): void;
  set(name: string, value: string): void;
  get(name: string): string | undefined | null;
  has(name: string): boolean;
  entries(): IterableIterator<[string, string]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
}
// type-mion-headers-end

/** Function used to create the context data object on each route call  */
export type ContextDataFactory<ContextData extends Record<string, any>> = () => ContextData;

// type-response-body-start
/** Response body, a record containing the result of each handler or an error. */
export interface ResponseBody extends Record<string, any> {
  '@thrownErrors'?: Record<string, RpcError<string>>;
}
// type-response-body-end

/** Result of resolving a request to its execution chain (getBatchExecutionChain for a batch) */
/** A request resolved to its chain and its request limit, before any context exists: what a
 *  streaming adapter reads the body against. */
export interface ResolvedRequest extends BatchExecutionResult {
  /** The path after `pathTransform`, the one the context carries */
  path: string;
  /** The query string as it came off the url, carried so the context needs no second parse */
  urlQuery: string | undefined;
  /** False for mion's own not-found chains: the body is never read or parsed for them */
  readsBody: boolean;
}

export interface BatchExecutionResult {
  executionChain: MethodsExecutionChain;
  /** The request limit of the chain (a batch: the sum of its member routes'), the platform's number
   *  filled in where the types could not say */
  maxBodySize: number;
  /** Id of the batch, surfaced on the CallContext */
  batchId?: string;
  /** Route ids of the batch, surfaced on the CallContext for consumers */
  batchRouteIds?: string[];
}
