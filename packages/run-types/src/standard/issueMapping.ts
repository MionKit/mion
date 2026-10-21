// Maps RunTypes validation errors to Standard Schema issues for `createStandardSchema`'s validate. No
// plugin and no rtUtils, just a function over an in-memory array, so it is independently unit-testable.
// The mapping is LOSSLESS and recreates no path: a RTValidationError path is ALREADY a valid Standard
// Schema path, so `err.path` passes straight through and only the `message` is built.

import type {RTValidationError, RTPathSegment, TypeFormatError} from '../createRTFunctions.ts';
import type {StandardSchemaIssue} from './spec.ts';

/** A Standard Schema Issue that ALSO carries the full RTValidationError structure, with no duplication:
 *  `expected` + `format` are the structured fields the spec `message` otherwise only encodes as text.
 *  It extends StandardSchemaIssue, so an array of these stays assignable for a generic consumer. **/
export interface RTValidationIssue<Format extends TypeFormatError = TypeFormatError> extends StandardSchemaIssue {
  readonly message: string;
  readonly path: ReadonlyArray<PropertyKey | RTPathSegment>;
  readonly expected: string;
  readonly format?: Format;
}

/** The `message` hook replaces the default mechanical derivation: the seam a friendly renderer plugs into. **/
export interface IssueMappingOptions {
  message?: (err: RTValidationError) => string;
}

// constraintName mirrors createFriendlyText's `constraintKey`.
function constraintName(format: TypeFormatError | undefined): string {
  if (!format) return 'type';
  const tail = format.formatPath[format.formatPath.length - 1];
  return tail !== undefined ? String(tail) : format.name;
}

// primitiveBound degrades an array / object bound to undefined, so the message omits it rather than
// printing `[object Object]`.
function primitiveBound(val: TypeFormatError['val']): string | number | bigint | boolean | undefined {
  return typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint' || typeof val === 'boolean'
    ? val
    : undefined;
}

// defaultMessage derives a mechanical, dependency-free message; human-readable phrasing is the
// friendly-map's job, wired through IssueMappingOptions.message. The parenthesized bound appears only
// when it informs: a WILDCARD 'any' bound means the FORMAT itself failed, so the format name replaces
// the sub-constraint, and a bound that merely echoes the constraint name is dropped too.
function defaultMessage(err: RTValidationError): string {
  if (err.expected === 'circular') return 'Circular reference';
  if (!err.format) return `Expected ${err.expected}`;
  const constraint = constraintName(err.format);
  const bound = primitiveBound(err.format.val);
  if (bound === 'any') return `Failed ${err.format.name} constraint`;
  if (bound === undefined || String(bound) === constraint) return `Failed ${constraint} constraint`;
  return `Failed ${constraint} constraint (${String(bound)})`;
}

/** One issue per error: the path passes through unchanged, `expected` / `format` are preserved, and
 *  only `message` is derived (override it via `options.message`). **/
export function runTypeErrorsToIssues<Format extends TypeFormatError>(
  errs: RTValidationError<Format>[],
  options?: IssueMappingOptions
): RTValidationIssue<Format>[] {
  const render = options?.message ?? defaultMessage;
  return errs.map((err) => ({
    message: render(err),
    path: err.path,
    expected: err.expected,
    ...(err.format ? {format: err.format} : {}),
  }));
}
