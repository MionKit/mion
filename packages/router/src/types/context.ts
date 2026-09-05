/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyObject, DataViewSerializer, SerializerCode} from '@mionjs/core';
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
  /** Query string from URL, used by the batch endpoint (`id=<batchId>`) and by query routes */
  readonly urlQuery?: string;
  /** Id of the batch a batch request is running */
  readonly batchId?: string;
  /** Route ids a batch request is running, in call order. Exposed for consumers (logging,
   *  metrics, middleFns that branch on the batch); mion itself sizes binary buffers from the
   *  execution chain's own methods. */
  readonly batchRouteIds?: string[];
}
// type-call-context-end

// ####### REQUEST & RESPONSE #######

export type RawRequestBody = string | ArrayBuffer | Uint8Array | AnyObject;
/** Response body can be a string, an arrayBuffer, a Uint8Array, or an object (for pre-serialized responses) */
export type RawResponseBody = string | ArrayBuffer | Uint8Array | AnyObject;

// type-mion-request-start
/** Router's own request object, do not confuse with the underlying raw request */
export interface MionRequest {
  /** parsed headers */
  readonly headers: Readonly<Omit<MionHeaders, 'append' | 'set' | 'delete'>>;
  /** Raw request body, can be string for json, arrayBuffer for binary or a javascript object in the case of pre-parsed body */
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
  /** Raw response body, can be string for json or an arrayBuffer for binary. */
  readonly rawBody: RawResponseBody;
  readonly serializer: SerializerCode;
  /** the router response data, body should not be modified manually so marked as Read Only */
  readonly body: Readonly<ResponseBody>;
  /** response errors: empty if there were no errors during execution */
  readonly hasErrors: boolean;
  readonly binSerializer?: DataViewSerializer | undefined;
  /** Returns the binary response buffer to mion's pool. Platform adapters MUST call this once the
   *  payload has been written or copied out — see each adapter for its safe point. Idempotent, and
   *  a no-op when the buffer was not pooled. Until it is called the buffer is not reused, so a
   *  missed call costs a reuse, never correctness. */
  readonly releaseBinBuffer?: (() => void) | undefined;
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
export interface BatchExecutionResult {
  executionChain: MethodsExecutionChain;
  /** Id of the batch, surfaced on the CallContext */
  batchId?: string;
  /** Route ids of the batch, surfaced on the CallContext for consumers */
  batchRouteIds?: string[];
}
