import {
  registerPureFn,
  type PureFunction,
  type InjectPureFnId,
} from '@mionjs/run-types';

// A library wraps the registrar behind its own API. The two markers ride the
// signature (the argument carries PureFunction, the trailing slot carries
// InjectPureFnId), so the compiler injects the id at every call site of the
// wrapper, wherever it is used, with no diagnostics.
export function registerAcmePureFn<F extends (...args: any[]) => any>(
  fn: PureFunction<F>,
  id?: InjectPureFnId<F>
) {
  if (!id) throw new Error('mion plugin did not run');
  return registerPureFn(fn, id);
}

// A consumer of the library calls the wrapper with just the pure function, and
// gets back the id of its own binding.
export const compiledUpper = registerAcmePureFn((s: string): string =>
  s.toUpperCase()
);
