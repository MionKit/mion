import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

// A card number is 12 to 19 digits whose checksum holds. The checksum is what
// catches a mistyped digit, which a length check on its own never would.
type Card = TF.CreditCard;

// Narrow it to the networks the field actually takes.
type Accepted = TF.CreditCard<{networks: ['visa', 'mastercard']}>;

// Accept the grouping people type, by naming the characters allowed between
// digits.
type TypedIn = TF.CreditCard<{separators: ' -'}>;

const isCard = createValidateFn<Card>();
const isAccepted = createValidateFn<Accepted>();
const isTypedIn = createValidateFn<TypedIn>();

isCard('4111111111111111'); // true
isCard('4111111111111112'); // false, one digit off

isAccepted('5555555555554444'); // true
isAccepted('378282246310005'); // false, a valid card but not one of these networks

isTypedIn('4111 1111 1111 1111'); // true

export {isCard, isAccepted, isTypedIn};
