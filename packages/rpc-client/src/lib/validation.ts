/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersSubset, RpcError} from '@mionjs/core';
import {getMethod, useMethodFns} from './methods.ts';
import type {JitCompiledFunctions, RunTypeError, ValidationErrorData} from '@mionjs/core';
import type {CallContext, RequestErrors, SubRequest} from '../types.ts';

export function validateSubRequests(
  subRequestIds: string[],
  context: CallContext,
  errors: RequestErrors,
  validateRouteMiddlewares = true
): void {
  if (!context.options.validateParams) return;
  subRequestIds.forEach((id) => {
    const subRequest = context.subRequestList[id];
    validateSubRequest(id, subRequest, errors);
    const methodMeta = getMethod(id);
    if (validateRouteMiddlewares && methodMeta?.middlewareIds?.length) {
      const validMiddlewareIds = methodMeta.middlewareIds.filter((middlewareId) => middlewareId != null);
      validateSubRequests(validMiddlewareIds, context, errors, validateRouteMiddlewares);
    }
  });
  return;
}

export function validateSubRequest(id: string, subRequest: SubRequest<any>, errors: RequestErrors): void {
  if (subRequest?.error || subRequest?.isResolved) return;
  // inputFrom params hold null placeholders the server fills after the source route runs
  if (subRequest?.mappings && subRequest.mappings.length > 0) return;

  const params = subRequest?.params || [];
  const validationResponse = getTypeErrors(id, params);
  if (!validationResponse) return;
  const error = validationResponse;
  errors.set(id, error);
  if (subRequest) {
    subRequest.error = error;
    subRequest.isResolved = true;
  }
  return;
}

/** An answer the return type does not describe; undefined when it matches or the method returns nothing. */
export function getResponseError(id: string, value: unknown) {
  const method = useMethodFns(id);
  if (!method.hasReturnData) return;
  if (method.headersReturn) {
    // no header on the wire can be a valid void return, so only headers that came back are checked
    if (!(value instanceof HeadersSubset)) return;
    const jitFns = method.headersReturn.jitFns as JitCompiledFunctions;
    return checkValue(method.id, jitFns, value, 'response-validation-error', 'response-validation-error', 'headers from');
  }
  return checkValue(
    method.id,
    method.returnJitFns,
    value,
    'response-validation-error',
    'response-validation-error',
    'response from'
  );
}

function getTypeErrors(id: string, params: any[]) {
  const method = useMethodFns(id);
  if (!method.paramsCount) return;
  // No separate strict pass: the parser strategy's key check is compiled into isType.
  return checkValue(method.id, method.paramsJitFns, params, 'validation-error', 'unexpected-validation-error', 'params for');
}

/** typeErrors runs only on a miss, and a validator that throws is reported, never raised. */
function checkValue<Invalid extends string, Failed extends string>(
  methodId: string,
  jitFns: JitCompiledFunctions,
  value: unknown,
  invalidType: Invalid,
  failedType: Failed,
  subject: string
): RpcError<Invalid, ValidationErrorData> | RpcError<Failed> | undefined {
  if (jitFns.isType.isNoop) return;
  try {
    if (jitFns.isType.fn(value)) return;
    return new RpcError<Invalid, ValidationErrorData>({
      type: invalidType,
      publicMessage: `Invalid ${subject} Route or Middleware '${methodId}', validation failed.`,
      errorData: {typeErrors: jitFns.typeErrors.fn(value) as RunTypeError[]},
    });
  } catch (err: any) {
    return new RpcError<Failed>({
      type: failedType,
      publicMessage: `Could not validate ${subject} Route or Middleware '${methodId}': ${err.message}`,
    });
  }
}
