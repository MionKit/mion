import type {ValidationCase} from '../validation/types.ts';

/** One expected format-error descriptor, index-parallel to a case's
 *  invalid samples. `null` means "expect at least one error but assert
 *  nothing about its format payload". A descriptor asserts the named
 *  format error is present and, when provided, its `val` and the tail
 *  of its `formatPath`. **/
export interface FormatErrorExpectation {
  /** `format.name` — e.g. 'stringFormat' | 'uuid' | 'date' | 'time' |
   *  'dateTime' | 'ip' | 'domain' | 'email' | 'url'. **/
  name: string;
  /** `format.val` to assert (deep-equal). Omit to skip. **/
  val?: unknown;
  /** Last segment of `format.formatPath` to assert. Omit to skip. **/
  formatPathTail?: string;
}

/** A format validation case — a `ValidationCase` (validate / getValidationErrors
 *  / mockType thunks + samples) plus the optional format-error
 *  expectations consumed by the format getValidationErrors adapter. **/
export type FormatValidationCase = ValidationCase & {
  expectedFormatErrors?: () => Array<FormatErrorExpectation | null>;
};
