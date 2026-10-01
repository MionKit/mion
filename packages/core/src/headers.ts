/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type DataOnly, type GetValidationErrorsFn, type InjectTypeFnArgs, type ValidateFn} from '@mionjs/run-types';
import {registerClassSerializer} from '@mionjs/run-types/runtime';
import {FatalError} from './errors.ts';
import {StatusCodes} from './constants.ts';
import {headerCheckFnsFromMarker} from './runtypes/mionAdapter.ts';
import type {RunTypeError} from './types/general.types.ts';

/** Type-safe wrapper for HTTP headers, checked against its own type when built by a mion build */
export class HeadersSubset<Required extends string, Optional extends string = never> {
  readonly headers: {[K in Required]: string} & {[K in Optional]?: string};
  // NoInfer keeps Optional out of argument inference, so it comes from the declared return type or stays never.
  constructor(
    headers: {[K in Required]: string} & {[K in NoInfer<Optional>]?: string},
    fns?: InjectTypeFnArgs<HeadersSubset<Required, Optional>, 'validate', 'validationErrors'>
  ) {
    this.headers = headers;
    if (fns !== undefined) checkHeadersOrThrow(this, fns);
  }
}

/** Thrown when a HeadersSubset is built with a missing or invalid header. */
export type HeadersValidationError = FatalError<'headers-validation-error', {typeErrors: RunTypeError[]}>;

type HeaderCheckFns = {isType: ValidateFn; typeErrors: GetValidationErrorsFn};

// The injected array is a fresh literal per call, so the cache keys on its first entry tuple, a module constant.
const checkFnsCache = new WeakMap<object, HeaderCheckFns>();

function checkHeadersOrThrow(subset: HeadersSubset<string, string>, fns: unknown): void {
  const cacheKey = Array.isArray(fns) && typeof fns[0] === 'object' && fns[0] !== null ? (fns[0] as object) : undefined;
  let checkFns = cacheKey ? checkFnsCache.get(cacheKey) : undefined;
  if (!checkFns) {
    checkFns = headerCheckFnsFromMarker(fns, 'HeadersSubset');
    if (cacheKey) checkFnsCache.set(cacheKey, checkFns);
  }
  if (checkFns.isType(subset)) return;
  const error: HeadersValidationError = new FatalError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'headers-validation-error',
    publicMessage: 'Invalid headers, validation failed.',
    errorData: {typeErrors: checkFns.typeErrors(subset)},
  });
  throw error;
}

/** Builds a HeadersSubset with no check, for a map already checked elsewhere; keeps `instanceof`. */
export function trustedHeadersSubset<Required extends string, Optional extends string = never>(
  headers: {[K in Required]: string} & {[K in Optional]?: string}
): HeadersSubset<Required, Optional> {
  const subset = Object.create(HeadersSubset.prototype) as {headers: typeof headers};
  subset.headers = headers;
  return subset as HeadersSubset<Required, Optional>;
}

// ############# HeadersSubset -> mion class serializer #############
// Registered alongside the class so decoders rebuild a real instance: dispatch tests `instanceof HeadersSubset`.
// `deserialize` is required because the constructor takes the headers map, so the zero-arg default raises CLS002.
// The route's own fns check the decoded body, so the rebuild skips the constructor's check.
// ⚠️ The registry is keyed by class NAME, so ONE registration covers EVERY generic instantiation.
registerClassSerializer<HeadersSubset<string, string>>(HeadersSubset, {
  deserialize: (data: DataOnly<HeadersSubset<string, string>>) => trustedHeadersSubset(data.headers),
});
