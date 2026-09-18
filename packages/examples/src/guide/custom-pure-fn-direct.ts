import {registerPureFn} from '@mionjs/run-types';

// The direct form is the ergonomic twin of registerPureFnFactory: you pass the
// pure function itself, no factory wrapper, and the compiler wraps it for you.
// Reach for it when the helper needs no one-time setup and composes no siblings.

export const double = registerPureFn((input: number): number => input * 2);
