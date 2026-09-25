import {type PureFunction, type InjectPureFnId} from '@mionjs/run-types';
import {registerPureFn} from '@mionjs/run-types/runtime';

export function registerAcmePureFn<F extends (...args: any[]) => any>(
  fn: PureFunction<F>,
  id?: InjectPureFnId<F> // the build injects the id at every call site of the wrapper
) {
  if (!id) throw new Error('mion plugin did not run');
  return registerPureFn(fn, id);
}

// a consumer passes only the function and gets back the id of its own binding
export const compiledUpper = registerAcmePureFn((s: string): string =>
  s.toUpperCase()
);
