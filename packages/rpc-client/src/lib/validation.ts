/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import {getMethod, useMethodFns} from './methods.ts';
import type {RunTypeError} from '@mionjs/core';
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
export function getResponseError(id: string, value: unknown): RpcError<'response-validation-error'> | undefined {
  const method = useMethodFns(id);
  if (!method.hasReturnData || method.headersReturn) return;
  const returnJit = method.returnJitFns;
  if (returnJit.isType.isNoop) return;
  try {
    if (returnJit.isType.fn(value)) return;
    return new RpcError({
      type: 'response-validation-error',
      publicMessage: `Invalid response from Route or Middleware '${method.id}', validation failed.`,
      errorData: {typeErrors: returnJit.typeErrors.fn(value) as RunTypeError[]},
    });
  } catch (e: any) {
    return new RpcError({
      type: 'response-validation-error',
      publicMessage: `Could not validate response from Route or Middleware '${method.id}': ${e.message}`,
    });
  }
}

function getTypeErrors(id: string, params: any[]): void | RpcError<'validation-error' | 'unexpected-validation-error'> {
  const method = useMethodFns(id);
  if (!method.paramsCount) return;
  const paramsJit = method.paramsJitFns;
  if (paramsJit.typeErrors.isNoop) return;
  try {
    const errors: RunTypeError[] | undefined = paramsJit.isType.fn(params)
      ? undefined
      : (paramsJit.typeErrors.fn(params) as RunTypeError[]);
    // No separate strict pass: whatever key check the route's parser strategy asked for is compiled into isType.
    if (errors?.length) {
      return new RpcError({
        type: 'validation-error',
        publicMessage: `Invalid params for Route or Middleware '${method.id}', validation failed.`,
        errorData: {typeErrors: errors},
      });
    }
  } catch (e: any) {
    return new RpcError({
      type: 'unexpected-validation-error',
      publicMessage: `Could not validate params for Route or Middleware '${method.id}': ${e.message} `,
    });
  }
}
