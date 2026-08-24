import {createValidateFn} from '@ts-runtypes/core';

// A type with a non-serializable member. createValidateFn drops `onClick` and the
// build emits a VL0xx Warning — the known RT diagnostic the lint transport test
// asserts fires (the transport, not the catalog, is what's under test).
export interface WithHandler {
  name: string;
  onClick: () => void;
}

export const isWithHandler = createValidateFn<WithHandler>();
