import {createValidateFn} from '@mionjs/run-types';

type Flag = {kind: 'on' | 'off'; values: number[]};

// start-options
// Pass an OBJECT LITERAL of options. The build reads the literal and routes
// the call to a specialized variant of the validator. Nothing is read at runtime.

// noLiterals: a literal check degrades to its base type
// (here 'on' | 'off' becomes "any string").
const isFlagLoose = createValidateFn<Flag>(undefined, {noLiterals: true});

// noIsArrayCheck: skip the leading Array.isArray() guard on array validators
// (handy when you've already proven the value is an array upstream).
const isFlagFast = createValidateFn<Flag>(undefined, {noIsArrayCheck: true});

// numberMode: choose how a `number` is checked, to line up with another
// library when migrating. 'typeof' accepts NaN and Infinity (like ajv, typia,
// and JSON Schema); the default 'isFinite' rejects them; 'notNaN' rejects NaN
// but keeps Infinity.
const isFlagTypeofNumbers = createValidateFn<Flag>(undefined, {numberMode: 'typeof'});
// end-options

export {isFlagLoose, isFlagFast, isFlagTypeofNumbers};
