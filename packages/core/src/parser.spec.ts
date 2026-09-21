import {describe, expect, it} from 'vitest';
import type {JsonEncoderStrategy} from '@mionjs/run-types';
import {DECODE_FAMILY_BY_STRATEGY, DECODE_SIDE_BY_DIRECTION} from './constants.ts';
import {DEFAULT_PARSER, PARSER_STRATEGIES, isParserStrategy, resolveParser} from './parser.ts';
import type {ParserStrategy} from './types/general.types.ts';

describe('the mion parser strategies', () => {
  // ParserStrategy is written out rather than `Exclude`d from the union: the conditional would cost every route.
  it('names a subset of the RunTypes encoder strategies', () => {
    type IsSubset = ParserStrategy extends JsonEncoderStrategy ? true : false;
    const subset: IsSubset = true;
    expect(subset).toBe(true);
    // the one RunTypes offers and mion does not
    expect(isParserStrategy('direct')).toBe(false);
  });

  it('lists exactly the strategies the type names', () => {
    expect([...PARSER_STRATEGIES].sort()).toEqual(['clone', 'compact', 'mutate']);
    for (const strategy of PARSER_STRATEGIES) expect(isParserStrategy(strategy)).toBe(true);
  });

  it('resolves route over router over the built-in default, per direction', () => {
    expect(resolveParser(undefined, undefined)).toEqual(DEFAULT_PARSER);
    expect(resolveParser(undefined, 'compact')).toEqual({params: 'compact', return: 'compact'});
    expect(resolveParser({return: 'mutate'}, 'compact')).toEqual({params: 'compact', return: 'mutate'});
  });

  it('refuses a strategy mion does not have, naming the ones it does', () => {
    expect(() => resolveParser('direct' as never, undefined)).toThrow(/invalid parser strategy 'direct'/);
    expect(() => resolveParser('direct' as never, undefined)).toThrow(/clone, mutate, compact/);
  });

  // The server decodes params from any caller, the client a return its own server wrote.
  it('gives mutate a different decoder on each side, and the others the same one', () => {
    expect(DECODE_FAMILY_BY_STRATEGY.mutate.server).toBe('restoreFromJsonMutate');
    expect(DECODE_FAMILY_BY_STRATEGY.mutate.client).toBe('restoreFromJsonClone');
    for (const strategy of ['clone', 'compact'] as const) {
      const {server, client} = DECODE_FAMILY_BY_STRATEGY[strategy];
      expect([strategy, server]).toEqual([strategy, client]);
    }
  });

  it('reads the side off the direction, since the direction names the machine', () => {
    expect(DECODE_SIDE_BY_DIRECTION).toEqual({params: 'server', return: 'client'});
  });
});
