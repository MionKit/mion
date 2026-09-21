import {describe, expect, it} from 'vitest';
import type {JsonEncoderStrategy} from '@mionjs/run-types';
import {PARSE_MODES} from './constants.ts';
import {DEFAULT_PARSER, PARSER_STRATEGIES, isParserStrategy, resolveParser} from './parser.ts';
import type {ParserStrategy, ReturnParserStrategy} from './types/general.types.ts';

describe('the mion parser strategies', () => {
  // `mutateStrict` shares `mutate`'s encoder and differs only in the params validator, so it is mion's own name and
  // not one RunTypes knows.
  it('names a subset of the RunTypes encoder strategies, once mutateStrict is mapped', () => {
    type Mapped<S> = S extends 'mutateStrict' ? 'mutate' : S;
    type IsSubset = Mapped<ParserStrategy> extends JsonEncoderStrategy ? true : false;
    const subset: IsSubset = true;
    expect(subset).toBe(true);
    // the one RunTypes offers and mion does not
    expect(isParserStrategy('direct')).toBe(false);
  });

  it('lists exactly the strategies the type names', () => {
    expect([...PARSER_STRATEGIES].sort()).toEqual(['clone', 'compact', 'mutate', 'mutateStrict']);
    for (const strategy of PARSER_STRATEGIES) expect(isParserStrategy(strategy)).toBe(true);
  });

  it('resolves route over router over the built-in default, per direction', () => {
    expect(resolveParser(undefined, undefined)).toEqual(DEFAULT_PARSER);
    expect(resolveParser(undefined, 'compact')).toEqual({params: 'compact', return: 'compact'});
    expect(resolveParser({return: 'mutate'}, 'compact')).toEqual({params: 'compact', return: 'mutate'});
  });

  it('refuses a strategy mion does not have, naming the ones it does', () => {
    expect(() => resolveParser('direct' as never, undefined)).toThrow(/invalid parser strategy 'direct'/);
    expect(() => resolveParser('direct' as never, undefined)).toThrow(/clone, mutate, mutateStrict, compact/);
  });

  // One row serves both wires, so `mutateStrict` has a row like any other. What keeps it off the return side is
  // the TYPE, not the data: a return is written by your own handler, so there is no caller to answer for.
  it('keeps mutateStrict out of the return wire by type', () => {
    expect(Object.keys(PARSE_MODES).sort()).toEqual(['clone', 'compact', 'mutate', 'mutateStrict']);
    expect(PARSE_MODES.mutateStrict.validate).toBe('validateStrict');
    type ReturnHasNoStrict = 'mutateStrict' extends ReturnParserStrategy ? false : true;
    const paramsOnly: ReturnHasNoStrict = true;
    expect(paramsOnly).toBe(true);
  });

  // A route compiles exactly one row, so two strategies must never name the same set of families, or the
  // runtime could not tell which one the build picked.
  it('gives every strategy its own set of families', () => {
    const sets = Object.values(PARSE_MODES).map((row) => [row.validate, row.encode, row.decode].join('|'));
    expect(new Set(sets).size).toBe(sets.length);
  });
});
