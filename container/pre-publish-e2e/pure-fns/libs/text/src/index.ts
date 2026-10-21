import {registerPureFn, registerPureFnFactory} from '@mionjs/run-types/runtime';

export const slugify = registerPureFn((s: string): string => s.trim().toLowerCase().replace(/\s+/g, '-'));

export const title = registerPureFnFactory(function (utl) {
  return function _title(s: string): string {
    return utl.getPureFn(slugify)(s) + '!';
  };
});
