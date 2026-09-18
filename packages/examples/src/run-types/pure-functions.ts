import {registerPureFn} from '@mionjs/run-types';

// Pure functions belong to RunTypes — mion registers none of its own. `registerPureFn` takes an
// INLINE function literal: the build extracts the body and compiles it ahead of time, so it has to
// see the function at the call site. What comes back is the helper's id, the value other pure
// functions import to reach it.
export const isNotEmpty = registerPureFn(
  (value: string): boolean => value.length > 0
);
