import {registerPureFnFactory} from '@ts-runtypes/core';

// Pure functions are tiny, self-contained helpers the build can inline into
// the generated (JIT) code. The factory returns the real function; it must
// be self-contained: no outer-scope captures, no `this`, no await/yield.

export const slugify = registerPureFnFactory('app::slugify', function () {
  // Anything declared INSIDE the factory is fine: it ships with the helper.
  const NON_WORD = /[^a-z0-9]+/g;
  return function _slugify(input: string): string {
    return input.toLowerCase().replace(NON_WORD, '-').replace(/^-|-$/g, '');
  };
});
