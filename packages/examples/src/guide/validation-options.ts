import {createValidateFn} from '@mionjs/run-types';

type Flag = {kind: 'on' | 'off'; values: number[]};

// start-options
// 'on' | 'off' now accepts any string
const isFlagLoose = createValidateFn<Flag>(undefined, {noLiterals: true});

const isFlagFast = createValidateFn<Flag>(undefined, {noIsArrayCheck: true});

// accepts NaN and Infinity
const isFlagTypeofNumbers = createValidateFn<Flag>(undefined, {
  numberMode: 'typeof',
});
// end-options

export {isFlagLoose, isFlagFast, isFlagTypeofNumbers};
