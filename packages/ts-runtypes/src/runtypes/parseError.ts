// RTParseError — thrown by `createParseFn<T>()` when the value does not match `T`.
//
// It carries the SAME entries `createGetValidationErrorsFn<T>()` returns for the
// restored value, so a caller that already renders those (a friendly-text layer,
// an HTTP error body, a form binder) needs no second code path for parse
// failures.

import type {RTValidationError} from '../createRTFunctions.ts';

/** Error thrown by a `createParseFn<T>()` function. `issues` is the full report,
 *  identical to `createGetValidationErrorsFn<T>()` over the same value. **/
export class RTParseError extends Error {
  readonly issues: RTValidationError[];

  constructor(issues: RTValidationError[]) {
    super(parseErrorMessage(issues));
    this.name = 'RTParseError';
    this.issues = issues;
  }
}

/** Builds the `message`. The first issue is spelled out because it is what a
 *  stack trace or an unhandled rejection shows, and "parse failed" alone sends
 *  the reader hunting through `issues`. Remaining issues are counted, not
 *  listed, so a wholly-wrong payload cannot produce a thousand-line message. **/
function parseErrorMessage(issues: RTValidationError[]): string {
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
