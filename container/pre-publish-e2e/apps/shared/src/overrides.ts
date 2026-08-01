// Family 13 — Custom function overrides + custom pure functions.
//   - overrideValidate<T>(fn) makes createValidateFn<T>() return the custom
//     (stricter) function instead of the generated one.
//   - registerPureFnFactory registers a self-contained helper the build inlines
//     (guide/custom-pure-fn.ts).
//
// The custom pure fn is exercised HERE against the PUBLISHED package. A
// consumer's own registerPureFnFactory alongside any built-in-referencing
// feature (this shared app uses createGetValidationErrorsFn, unknown-key errors,
// formats, …) used to trip a false-positive PFE9012 wall: the consumer's
// registration defeated the resolver's whole-program "any registration present?"
// guard, and every runtime-owned rt:: / rtFormats:: built-in was then flagged
// missing, halting the build. Fixed by exempting those built-in namespaces from
// the missing-dep check.
import {createValidateFn, overrideValidate, registerPureFnFactory, getRTUtils} from '@ts-runtypes/core';
import {type CheckResult, ok, eq} from './check';

interface Widget {
  id: number;
}

// Override the generated validator with a stricter one: id must be EVEN. The
// pure function is self-contained (no outer captures), a PureFunction.
overrideValidate<Widget>(function isEvenWidget(value: unknown): value is Widget {
  const candidate = value as {id?: unknown} | null;
  return typeof candidate === 'object' && candidate !== null && typeof candidate.id === 'number' && candidate.id % 2 === 0;
});
export const isWidget = createValidateFn<Widget>();

// A consumer-registered custom pure function — self-contained, no outer
// captures. Its mere presence is what defeated the old PFE9012 guard.
export const slugify = registerPureFnFactory('app::slugify', function () {
  const NON_WORD = /[^a-z0-9]+/g;
  return function _slugify(input: string): string {
    return input.toLowerCase().replace(NON_WORD, '-').replace(/^-|-$/g, '');
  };
});

export function checkOverrides(): CheckResult[] {
  // Resolve + invoke the consumer's own pure fn through the runtime registry.
  const runSlugify = getRTUtils().usePureFn('app::slugify') as (input: string) => string;
  return [
    // The override's extra rule (even-only) proves it replaced the generated fn.
    ok('overrides: overrideValidate accepts a value matching the custom rule', isWidget({id: 2})),
    ok('overrides: overrideValidate rejects a value the custom rule excludes', !isWidget({id: 3})),
    ok('overrides: overrideValidate still rejects the wrong shape', !isWidget({id: 'x'})),
    // The consumer's registerPureFnFactory coexists with built-in-referencing
    // features (no false-positive PFE9012 halt) AND resolves + runs at runtime.
    eq('overrides: custom registerPureFnFactory resolves and runs', runSlugify('Hello, World!'), 'hello-world'),
  ];
}
