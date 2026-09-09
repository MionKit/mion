/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders, RawRequestBody} from './types/context.ts';
import {type RouterOptions} from './types/general.ts';
import {HeadersMethod, RemoteMethod, RawMethod} from './types/remoteMethods.ts';
import {getRouterOptions, getAlwaysAwait} from './router.ts';
import {Mutable, AnyObject, StatusCodes, HeadersSubset, SerializerModes, SerializerCode} from '@mionjs/core';
import {RpcError, FatalError, HandlerType, ValidationError, isNativeError} from '@mionjs/core';
import {onExecutableError, markResponseFailed} from './lib/dispatchError.ts';
import {acquireCallContext, releaseCallContext} from './callContext.ts';

/*
 * PERFORMANCE PROFILING NOTE:
 * different options has been tested to improve performance but were discarded due to worst or no noticeable improvements
 * - using promisify(setImmediate): worst or no improvement
 * - using queueMicrotask instead of setImmediate: definitely worst
 * - using callback instead promises: seems to be more slow but use less memory in some scenarios.
 */

// ############# PUBLIC METHODS #############

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
  const opts = getRouterOptions();
  const usePooling = opts.maxContextPoolSize > 0;
  const context = acquireCallContext(
    usePooling,
    path,
    opts,
    reqRawBody,
    rawRequest,
    reqHeaders,
    respHeaders,
    reqBodyType,
    urlQuery
  );

  // No catch: runExecutionChain handles every exception itself, and a catch that only re-rejects
  // changes nothing. The finally stays, it is what hands a pooled context back on either path.
  try {
    await runExecutionChain(context, rawRequest, rawResponse, opts);
    return context.response;
  } finally {
    // Release context back to pool if pooling is enabled
    if (usePooling) {
      releaseCallContext(context, opts.maxContextPoolSize);
    }
  }
}

// ############# PRIVATE METHODS #############

// runs the ExecutionChain of a route
async function runExecutionChain(
  context: CallContext,
  rawRequest: unknown,
  rawResponse: unknown,
  opts: RouterOptions
): Promise<MionResponse> {
  const {response, request, executionChain} = context;
  // Await every step only when there IS something to await. A router whose methods are all
  // synchronous has no promise anywhere, so awaiting each step cannot change a result and only costs
  // a promise frame. `alwaysAwait: false` opts a mixed router into the same per-step rule.
  // Settled when the routes were registered, so this is one read rather than a recomputation.
  const alwaysAwait = getAlwaysAwait();
  const executionList = executionChain.methods;
  const executionCount = executionList.length;
  (response as Mutable<MionResponse>).serializer = executionChain.serializer;
  for (let i = 0; i < executionCount; i++) {
    const executable = executionList[i];
    if (response.hasErrors && !executable.alwaysRun) continue;

    try {
      // runRawMiddleFn , runHeadersMiddleFn & runRouteOrMiddleFn must always accept the same parameters in the same order
      // methodCaller is resolved when the method is registered, so the loop never has to pick one
      // A step the build proved synchronous is called without an await, so a chain of sync steps costs
      // no promise frames. `isAsync` is decided by the type checker at the call site, not by
      // inspecting the value, so a plain function returning a promise still awaits.
      let result;
      if (alwaysAwait || executable.isAsync) {
        result = await executable.methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);
      } else {
        result = executable.methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);
        // Backstop for a method whose declared type lied, or that has no declared type at all: an
        // un-awaited promise would be serialized into the body as the answer. Paid ONCE per method,
        // on its first run; after that this is a single boolean read. A method caught here is marked
        // async for good, so every later request awaits it.
        if (executable.asyncChecked !== true) {
          executable.asyncChecked = true;
          if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
            (executable as Mutable<RemoteMethod>).isAsync = true;
            result = await result;
          }
        }
      }

      if (result === undefined) continue;
      // ONE read answers "is this a mion error", for every branch below. The brand is an own property
      // on every TypedError/RpcError/FatalError and on every copy that came off the wire, so nothing
      // else has to be asked. A non-error result (the common case) pays this read plus, at most, the
      // native-error check.
      // `null` is a valid answer and reading a property off it throws, so it is excluded first
      const isMionError = result !== null && result['mion@isΣrrθr'] === true;
      if (!executable.hasReturnData) {
        // a raw middleFn has no declared return type, so a returned error is undeclared: it halts and
        // travels in @thrownErrors like a thrown one (its body slot is never serialized)
        if (isMionError || isNativeError(result)) onExecutableError(context, executable, result);
        continue;
      }
      if (isMionError) {
        // a returned FatalError ends the chain but stays in its own typed slot below; it is a declared
        // answer, so without a statusCode of its own it reads as an application error, never unexpected.
        // A plain RpcError is declared too: it stays in its slot and the chain keeps running.
        if (result.isFatal === true) markResponseFailed(context, result, StatusCodes.APPLICATION_ERROR);
      }
      // An Error mion cannot represent is a bug, not data: without this it would be serialized into
      // the body and served as a SUCCESSFUL answer. It carries no brand, so it has no typed slot to
      // land in, and it takes the thrown path instead.
      else if (isNativeError(result)) {
        onExecutableError(context, executable, result);
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
      (response.body as Mutable<AnyObject>)[executable.id] = result;
    } catch (err: any) {
      // All thrown errors are undeclared and fatal
      onExecutableError(context, executable, err);
    }
  }
  return context.response;
}

// The three callers below are NOT async: awaiting the handler only to return its value adds a
// promise frame per chain member. Returning it hands back the same value, or the same promise, and
// the loop's own await and try/catch still cover both.
function runRawMiddleFn(
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

function runHeadersMiddleFn(context: CallContext, executable: HeadersMethod, request: MionRequest) {
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

function runRouteOrMiddleFn(context: CallContext, executable: HeadersMethod, request: MionRequest) {
  const params = sanitizeParams(
    deserializeBodyParamsOrThrow(request, executable as RemoteMethod),
    request,
    executable as RemoteMethod
  );
  if (executable.options.validateParams) validateParametersOrThrow(params, executable as RemoteMethod);
  return executable.handler(context, ...params);
}

/**
 * sanitizeParams: applies the rewrites the params types declare under a format's `transform` key
 * (trim / case / replace / stripSeparators) in place, after decode and BEFORE validation, when the
 * resolved route option is on and the compiled formatTransform is a live entry. Params only: headers
 * and return values are never sanitized. A transform over wrong-shaped input can throw (`.trim()` on
 * a number): the raw params fall through so validation reports the real error instead of a 500.
 */
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
  if (type === HandlerType.rawMiddleFn) return runRawMiddleFn;
  if (type === HandlerType.headersMiddleFn) return runHeadersMiddleFn;
  return runRouteOrMiddleFn;
}

/** The caller already stored on a registered method. */
export function getMethodCaller(executable: RemoteMethod) {
  return executable.methodCaller;
}

/** Shared, for the members whose id is absent from the body: allocating a fresh empty array per
 *  member per request bought nothing. Frozen, so a handler that tried to mutate its params fails
 *  loudly instead of corrupting the next request. Nothing can reach it anyway: an empty tuple is
 *  spread into the call, so no argument is ever passed. */
const EMPTY_PARAMS: any[] = [];
Object.freeze(EMPTY_PARAMS);

function deserializeBodyParamsOrThrow(request: MionRequest, executable: RemoteMethod): any[] {
  const params: any[] = (request.body[executable.id] as any[]) || EMPTY_PARAMS;
  // For binary requests, params are already deserialized in the serializer middleFn
  // (deserializeBinaryRequestBody in serializer.routes.ts)
  if (request.bodyType === SerializerModes.binary) return params;

  // For JSON requests, the compiled decoder of the params strategy restores the typed shape
  const {decode} = executable.paramsJitFns.json;
  if (decode.isNoop) return params;
  try {
    (request.body as Mutable<MionRequest['body']>)[executable.id] = decode.fn(params);
    return request.body[executable.id] as any[];
  } catch (e: any) {
    if (isStackOverflow(e)) throw nestingTooDeep(executable, e);
    // Fixed text on the wire (the decoder's own message quotes internal detail); the original stays
    // on `originalError` for the server logs. `deserializeError` keeps the RTSerializationError shape.
    throw new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'serialization-error',
      publicMessage: `Invalid params '${executable.id}', can not deserialize. Parameters might be of the wrong type.`,
      originalError: e,
      errorData: {
        deserializeError: 'Parameters might be of the wrong type.',
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
  rejectUnknownKeysOrThrow(params, executable);
}

/** strictTypes: rejects params carrying properties not present in the declared types */
function rejectUnknownKeysOrThrow(params: any[], executable: RemoteMethod): void {
  if (!executable.options.strictTypes) return;
  const hasUnknownKeys = executable.paramsJitFns.hasUnknownKeys;
  if (!hasUnknownKeys || hasUnknownKeys.isNoop) return;
  if (hasUnknownKeys.fn(params)) {
    const unknownKeyErrors = executable.paramsJitFns.unknownKeyErrors;
    const validationError: ValidationError = new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'validation-error',
      publicMessage: `Invalid params in '${executable.id}', validation failed.`,
      errorData: {
        typeErrors: unknownKeyErrors && !unknownKeyErrors.isNoop ? unknownKeyErrors.fn(params) : [],
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
