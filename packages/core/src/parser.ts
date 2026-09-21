/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ParserOption, ResolvedParser, ParserStrategy, ReturnParserStrategy} from './types/general.types.ts';

// The `parser` option is a BUILD-TIME literal: at runtime the strategy is read back off the injected families
// and checked against what was compiled (mionAdapter).

/** Defaults to `clone` both ways: it never mutates the input and drops anything the type does not declare. */
export const DEFAULT_PARSER = Object.freeze({params: 'clone', return: 'clone'} as const) satisfies ResolvedParser;
/** The default pair as literal types, for the router's helper types. */
export type DefaultParser = typeof DEFAULT_PARSER;

export const PARSER_STRATEGIES = ['clone', 'mutate', 'mutateStrict', 'compact'] as const satisfies readonly ParserStrategy[];
/** What a RETURN direction accepts: everything but `mutateStrict`, which has no meaning on the way out. */
export const RETURN_PARSER_STRATEGIES = PARSER_STRATEGIES.filter(
  (strategy) => strategy !== 'mutateStrict'
) as readonly ReturnParserStrategy[];

export function isParserStrategy(value: unknown): value is ParserStrategy {
  return typeof value === 'string' && (PARSER_STRATEGIES as readonly string[]).includes(value);
}

function directionOf(
  option: ParserOption | undefined,
  direction: keyof ResolvedParser,
  label: string
): ParserStrategy | undefined {
  if (option === undefined) return undefined;
  const value = typeof option === 'string' ? option : option[direction];
  if (value === undefined) return undefined;
  const allowed = direction === 'return' ? RETURN_PARSER_STRATEGIES : PARSER_STRATEGIES;
  if (!(allowed as readonly string[]).includes(value as string))
    throw new Error(
      `mion: invalid parser strategy '${String(value)}' for ${label} ${direction}; expected one of ${allowed.join(', ')}`
    );
  return value as ParserStrategy;
}

/** The parser pair of a route or middleFn: route option, then router option, then the default. */
export function resolveParser(
  routeOption: ParserOption | undefined,
  routerOption: ParserOption | undefined,
  label = 'route'
): ResolvedParser {
  return {
    params: directionOf(routeOption, 'params', label) ?? directionOf(routerOption, 'params', 'router') ?? DEFAULT_PARSER.params,
    // directionOf already rejected mutateStrict for this direction, so the cast only drops it from the type.
    return: (directionOf(routeOption, 'return', label) ??
      directionOf(routerOption, 'return', 'router') ??
      DEFAULT_PARSER.return) as ReturnParserStrategy,
  };
}
