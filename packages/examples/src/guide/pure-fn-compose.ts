import {registerPureFnFactory} from '@mionjs/run-types/runtime';
import {slugify} from './custom-pure-fn.js';

// One pure function reaching another: import its id and hand it to the factory
// utilities. The build records the dependency, so the helper always ships with
// everything it calls, and a typo is a build error rather than a runtime one.

export const slugList = registerPureFnFactory(function (utl) {
  const toSlug = utl.getPureFn(slugify) as (input: string) => string;
  return function _slugList(values: string[]): string[] {
    return values.map((value) => toSlug(value));
  };
});
