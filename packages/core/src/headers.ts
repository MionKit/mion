/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type DataOnly, type InjectTypeFnArgs} from '@mionjs/run-types';
import {registerClassSerializer} from '@mionjs/run-types/runtime';
import {FatalError, type ValidationErrorData} from './errors.ts';
import {StatusCodes} from './constants.ts';
import {headerCheckFnsFromMarker} from './runtypes/mionAdapter.ts';

/** Options a HeadersSubset carries in its type only: the build reads them, nothing sets them at runtime. */
export interface HeadersSubsetOpts<Names extends string> {
  /** false: none of these headers cross origins; a map: only the names set to false. Read only by `mionSecurity`. */
  cors?: false | {[K in Names]?: false};
}

/** Type-safe wrapper for HTTP headers, checked against its own type when built by a mion build */
export class HeadersSubset<
  Required extends string,
  Optional extends string = never,
  Opts extends HeadersSubsetOpts<Required | Optional> = Record<never, never>,
> {
  readonly headers: {[K in Required]: string} & {[K in Optional]?: string};
  /** Type only, never set at runtime: the build reads it from the compiled type */
  declare readonly opts?: Opts;
  // NoInfer keeps Optional out of argument inference, so it comes from the declared return type or stays never.
  constructor(
    headers: {[K in Required]: string} & {[K in NoInfer<Optional>]?: string},
    fns?: InjectTypeFnArgs<HeadersSubset<Required, Optional, Opts>, 'validate', 'validationErrors'>
  ) {
    this.headers = headers;
    if (fns !== undefined) checkHeadersOrThrow(this, fns);
  }
}

function checkHeadersOrThrow(subset: HeadersSubset<string, string>, fns: unknown): void {
  const checkFns = headerCheckFnsFromMarker(fns, 'HeadersSubset');
  if (checkFns.isType(subset)) return;
  throw new FatalError<'headers-validation-error', ValidationErrorData>({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'headers-validation-error',
    publicMessage: 'Invalid headers, validation failed.',
    errorData: {typeErrors: checkFns.typeErrors(subset)},
  });
}

/** Builds a HeadersSubset with no check, for a map already checked elsewhere; keeps `instanceof`. */
export function trustedHeadersSubset<Required extends string, Optional extends string = never>(
  headers: HeadersSubset<Required, Optional>['headers']
): HeadersSubset<Required, Optional> {
  return Object.assign(Object.create(HeadersSubset.prototype), {headers});
}

// ############# HeadersSubset -> mion class serializer #############
// Registered alongside the class so decoders rebuild a real instance: dispatch tests `instanceof HeadersSubset`.
// `deserialize` is required because the constructor takes the headers map, so the zero-arg default raises data-class-constructor-failed.
// The route's own fns check the decoded body, so the rebuild skips the constructor's check.
// ⚠️ The registry is keyed by class NAME, so ONE registration covers EVERY generic instantiation.
registerClassSerializer<HeadersSubset<string, string>>(HeadersSubset, {
  deserialize: (data: DataOnly<HeadersSubset<string, string>>) => trustedHeadersSubset(data.headers),
});
