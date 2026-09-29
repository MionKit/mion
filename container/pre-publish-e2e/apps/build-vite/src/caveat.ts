import {createValidateFn} from '@mionjs/run-types';

// The lint transport test's known diagnostic: `onClick` drops with a VL0xx Info, shown by the `mion/info` rule.
export interface WithHandler {
  name: string;
  onClick: () => void;
}

export const isWithHandler = createValidateFn<WithHandler>();
