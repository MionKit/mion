import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn, createFormatTransformFn} from '@mionjs/run-types';

// A card number is 12 to 19 digits whose checksum holds. The checksum is what
// catches a mistyped digit, which a length check on its own never would.
// Spaces and dashes between digits are accepted by default, because that is how
// a card number is printed and typed.
type Card = TF.CreditCard;

// Narrow it to the networks the field actually takes.
type Accepted = TF.CreditCard<{networks: ['visa', 'mastercard']}>;

// For a field that must hold digits and nothing else, name an empty separator
// set. Any other set replaces the default.
type DigitsOnly = TF.CreditCard<{separators: ''}>;

// Accepting the grouping does NOT rewrite it. Ask for that under `transform`,
// and only `createFormatTransformFn` (or a mion route with `sanitizeParams`)
// applies it, never validate or decode.
type Normalized = TF.CreditCard<{transform: {stripSeparators: true}}>;

const isCard = createValidateFn<Card>();
const isAccepted = createValidateFn<Accepted>();
const isDigitsOnly = createValidateFn<DigitsOnly>();

isCard('4111111111111111'); // true
isCard('4111 1111 1111 1111'); // true
isCard('4111111111111112'); // false, one digit off

isAccepted('5555555555554444'); // true
isAccepted('378282246310005'); // false, a valid card but not one of these networks

isDigitsOnly('4111 1111 1111 1111'); // false

const normalize = createFormatTransformFn<Normalized>();
normalize('4111 1111 1111 1111'); // '4111111111111111'

export {isCard, isAccepted, isDigitsOnly, normalize};
