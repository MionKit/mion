import type * as TF from '@mionjs/run-types/formats';

// Add a brand name (the 2nd type arg) and the format becomes a NOMINAL type.
// A plain string is no longer assignable: you must opt in with `as`.
type UserId = TF.String<{minLength: 1}, 'UserId'>;
type Cents = TF.Number<{min: 0; integer: true}, 'Cents'>;

// A bare string won't fit. That's the point. Cast at the boundary where
// you've actually checked the value.
const id = 'usr_abc123' as UserId;
const price = 4999 as Cents;

// Now UserId and Cents don't mix with each other or with raw string/number.
function chargeUser(_user: UserId, _amount: Cents): void {}
chargeUser(id, price); // ok

export {id, price, chargeUser};
export type {UserId, Cents};
