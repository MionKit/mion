import {createValidateFn} from '@mionjs/run-types';

// Same non-serializable-member caveat as build-vite, so the ESLint transport has
// a known RT diagnostic (VL0xx) to assert on.
export interface WithHandler {
  name: string;
  onClick: () => void;
}

export const isWithHandler = createValidateFn<WithHandler>();
