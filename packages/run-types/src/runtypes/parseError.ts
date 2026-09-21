// RTParseError — thrown by `createParseFn<T>()` when the value does not match `T`. It carries the SAME entries
// `createGetValidationErrorsFn<T>()` returns for the restored value, so a caller that already renders those needs no second code path.

import type {RTValidationError, TypeFormatError} from '../createRTFunctions.ts';

/** The signal an emitted parse body throws. NOT an Error: it is caught and discarded one frame up, so a stack would only cost the cold path. **/
// It carries the RESTORED value, which makes the issues match `getValidationErrors(restore(v))` instead of flagging every wire-shaped Date as a type error.
export class ParseMismatch {
  readonly value: unknown;
  /** The raw throw from a restore arm; undefined when the value simply did not validate. */
  readonly cause: unknown;

  constructor(value: unknown, cause?: unknown) {
    this.value = value;
    this.cause = cause;
  }
}

/** The report when DESERIALIZING threw: a restore arm assumes well-formed input, so junk makes it throw before any check runs. **/
// The data behind mion's `RpcError<'serialization-error'>`, so the router can wrap it without restating the shape
// (see `deserializeBodyParamsOrThrow` in @mionjs/router); `deserializeError` matches the field that error already carries.
export interface RTSerializationError {
  deserializeError: string;
}

/** `issues` is ONE of the two failures parse can have, never a mix: the value deserialized and did not match `T`, or deserializing THREW so no check ran. **/
// Split out rather than folded into the array because the two are different failures with different fixes, the split @mionjs/router already makes.
// `cause` carries the original throw on the serialization arm and is undefined on the validation arm, where nothing threw.
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

export function isSerializationError(issues: RTValidationError[] | RTSerializationError): issues is RTSerializationError {
  return !Array.isArray(issues);
}

/** The first issue is spelled out because it is what a stack trace or an unhandled rejection shows. **/
// The rest are counted, not listed, so a wholly-wrong payload cannot produce a thousand-line message.
function parseErrorMessage(issues: RTValidationError[] | RTSerializationError): string {
  // The deserialization arm has no path to point at: the walk threw partway, so its message is the only account of what went wrong.
  if (isSerializationError(issues)) return `parse failed, can not deserialize: ${issues.deserializeError}`;
  if (issues.length === 0) return 'parse failed';
  const first = issues[0]!;
  const at = first.path.length === 0 ? 'value' : first.path.map(pathSegmentLabel).join('.');
  const head = `parse failed at ${at}: expected ${first.expected}`;
  return issues.length === 1 ? head : `${head} (+${issues.length - 1} more)`;
}

/** Map / Set entries carry which side of the entry tripped, so they read as `0[mapKey]` rather than a bare index. **/
function pathSegmentLabel(segment: RTValidationError['path'][number]): string {
  if (typeof segment === 'object' && segment !== null) {
    return segment.failed === undefined ? String(segment.key) : `${segment.key}[${segment.failed}]`;
  }
  return String(segment);
}
