// RTParseError — thrown by `createParseFn<T>()` when the value does not match `T`.
//
// It carries the SAME entries `createGetValidationErrorsFn<T>()` returns for the
// restored value, so a caller that already renders those (a friendly-text layer,
// an HTTP error body, a form binder) needs no second code path for parse
// failures.

import type {RTValidationError, TypeFormatError} from '../createRTFunctions.ts';

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

/** The report when DESERIALIZING threw, rather than the value failing a check.
 *  A restore arm assumes well-formed input (`BigInt(v)`, `Temporal.X.from(v)`,
 *  the union's indexed envelope), so junk makes it throw before any check runs.
 *
 *  This is the data behind mion's `RpcError<'serialization-error'>`, the same
 *  way `RTValidationError` is the data behind its `'validation-error'`, so the
 *  router can wrap it without restating the shape (see
 *  `deserializeBodyParamsOrThrow` in @mionjs/router). `deserializeError` is the
 *  underlying message, matching the field that error already carries. **/
export interface RTSerializationError {
  deserializeError: string;
}

/** Error thrown by a `createParseFn<T>()` function.
 *
 *  `issues` is ONE of the two failures parse can have, never a mix:
 *
 *  - `RTValidationError[]` — the value deserialized, then did not match `T`.
 *    Identical to what `createGetValidationErrorsFn<T>()` reports for it, so a
 *    caller already rendering those needs no second code path.
 *  - `RTSerializationError` — deserializing THREW, so no check ever ran. Split
 *    out rather than folded into the array because the two are different
 *    failures with different fixes, which is the split `@mionjs/router` already
 *    makes between its `'serialization-error'` and `'validation-error'`.
 *
 *  `cause` carries the original throw on the serialization arm, and is
 *  undefined on the validation arm, where nothing threw. **/
export class RTParseError<Format extends TypeFormatError = TypeFormatError> extends Error {
  readonly issues: RTValidationError<Format>[] | RTSerializationError;
  readonly cause: unknown;

  constructor(issues: RTValidationError<Format>[] | RTSerializationError, cause?: unknown) {
    super(parseErrorMessage(issues), cause === undefined ? undefined : {cause});
    this.name = 'RTParseError';
    this.issues = issues;
    this.cause = cause;
  }
}

/** Narrows `issues` to the deserialization arm. **/
export function isSerializationError(issues: RTValidationError[] | RTSerializationError): issues is RTSerializationError {
  return !Array.isArray(issues);
}

/** Builds the `message`. The first issue is spelled out because it is what a
 *  stack trace or an unhandled rejection shows, and "parse failed" alone sends
 *  the reader hunting through `issues`. Remaining issues are counted, not
 *  listed, so a wholly-wrong payload cannot produce a thousand-line message. **/
function parseErrorMessage(issues: RTValidationError[] | RTSerializationError): string {
  // The deserialization arm has no path to point at: the walk threw partway, so
  // the underlying message is the only account of what went wrong.
  if (isSerializationError(issues)) return `parse failed, can not deserialize: ${issues.deserializeError}`;
  if (issues.length === 0) return 'parse failed';
  const first = issues[0]!;
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
