import {inject, provide} from 'vue';

const KEY = Symbol('code-card-sequence');

/** Starts the card's sequence; returns the frame's own step function (a component cannot inject what it provides). */
export function provideSequence(): typeof nextStep {
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

// Number('') is 0, so an empty value must be refused before it is read as one.
const isWritten = (value: string | number) => String(value).trim() !== '';

export const isAmount = (value: string | number) => isWritten(value) && Number.isFinite(toNumber(value)) && toNumber(value) >= 0;

export const isCount = (value: string | number) => isWritten(value) && Number.isInteger(toNumber(value)) && toNumber(value) >= 0;

/** A tile value is read at a glance: up to 12 characters (an emoji counts once). */
export const isTileValue = (value: string) => [...value].length > 0 && [...value].length <= 12;
