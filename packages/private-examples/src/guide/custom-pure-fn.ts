import {registerPureFnFactory} from '@mionjs/run-types/runtime';

// You get back the helper's id: your package name plus a hash of the helper, like '@acme/text#pf_9Zt1bRm4cVaPqL'.
export const slugify = registerPureFnFactory(function () {
  // Anything declared INSIDE the factory is fine: it ships with the helper.
  const NON_WORD = /[^a-z0-9]+/g;
  return function _slugify(input: string): string {
    return input.toLowerCase().replace(NON_WORD, '-').replace(/^-|-$/g, '');
  };
});
