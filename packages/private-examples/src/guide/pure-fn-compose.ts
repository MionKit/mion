import {registerPureFnFactory} from '@mionjs/run-types/runtime';
import {slugify} from './custom-pure-fn.js';

export const slugList = registerPureFnFactory(function (utl) {
  // recorded at build time: slugify ships with slugList, and a typo fails the build
  const toSlug = utl.getPureFn(slugify) as (input: string) => string;
  return function _slugList(values: string[]): string[] {
    return values.map((value) => toSlug(value));
  };
});
