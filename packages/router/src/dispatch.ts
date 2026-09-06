/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders, RawRequestBody} from './types/context.ts';
import {type RouterOptions} from './types/general.ts';
import {HeadersMethod, RemoteMethod, RawMethod} from './types/remoteMethods.ts';
import {getRouterOptions} from './router.ts';
import {Mutable, AnyObject, StatusCodes, HeadersSubset, SerializerModes, SerializerCode} from '@mionjs/core';
import {RpcError, FatalError, HandlerType, ValidationError, isRpcError, isFatalError, isAnyError} from '@mionjs/core';
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

  try {
    await runExecutionChain(context, rawRequest, rawResponse, opts);
    return context.response;
  } catch (err: any) {
    // this should never happen, exceptions should be handled inside runExecutionChain
    return Promise.reject(err);
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
  const {response, request} = context;
  const executionList = context.executionChain.methods;
  (response as Mutable<MionResponse>).serializer = context.executionChain.serializer;
  for (let i = 0; i < executionList.length; i++) {
    const executable = executionList[i];
    if (response.hasErrors && !executable.options.alwaysRun) continue;

    try {
      const methodCaller = executable.methodCaller || getMethodCaller(executable);
      // runRawMiddleFn , runHeadersMiddleFn & runRouteOrMiddleFn must always accept the same parameters in the same order
      const result = await methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);

      if (result === undefined) continue;
      if (!executable.hasReturnData) {
        // a raw middleFn has no declared return type, so a returned error is undeclared: it halts and
        // travels in @thrownErrors like a thrown one (its body slot is never serialized)
        if (isAnyError(result)) onExecutableError(context, executable, result);
        continue;
      }
      // a returned FatalError ends the chain but stays in its own typed slot below; it is a declared
      // answer, so without a statusCode of its own it reads as an application error, never unexpected
      if (isFatalError(result)) markResponseFailed(context, result, StatusCodes.APPLICATION_ERROR);
      // An Error mion cannot represent is a bug, not data: without this it would be serialized into
      // the body and served as a SUCCESSFUL answer. It carries no brand, so it has no typed slot to
      // land in, and it takes the thrown path instead. A plain RpcError is NOT this: it is declared,
      // so it stays in its own slot and the chain keeps running.
      else if (!isRpcError(result) && isAnyError(result)) {
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

async function runRawMiddleFn(
  context: CallContext,
  executable: RawMethod,
  req,
  resp,
  opts: RouterOptions,
  rawRequest: unknown,
  rawResponse: unknown
) {
  const result = await executable.handler(context, rawRequest, rawResponse, opts);
  return result;
}

async function runHeadersMiddleFn(context: CallContext, executable: HeadersMethod, request: MionRequest) {
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

  const result = await executable.handler(context, headersSubset, ...params);
  return result;
}

async function runRouteOrMiddleFn(context: CallContext, executable: HeadersMethod, request: MionRequest) {
  const params = sanitizeParams(
    deserializeBodyParamsOrThrow(request, executable as RemoteMethod),
    request,
    executable as RemoteMethod
  );
  if (executable.options.validateParams) validateParametersOrThrow(params, executable as RemoteMethod);
  const result = await executable.handler(context, ...params);
  return result;
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

/** The caller for a method's kind, assigned lazily on the method the first time it runs. */
export function getMethodCaller(executable: RemoteMethod) {
  if (executable.type === HandlerType.rawMiddleFn) {
    executable.methodCaller = runRawMiddleFn;
  } else if (executable.type === HandlerType.headersMiddleFn) {
    executable.methodCaller = runHeadersMiddleFn;
  } else {
    executable.methodCaller = runRouteOrMiddleFn;
  }
  return executable.methodCaller;
}

function deserializeBodyParamsOrThrow(request: MionRequest, executable: RemoteMethod): any[] {
  const params: any[] = (request.body[executable.id] as any[]) || [];
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
