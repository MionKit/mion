import {createValidateFn} from '@mionjs/run-types';

// Same non-serializable-member caveat as build-vite, so the ESLint transport has
// a known RT diagnostic (validate-*) to assert on.
export interface WithHandler {
  name: string;
  onClick: () => void;
}

export const isWithHandler = createValidateFn<WithHandler>();
