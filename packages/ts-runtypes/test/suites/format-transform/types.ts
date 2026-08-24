import type {FormatTransformFn} from '@ts-runtypes/core';

/** One format-transform case: a thunk wrapping `createFormatTransformFn<T>()`
 *  (plugin-rewritten at the call site) plus input → expected-output
 *  pairs the adapter feeds through it. **/
export interface FormatTransformCase {
  title: string;
  // `any` (not `unknown`): cases hold heterogeneous concrete returns
  // (`FormatTransformFn<FormatInteger>`, `FormatTransformFn<{…}>`, …) and the
  // fn is invariant in `T`, so only `any` accepts every case's thunk here.
  formatTransform: () => FormatTransformFn<any>;
  getCases: () => Array<{input: unknown; expected: unknown}>;
}
