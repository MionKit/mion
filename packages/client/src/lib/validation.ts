/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import {getMethod, useMethodFns} from './methods.ts';
import type {RunTypeError} from '@mionjs/core';
import {RequestErrors, SubRequest} from '../types.ts';
import type {MionClientRequest} from '../request.ts';

export function validateSubRequests(
  subRequestIds: string[],
  req: MionClientRequest<any, any>,
  errors: RequestErrors,
  validateRouteMiddleFns = true
): void {
  if (!req.options.validateParams) return;
  subRequestIds.forEach((id) => {
    const subRequest = req.subRequestList[id];
    validateSubRequest(id, subRequest, errors);
    const methodMeta = getMethod(id);
    if (validateRouteMiddleFns && methodMeta?.middleFnIds?.length) {
      const validMiddleFnIds = methodMeta.middleFnIds.filter((middleFnId) => middleFnId != null);
      validateSubRequests(validMiddleFnIds, req, errors, validateRouteMiddleFns);
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

function getTypeErrors(id: string, params: any[]): void | RpcError<'validation-error' | 'unexpected-validation-error'> {
  const method = useMethodFns(id);
  if (!method.paramsCount) return;
  const paramsJit = method.paramsJitFns;
  if (paramsJit.typeErrors.isNoop) return;
  try {
    const errors: RunTypeError[] | undefined = paramsJit.isType.fn(params)
      ? undefined
      : (paramsJit.typeErrors.fn(params) as RunTypeError[]);
    // The route's parser strategy already picked the validator, so isType answers for undeclared keys too.
    if (errors?.length) {
      return new RpcError({
        type: 'validation-error',
        publicMessage: `Invalid params for Route or MiddleFn '${method.id}', validation failed.`,
        errorData: {typeErrors: errors},
      });
    }
  } catch (e: any) {
    return new RpcError({
      type: 'unexpected-validation-error',
      publicMessage: `Could not validate params for Route or MiddleFn '${method.id}': ${e.message} `,
    });
  }
}
