import type * as TF from '@mionjs/run-types/formats';

type UserId = TF.String<{minLength: 1}, 'UserId'>;
type Cents = TF.Number<{min: 0; integer: true}, 'Cents'>;

// a bare string would not fit
const id = 'usr_abc123' as UserId;
const price = 4999 as Cents;

// Now UserId and Cents don't mix with each other or with raw string/number.
function chargeUser(_user: UserId, _amount: Cents): void {}
chargeUser(id, price); // ok

export {id, price, chargeUser};
export type {UserId, Cents};
