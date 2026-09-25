import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn, createFormatTransformFn} from '@mionjs/run-types';

// start-card
type Card = TF.CreditCard; // 12 to 19 digits with a valid checksum
type Accepted = TF.CreditCard<{networks: ['visa', 'mastercard']}>;

const isCard = createValidateFn<Card>();
const isAccepted = createValidateFn<Accepted>();

isCard('4111 1111 1111 1111'); // true, spaces and dashes allowed
isCard('4111111111111112'); // false, one digit off
isAccepted('378282246310005'); // false, a valid Amex card
// end-card

// digits only; any other separator set replaces the default
type DigitsOnly = TF.CreditCard<{separators: ''}>;

// accepting the grouping does not remove it; this transform does
type Normalized = TF.CreditCard<{transform: {stripSeparators: true}}>;

const isDigitsOnly = createValidateFn<DigitsOnly>();

isCard('4111111111111111'); // true
isAccepted('5555555555554444'); // true
isDigitsOnly('4111 1111 1111 1111'); // false

const normalize = createFormatTransformFn<Normalized>();
normalize('4111 1111 1111 1111'); // '4111111111111111'

export {isCard, isAccepted, isDigitsOnly, normalize};
