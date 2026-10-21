import {describe, expect, it} from 'vitest';
import type {JsonEncoderStrategy} from '@mionjs/run-types';
import {PARSE_MODES} from '../src/constants.ts';
import {DEFAULT_PARSER, PARSER_STRATEGIES, isParserStrategy, resolveParser} from '../src/parser.ts';
import type {ParserStrategy, ReturnParserStrategy} from '../src/types/general.types.ts';

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

  // PARSE_MODES is the source of truth: a strategy added to the table and not to the list would compile.
  it('lists exactly the strategies the table names', () => {
    expect([...PARSER_STRATEGIES].sort()).toEqual(Object.keys(PARSE_MODES).sort());
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

  // `mutateStrict` has a row like any other; ReturnParserStrategy keeps it off the return wire, not the data.
  it('keeps mutateStrict out of the return wire by type', () => {
    expect(Object.keys(PARSE_MODES).sort()).toEqual(['clone', 'compact', 'mutate', 'mutateStrict']);
    expect(PARSE_MODES.mutateStrict.validate).toBe('validateStrict');
    type ReturnHasNoStrict = 'mutateStrict' extends ReturnParserStrategy ? false : true;
    const paramsOnly: ReturnHasNoStrict = true;
    expect(paramsOnly).toBe(true);
  });

  // The type stops a TypeScript caller; a JavaScript one, or an `as never` cast, reaches the runtime list instead.
  it('refuses mutateStrict on the return wire at runtime too', () => {
    expect(() => resolveParser({return: 'mutateStrict'} as never, undefined)).toThrow(
      /invalid parser strategy 'mutateStrict' for route return/
    );
    expect(() => resolveParser('mutateStrict' as never, undefined)).toThrow(
      /invalid parser strategy 'mutateStrict' for route return/
    );
    expect(resolveParser({params: 'mutateStrict'}, undefined)).toEqual({params: 'mutateStrict', return: 'clone'});
  });

  // Two strategies must never name the same families, or the runtime could not tell which row the build picked.
  it('gives every strategy its own set of families', () => {
    const sets = Object.values(PARSE_MODES).map((row) => [row.validate, row.encode, row.decode].join('|'));
    expect(new Set(sets).size).toBe(sets.length);
  });
});
