import {describe, expect, it} from 'vitest';
import type {JsonEncoderStrategy} from '@mionjs/run-types';
import {PARAMS_PARSING, RETURN_PARSING, parsingRow} from './constants.ts';
import {DEFAULT_PARSER, PARSER_STRATEGIES, isParserStrategy, resolveParser} from './parser.ts';
import type {ParserStrategy} from './types/general.types.ts';

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

  // The server decodes params from any caller, the client a return its own server wrote.
  it('gives mutate a different decoder on each side, and the others the same one', () => {
    expect(PARAMS_PARSING.mutate.decode).toBe('restoreFromJsonMutate');
    expect(RETURN_PARSING.mutate.decode).toBe('restoreFromJsonClone');
    for (const strategy of ['clone', 'compact'] as const) {
      expect([strategy, PARAMS_PARSING[strategy].decode]).toEqual([strategy, RETURN_PARSING[strategy].decode]);
    }
  });

  // mutateStrict keeps every key the caller sent and then rejects the undeclared ones. A return is written by the
  // handler, so there is nothing to reject: having NO return row is what makes the rule a fact of the data.
  it('is params-only for mutateStrict, and every return row validates with the plain pair', () => {
    expect(Object.keys(RETURN_PARSING)).not.toContain('mutateStrict');
    expect(PARAMS_PARSING.mutateStrict.validate).toBe('validateStrict');
    for (const row of Object.values(RETURN_PARSING)) {
      expect([row.encode, row.validate]).toEqual([row.encode, 'validate']);
    }
  });

  it('reads a row off the direction, since the direction names the machine', () => {
    expect(parsingRow('mutate', 'params')).toBe(PARAMS_PARSING.mutate);
    expect(parsingRow('mutate', 'return')).toBe(RETURN_PARSING.mutate);
  });

  // A route compiles exactly one row, so two strategies on one wire must never name the same set of families,
  // or the runtime could not tell which one the build picked.
  it('gives every strategy on a wire its own set of families', () => {
    for (const table of [PARAMS_PARSING, RETURN_PARSING]) {
      const sets = Object.values(table).map((row) => [row.validate, row.encode, row.decode].join('|'));
      expect(new Set(sets).size).toBe(sets.length);
    }
  });
});
