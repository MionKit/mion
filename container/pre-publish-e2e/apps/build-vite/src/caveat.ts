import {createValidateFn} from '@mionjs/run-types';

// A type with a non-serializable member. createValidateFn drops `onClick` with a
// VL0xx Info, which the lint configs show with `levels: 'all'`: the known RT
// diagnostic the lint transport test asserts fires.
export interface WithHandler {
  name: string;
  onClick: () => void;
}

export const isWithHandler = createValidateFn<WithHandler>();
