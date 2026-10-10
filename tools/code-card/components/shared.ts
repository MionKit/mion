// Helpers the components share: the entrance sequence and the prop validators.

import {inject, provide} from 'vue';

const KEY = Symbol('code-card-sequence');

/** Starts the card's sequence; returns the frame's own step function (a component cannot inject what it provides). */
export function provideSequence(): () => {'--cc-i': number} {
  const sequence = {next: 0};
  provide(KEY, sequence);
  return () => ({'--cc-i': sequence.next++});
}

/** The next slot in the card's sequence, as the `--cc-i` style. Call it in setup, before any `await`. */
export function nextStep(): {'--cc-i': number} {
  const sequence = inject<{next: number} | null>(KEY, null);
  return {'--cc-i': sequence ? sequence.next++ : 0};
}

/** A bar or diff value written with separators ("197,349") as a number; NaN when it is not one. */
export const toNumber = (value: string | number): number =>
  typeof value === 'number' ? value : Number(value.replace(/[,_\s]/g, ''));

/** A bar value: a number of zero or more, separators allowed. */
export const isAmount = (value: string | number) => Number.isFinite(toNumber(value)) && toNumber(value) >= 0;

/** A diff line count: a whole number of zero or more. */
export const isCount = (value: string | number) => Number.isInteger(toNumber(value)) && toNumber(value) >= 0;

/** A tile value is read at a glance: up to 12 characters. */
export const isTileValue = (value: string) => value.length > 0 && value.length <= 12;
