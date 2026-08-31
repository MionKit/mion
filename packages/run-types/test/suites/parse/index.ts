// Shared **parse** suite — `createParseFn<T>()`, which restores a JSON.parse
// output into the typed shape and checks it in one walk.
//
// Its own suite rather than a section of the validation one: a validator is a
// predicate over a value you already hold, parse is a boundary function over
// untrusted wire data, so the axes are different (round-trip, restoration,
// totality, and the undeclared-key strategy).

import {PARSE} from './Parse.ts';
import type {ParseCase, StrategyShape} from './Parse.ts';

export const PARSE_SUITE = {
  PARSE,
} as const satisfies {
  PARSE: Record<string, ParseCase>;
};

export {PARSE, PARSE_STRATEGIES} from './Parse.ts';
export type {ParseCase, StrategyShape};
