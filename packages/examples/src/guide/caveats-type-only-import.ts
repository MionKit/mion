import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';
// The Format* aliases are types, so `import type` reads naturally, and it's
// fine here, because the alias is used purely at the type level.

// This works: createValidateFn is a real value import, the format is a type.
type Contact = {email: TF.Email};
const isContact = createValidateFn<Contact>();

// The trap is the OTHER direction: don't `import type { createValidateFn }`.
// A type-only import of a function erases it at runtime: the call would be
// gone and nothing gets generated. Import the factories as VALUES.

isContact({email: 'ada@example.com'}); // true

export {isContact};
export type {Contact};
