import {registerPureFnFactory} from '@mionjs/run-types';

// Pure functions are tiny, self-contained helpers the build can inline into
// the generated code. The factory returns the real function; it must be
// self-contained: no outer-scope captures, no `this`, no await/yield.
// The registrar gives it back its id: your package name plus a short hash of
// the helper itself, like '@acme/text#9Zt1bRm4cVaPqL'. Rename it, rename what
// you export it as, or move it to another file in the same package and the id
// stays put. Edit the helper and you get a new id, because it is a new helper.

export const slugify = registerPureFnFactory(function () {
  // Anything declared INSIDE the factory is fine: it ships with the helper.
  const NON_WORD = /[^a-z0-9]+/g;
  return function _slugify(input: string): string {
    return input.toLowerCase().replace(NON_WORD, '-').replace(/^-|-$/g, '');
  };
});
