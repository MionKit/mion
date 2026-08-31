// RTParseError — thrown by `createParseFn<T>()` when the value does not match `T`.
//
// It carries the SAME entries `createGetValidationErrorsFn<T>()` returns for the
// restored value, so a caller that already renders those (a friendly-text layer,
// an HTTP error body, a form binder) needs no second code path for parse
// failures.

import type {RTValidationError} from '../createRTFunctions.ts';

/** The signal an emitted parse body throws when the value does not match. NOT an
 *  Error: it is caught and discarded one frame up, so it never needs a stack,
 *  and building one would put the cost of a failure on a path that is already
 *  the cold path.
 *
 *  It carries the RESTORED value rather than the input, because that is what the
 *  report has to be built from — restoring first is what makes the issues match
 *  `getValidationErrors(restore(v))` instead of flagging every wire-shaped Date
 *  as a type error. **/
export class ParseMismatch {
  readonly value: unknown;
  /** The raw throw from a restore arm, when that is what failed. Undefined when
   *  the value simply did not validate. */
  readonly cause: unknown;

  constructor(value: unknown, cause?: unknown) {
    this.value = value;
    this.cause = cause;
  }
}

/** The one issue that is not a type mismatch: the value is not the JSON form of
 *  `T` at all, so decoding it threw before any check ran. Reported at the root,
 *  because a restore failure is about the payload rather than one property. **/
export const NOT_JSON_FORM = 'jsonForm';

/** Error thrown by a `createParseFn<T>()` function. `issues` is the full report,
 *  identical to `createGetValidationErrorsFn<T>()` over the same value.
 *
 *  It is never EMPTY. Almost always the report explains itself: a restore arm
 *  throws precisely because the leaf is still in wire form, which is what the
 *  validator then flags, at that leaf's path. A union can break that, though,
 *  because its members are decoded through an indexed envelope: give
 *  `{n: bigint | string}` a bare `'nope'` instead of the `[0,'nope']` the encoder
 *  writes, and the decode throws while the undecoded value still satisfies the
 *  `string` member, so validating it comes back clean. Rather than report a
 *  failure with no issues, that case reports `{path: [], expected: 'jsonForm'}`,
 *  and `cause` carries the original throw. **/
export class RTParseError extends Error {
  readonly issues: RTValidationError[];

  constructor(issues: RTValidationError[], cause?: unknown) {
    const reported = issues.length > 0 ? issues : [{path: [], expected: NOT_JSON_FORM}];
    super(parseErrorMessage(reported), cause === undefined ? undefined : {cause});
    this.name = 'RTParseError';
    this.issues = reported;
  }
}

/** Builds the `message`. The first issue is spelled out because it is what a
 *  stack trace or an unhandled rejection shows, and "parse failed" alone sends
 *  the reader hunting through `issues`. Remaining issues are counted, not
 *  listed, so a wholly-wrong payload cannot produce a thousand-line message. **/
function parseErrorMessage(issues: RTValidationError[]): string {
  if (issues.length === 0) return 'parse failed';
  const first = issues[0]!;
  // The root-level decode failure reads as a sentence rather than through the
  // "expected <type>" frame, which would say "expected jsonForm".
  if (first.expected === NOT_JSON_FORM && first.path.length === 0) {
    return 'parse failed: the value is not the JSON form of this type';
  }
  const at = first.path.length === 0 ? 'value' : first.path.map(pathSegmentLabel).join('.');
  const head = `parse failed at ${at}: expected ${first.expected}`;
  return issues.length === 1 ? head : `${head} (+${issues.length - 1} more)`;
}

/** Renders one path segment. Map / Set entries carry an index plus which side of
 *  the entry tripped, so those read as `0[mapKey]` rather than a bare index. **/
function pathSegmentLabel(segment: RTValidationError['path'][number]): string {
  if (typeof segment === 'object' && segment !== null) {
    return segment.failed === undefined ? String(segment.key) : `${segment.key}[${segment.failed}]`;
  }
  return String(segment);
}
