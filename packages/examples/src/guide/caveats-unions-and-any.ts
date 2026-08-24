import {createValidateFn} from '@ts-runtypes/core';

// Unions are read precisely: each member is validated.
type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; side: number};

const isShape = createValidateFn<Shape>();
isShape({kind: 'circle', radius: 5}); // true
isShape({kind: 'circle', side: 5} as never); // false, wrong member shape

// `any` is the opposite of a constraint. createValidateFn<any>() accepts
// EVERYTHING (a noop validator) and emits a build-time diagnostic. If you
// see a validator that never says no, check for a stray `any`.
const isAnything = createValidateFn<any>();
isAnything(42); // true
isAnything('whatever'); // true

export {isShape, isAnything};
export type {Shape};
