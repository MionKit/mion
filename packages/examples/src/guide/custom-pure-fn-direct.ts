import {registerPureFn} from '@mionjs/run-types/runtime';

// The direct form: pass the function itself when it needs no one-time setup.
export const double = registerPureFn((input: number): number => input * 2);
