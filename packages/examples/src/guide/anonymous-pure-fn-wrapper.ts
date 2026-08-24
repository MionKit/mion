import {registerAnonymousPureFn, type PureFunction, type InjectPureFnHash} from '@ts-runtypes/core';

// A library wraps the anonymous lane behind its own register API. The two
// markers ride the signature (the argument carries PureFunction, the trailing
// slot carries InjectPureFnHash), so the compiler injects the content hash at
// every call site of the wrapper, wherever it is used, with no diagnostics.
export function registerAcmePureFn<F extends (...args: any[]) => any>(fn: PureFunction<F>, hash?: InjectPureFnHash<F>) {
  if (!hash) throw new Error('ts-runtypes plugin did not run');
  return registerAnonymousPureFn(fn, hash);
}

// A consumer of the library calls the wrapper with just the pure function.
export const compiledUpper = registerAcmePureFn((s: string): string => s.toUpperCase());
