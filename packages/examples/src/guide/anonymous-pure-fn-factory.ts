import {registerAnonymousPureFnFactory} from '@ts-runtypes/core';

// The factory twin of the anonymous lane. Use it when the helper needs one-time
// setup (a compiled regex, a lookup table) or wants to compose another pure fn
// through the factory utilities. You pass the factory; the compiler still
// derives and injects a stable identity from the factory body, so it stays
// wrappable and content addressed just like the direct form.

export const compiledSlug = registerAnonymousPureFnFactory(function () {
  const NON_WORD = /[^a-z0-9]+/g;
  return function _slug(input: string): string {
    return input.toLowerCase().replace(NON_WORD, '-').replace(/^-|-$/g, '');
  };
});
