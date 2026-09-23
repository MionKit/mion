/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders, RawRequestBody} from './types/context.ts';
import {type RouterOptions} from './types/general.ts';
import {HeadersMethod, RemoteMethod, RawMethod} from './types/remoteMethods.ts';
import type {MethodsExecutionChain} from './types/remoteMethods.ts';
import {getRouterOptions, getAlwaysAwait} from './router.ts';
import {Mutable, AnyObject, StatusCodes, HeadersSubset, SerializerCode, MION_ROUTES} from '@mionjs/core';
import {RpcError, FatalError, HandlerType, ValidationError, isNativeError} from '@mionjs/core';
import {UNSAFE_PROPERTY_NAME_MESSAGE} from '@mionjs/run-types';
import {markResponseFailed, recordUndeclaredError} from './lib/dispatchError.ts';
import {createCallContext, createContextFromChain, getRequestBodyType} from './callContext.ts';

// Profiled and discarded: promisify(setImmediate) (worse or no gain), queueMicrotask instead of
// setImmediate (definitely worse), callbacks instead of promises (slower, less memory in some scenarios).

// ############# PUBLIC METHODS #############

/** The one-call form for a caller that already has the body (tests, a host that parsed it). */
export async function dispatchRoute<Req, Resp>(
  path: string,
  reqRawBody: RawRequestBody,
  reqHeaders: MionHeaders,
  respHeaders: MionHeaders,
  rawRequest: Req,
  rawResponse?: Resp,
  reqBodyType?: SerializerCode,
  urlQuery?: string
): Promise<MionResponse> {
  const context = createCallContext(path, urlQuery, rawRequest, reqHeaders, respHeaders, reqRawBody, reqBodyType);
  return dispatchWithContext(context, rawRequest, rawResponse);
}

/** Dispatches a request whose context already exists. A streaming adapter built it BEFORE reading
 *  the body (to read against `context.maxBodySize`) and passes the body here; it is attached to
 *  `context.request` on the way in. A context built with its body passes nothing more. */
export async function dispatchWithContext<Req, Resp>(
  context: CallContext,
  rawRequest: Req,
  rawResponse?: Resp,
  reqRawBody?: RawRequestBody,
  reqBodyType?: SerializerCode
): Promise<MionResponse> {
  if (reqRawBody !== undefined) {
    const request = context.request as Mutable<MionRequest>;
    request.rawBody = reqRawBody;
    request.bodyType = reqBodyType ?? getRequestBodyType(reqRawBody);
  }
  // No catch: runExecutionChain handles every exception itself, so one that only re-rejects changes nothing.
  await runExecutionChain(context, rawRequest, rawResponse, getRouterOptions());
  return context.response;
}

/** Dispatches a request the platform adapter refused after its route resolved: a body past the limit.
 *  The error is recorded exactly as a thrown one is, so the chain runs only the members that declare
 *  `alwaysRun` (a rate limiter, an access log) and answers with the same envelope. The adapter stopped
 *  the read, so the context is built without a body.
 *  `path` and `urlQuery` travel with the chain rather than on it: mion's not-found chains and a merged
 *  batch chain each answer for many paths, so they carry none of their own, and a refusal does reach one
 *  of those (an adapter checks a declared content-length before asking whether the chain reads a body). */
export function dispatchPlatformError<Req, Resp>(
  chain: MethodsExecutionChain,
  path: string,
  urlQuery: string | undefined,
  platformError: RpcError<string>,
  reqHeaders: MionHeaders,
  respHeaders: MionHeaders,
  rawRequest: Req,
  rawResponse?: Resp
): Promise<MionResponse> {
  const context = createContextFromChain(chain, path, urlQuery, reqHeaders, respHeaders);
  recordUndeclaredError(context, MION_ROUTES.platformError, platformError);
  return dispatchWithContext(context, rawRequest, rawResponse);
}

// ############# PRIVATE METHODS #############

async function runExecutionChain(
  context: CallContext,
  rawRequest: unknown,
  rawResponse: unknown,
  opts: RouterOptions
): Promise<MionResponse> {
  const {response, request, executionChain} = context;
  // A router whose methods are all synchronous has no promise anywhere, so awaiting each step cannot
  // change a result and only costs a promise frame; `alwaysAwait: false` opts a mixed router into the
  // same per-step rule. Settled when the routes were registered, so this is one read, not a recomputation.
  const alwaysAwait = getAlwaysAwait();
  const executionList = executionChain.methods;
  const executionCount = executionList.length;
  (response as Mutable<MionResponse>).serializer = executionChain.serializer;
  for (let i = 0; i < executionCount; i++) {
    const executable = executionList[i];
    if (response.hasErrors && !executable.alwaysRun) continue;

    try {
      // runRawMiddleware , runHeadersMiddleware & runRouteOrMiddleware must always accept the same parameters in the same order
      // methodCaller is resolved when the method is registered, so the loop never has to pick one
      // `isAsync` is decided by the type checker at the call site, not by inspecting the value, so a
      // plain function returning a promise still awaits and a proven-sync chain costs no promise frames.
      let result;
      if (alwaysAwait || executable.isAsync) {
        result = await executable.methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);
      } else {
        result = executable.methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);
        // Backstop for a method whose declared type lied or is missing: an un-awaited promise would be
        // serialized into the body as the answer. Paid ONCE per method, on its first run; one caught here
        // is marked async for good, so every later request awaits it.
        if (executable.asyncChecked !== true) {
          executable.asyncChecked = true;
          if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
            (executable as Mutable<RemoteMethod>).isAsync = true;
            result = await result;
          }
        }
      }

      // A handler that declares a value and answers undefined is exactly the bug validateReturn is turned on for.
      if (result === undefined) {
        if (executable.options.validateReturn && executable.hasReturnData) validateReturnOrThrow(result, executable);
        continue;
      }
      // ONE read answers "is this a mion error" for every branch below: the brand is an own property on
      // every TypedError/RpcError/FatalError and on every copy that came off the wire.
      // `null` is a valid answer and reading a property off it throws, so it is excluded first
      const isMionError = result !== null && result['mion@isΣrrθr'] === true;
      if (!executable.hasReturnData) {
        // a raw middleware has no declared return type, so a returned error is undeclared: it halts and
        // travels in @thrownErrors like a thrown one (its body slot is never serialized)
        if (isMionError || isNativeError(result)) recordUndeclaredError(context, executable.id, result);
        continue;
      }
      if (isMionError) {
        // a returned FatalError ends the chain but stays in its own typed slot below; it is a declared
        // answer, so without a statusCode of its own it reads as an application error, never unexpected.
        // A plain RpcError is declared too: it stays in its slot and the chain keeps running.
        if (result.isFatal === true) markResponseFailed(context, result, StatusCodes.APPLICATION_ERROR);
      }
      // An Error mion cannot represent is a bug, not data: without this it would be serialized into the
      // body and served as a SUCCESSFUL answer. Carrying no brand it has no typed slot, so it takes the
      // thrown path instead.
      else if (isNativeError(result)) {
        recordUndeclaredError(context, executable.id, result);
        continue; // like a thrown one: it belongs in @thrownErrors, never in the body
      }
      if (executable.headersReturn && result instanceof HeadersSubset) {
        // own keys only: a HeadersSubset built over a parsed body must not turn inherited keys into headers
        const headersMap = result.headers;
        for (const name of Object.keys(headersMap)) {
          const value = headersMap[name];
          if (value !== undefined && value !== null) {
            response.headers.set(name, value);
          }
        }
        continue;
      }
      if (executable.options.validateReturn) validateReturnOrThrow(result, executable);
      (response.body as Mutable<AnyObject>)[executable.id] = result;
    } catch (err: any) {
      // All thrown errors are undeclared and fatal
      recordUndeclaredError(context, executable.id, err);
    }
  }
  return context.response;
}

// The three callers below are NOT async: awaiting the handler only to return its value adds a promise
// frame per chain member, and the loop's own await and try/catch cover the value and the promise alike.
function runRawMiddleware(
  context: CallContext,
  executable: RawMethod,
  req,
  resp,
  opts: RouterOptions,
  rawRequest: unknown,
  rawResponse: unknown
) {
  return executable.handler(context, rawRequest, rawResponse, opts);
}

function runHeadersMiddleware(context: CallContext, executable: HeadersMethod, request: MionRequest) {
  const headerNames = executable.headersParam.headerNames;
  const params = sanitizeParams(
    deserializeBodyParamsOrThrow(request, executable as RemoteMethod),
    request,
    executable as RemoteMethod
  );
  const headersMap: Record<string, string> = {};
  headerNames.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headersMap[name] = value;
  });
  const headersSubset = new HeadersSubset(headersMap);
  validateHeaderParamsOrThrow(headersSubset, executable as HeadersMethod);
  if (executable.options.validateParams) validateParametersOrThrow(params, executable as HeadersMethod);

  return executable.handler(context, headersSubset, ...params);
}

function runRouteOrMiddleware(context: CallContext, executable: HeadersMethod, request: MionRequest) {
  const params = sanitizeParams(
    deserializeBodyParamsOrThrow(request, executable as RemoteMethod),
    request,
    executable as RemoteMethod
  );
  if (executable.options.validateParams) validateParametersOrThrow(params, executable as RemoteMethod);
  return executable.handler(context, ...params);
}

/** Applies the rewrites the params types declare under a format's `transform` key (trim / case /
 *  replace / stripSeparators) in place, after decode and BEFORE validation. Params only: headers and
 *  return values are never sanitized. A transform over wrong-shaped input can throw (`.trim()` on a
 *  number): the raw params fall through so validation reports the real error instead of a 500. */
function sanitizeParams(params: any[], request: MionRequest, executable: RemoteMethod): any[] {
  if (!executable.options.sanitizeParams) return params;
  const formatTransform = executable.paramsJitFns.formatTransform;
  if (!formatTransform || formatTransform.isNoop) return params;
  try {
    const sanitized = formatTransform.fn(params) as any[];
    (request.body as Mutable<MionRequest['body']>)[executable.id] = sanitized;
    return sanitized;
  } catch {
    return params;
  }
}

/** The caller for a method kind. Read ONCE, when the method is registered, so the dispatch loop
 *  reads a field instead of branching on the method type on every request. */
export function callerForType(type: RemoteMethod['type']): (...args: any[]) => any {
  if (type === HandlerType.rawMiddleware) return runRawMiddleware;
  if (type === HandlerType.headersMiddleware) return runHeadersMiddleware;
  return runRouteOrMiddleware;
}

/** The caller already stored on a registered method. */
export function getMethodCaller(executable: RemoteMethod) {
  return executable.methodCaller;
}

/** Shared, for the members whose id is absent from the body: a fresh empty array per member per request
 *  bought nothing. Frozen, so a handler that tried to mutate its params fails loudly instead of corrupting
 *  the next request; nothing can reach it anyway, an empty tuple is spread into the call. */
const EMPTY_PARAMS: any[] = [];
Object.freeze(EMPTY_PARAMS);

function deserializeBodyParamsOrThrow(request: MionRequest, executable: RemoteMethod): any[] {
  const params = request.body[executable.id] as any[] | undefined;
  // EMPTY_PARAMS is frozen and the decoders mutate what they are handed, so decoding the sentinel would
  // report a raw serialization error where validation should refuse the missing body.
  if (!params) return EMPTY_PARAMS;

  const {decode} = executable.paramsJitFns.json;
  if (decode.isNoop) return params;
  try {
    (request.body as Mutable<MionRequest['body']>)[executable.id] = decode.fn(params);
    return request.body[executable.id] as any[];
  } catch (e: any) {
    if (isStackOverflow(e)) throw nestingTooDeep(executable, e);
    // Fixed text on the wire (the decoder's own message quotes internal detail); the original stays on
    // `originalError` and `deserializeError` keeps the RTSerializationError shape. mion's own constant for
    // a refused key IS safe to pass on: it names a key the caller sent, which beats a generic "wrong type".
    const refusedKey = typeof e?.message === 'string' && e.message.startsWith(UNSAFE_PROPERTY_NAME_MESSAGE);
    const detail = refusedKey ? (e.message as string) : 'Parameters might be of the wrong type.';
    throw new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'serialization-error',
      publicMessage: `Invalid params '${executable.id}', can not deserialize. ${detail}`,
      originalError: e,
      errorData: {
        deserializeError: detail,
      },
    });
  }
}

/** A RangeError out of a compiled function is the engine's stack limit: the request nested deeper
 *  than a recursive type can be walked. Reported as its own typed 4xx, never as an unknown error. */
function isStackOverflow(err: unknown): boolean {
  return err instanceof RangeError;
}

function nestingTooDeep(executable: RemoteMethod, originalError: Error): RpcError<'request-nesting-too-deep'> {
  return new FatalError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'request-nesting-too-deep',
    publicMessage: `Invalid params in '${executable.id}', the request is nested too deep.`,
    originalError,
  });
}

/** Opt-in via `validateReturn`; a bad return is the server's own bug, so it throws as an undeclared fatal. */
function validateReturnOrThrow(result: any, executable: RemoteMethod): void {
  if (executable.returnJitFns.isType.isNoop) return;
  let isValid: boolean;
  try {
    isValid = executable.returnJitFns.isType.fn(result);
  } catch (err: any) {
    if (isStackOverflow(err)) throw nestingTooDeep(executable, err);
    throw err;
  }
  if (isValid) return;
  throw new FatalError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'validation-error',
    publicMessage: `Invalid return value in '${executable.id}', validation failed.`,
    errorData: {typeErrors: executable.returnJitFns.typeErrors.fn(result)},
  }) as ValidationError;
}

function validateParametersOrThrow(params: any[], executable: RemoteMethod): void {
  if (executable.paramsJitFns.isType.isNoop) return;
  let isValid: boolean;
  try {
    isValid = executable.paramsJitFns.isType.fn(params);
  } catch (e: any) {
    if (isStackOverflow(e)) throw nestingTooDeep(executable, e);
    throw e;
  }
  if (!isValid) {
    const validationError: ValidationError = new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'validation-error',
      publicMessage: `Invalid params in '${executable.id}', validation failed.`,
      errorData: {
        typeErrors: executable.paramsJitFns.typeErrors.fn(params),
      },
    });
    throw validationError;
  }
}

function validateHeaderParamsOrThrow(headers: HeadersSubset<string, string>, executable: HeadersMethod): void {
  if (!executable.headersParam.jitFns.isType.fn(headers)) {
    const validationError: ValidationError = new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'validation-error',
      publicMessage: `Invalid params in '${executable.id}', validation failed.`,
      errorData: {
        typeErrors: executable.headersParam.jitFns.typeErrors.fn(headers),
      },
    });
    throw validationError;
  }
}
