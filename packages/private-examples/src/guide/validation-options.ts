import {createValidateFn} from '@mionjs/run-types';

type Flag = {kind: 'on' | 'off'; values: number[]};

// start-options
// accepts NaN and Infinity
const isFlagTypeofNumbers = createValidateFn<Flag>(undefined, {
  numberMode: 'typeof',
});
// end-options

export {isFlagTypeofNumbers};
