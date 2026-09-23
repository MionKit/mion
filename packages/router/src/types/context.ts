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
/** The call Context object passed as first parameter to any middleware or route */
export interface CallContext<ContextData extends Record<string, any> = any> {
  /** Route's path after internal transformation */
  readonly path: string;
  readonly request: MionRequest;
  readonly response: MionResponse;
  /** Data shared between handlers (route/middlewares), never returned in the response. */
  shared: ContextData;
  readonly executionChain: MethodsExecutionChain;
  /** The request limit this request was read against: the chain's number capped by the platform's */
  readonly maxBodySize: number;
  /** False on a not-found chain: the body is never read or parsed, `alwaysRun` middlewares still run */
  readonly readsBody: boolean;
  /** Query string from URL, used by the batch endpoint (`id=<batchId>`) and by query routes */
  readonly urlQuery?: string;
  /** Id of the batch a batch request is running */
  readonly batchId?: string;
  /** Route ids a batch request is running, in call order. Exposed for consumers (logging, metrics). */
  readonly batchRouteIds?: string[];
}
// type-call-context-end

// ####### REQUEST & RESPONSE #######

/** Request body as the adapter hands it over: a JSON string, or an object a host already parsed */
export type RawRequestBody = string | AnyObject;
/** The object form is a pre-serialized response */
export type RawResponseBody = string | AnyObject;

// type-mion-request-start
/** Router's own request object, do not confuse with the underlying raw request */
export interface MionRequest {
  readonly headers: Readonly<Omit<MionHeaders, 'append' | 'set' | 'delete'>>;
  readonly rawBody: RawRequestBody;
  readonly bodyType: SerializerCode;
  /** The parsed request body */
  readonly body: Readonly<AnyObject>;
  /** Errors outside the route's return type: validation, (de)serialization, thrown by user code, route not found.
   *  Sent apart from the route response, in the thrownErrors middleware slot, so the client decodes them
   *  without them being part of the route's type signature. */
  readonly thrownErrors?: Readonly<Record<string, RpcError<string>>>;
}
// type-mion-request-end

// type-mion-response-start
/** Router's own response object, do not confuse with the underlying raw response */
export interface MionResponse {
  readonly statusCode: number;
  readonly headers: Readonly<MionHeaders>;
  readonly rawBody: RawResponseBody;
  readonly serializer: SerializerCode;
  /** The router response data, never to be modified by hand */
  readonly body: Readonly<ResponseBody>;
  /** true once something ended the execution chain: a thrown error or a returned FatalError */
  readonly hasErrors: boolean;
  /** The error that ended the chain (thrown or a returned FatalError), first one wins. An `alwaysRun` logger reads it here. */
  readonly fatalError?: RpcError<string>;
}
// type-mion-response-end

/** Header names must be case insensitive.
 *  @see https://developer.mozilla.org/en-US/docs/Web/API/Headers */
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

/** Creates the context data object on each route call */
export type ContextDataFactory<ContextData extends Record<string, any>> = () => ContextData;

// type-response-body-start
/** Response body, a record containing the result of each handler or an error. */
export interface ResponseBody extends Record<string, any> {
  '@thrownErrors'?: Record<string, RpcError<string>>;
}
// type-response-body-end
