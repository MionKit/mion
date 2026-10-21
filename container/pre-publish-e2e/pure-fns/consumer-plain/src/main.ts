import {registerPureFnFactory} from '@mionjs/run-types/runtime';
import {padId} from '@acme/plain';

export const pad = registerPureFnFactory(function (utl) {
  return function _pad(n: number): string {
    return utl.getPureFn(padId)(n);
  };
});
