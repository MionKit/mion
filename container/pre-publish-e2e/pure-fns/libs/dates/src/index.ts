import {registerPureFnFactory} from '@mionjs/run-types/runtime';
import {slugify} from '@acme/text';

export const isoDay = registerPureFnFactory(function (utl) {
  return function _isoDay(label: string, day: string): string {
    return utl.getPureFn(slugify)(label) + '@' + day.slice(0, 10);
  };
});
