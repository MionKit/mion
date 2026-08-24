import {registerAnonymousPureFn} from '@ts-runtypes/core';

// The anonymous lane takes the pure function itself; the compiler wraps it into
// the zero-arg factory the runtime stores. It derives a stable identity from the
// function body and injects it for you, so there is no "namespace::name" literal
// to write. The same rules apply: the helper must be self-contained, with
// everything it needs declared inside the function.

export const compiledDouble = registerAnonymousPureFn((n: number): number => n * 2);
