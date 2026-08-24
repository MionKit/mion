import {registerPureFn} from '@ts-runtypes/core';

// The direct form is the ergonomic twin of registerPureFnFactory: you pass the
// pure function itself, no factory wrapper, and the compiler wraps it for you.
// Reach for it when the helper needs no one-time setup and composes no siblings.
// The same "namespace::name" id keeps it easy to find and reference by name.

export const double = registerPureFn('app::double', (input: number): number => input * 2);
