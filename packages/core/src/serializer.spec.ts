import {describe, expect, it} from 'vitest';
import type {JsonEncoderStrategy} from '@mionjs/run-types';
import {DECODE_FAMILY_BY_STRATEGY, DECODE_SIDE_BY_DIRECTION} from './constants.ts';
import {DEFAULT_SERIALIZER, SERIALIZER_STRATEGIES, isSerializerStrategy, resolveSerializer} from './serializer.ts';
import type {SerializerStrategy} from './types/general.types.ts';

describe('the mion serializer strategies', () => {
  // SerializerStrategy is written out rather than `Exclude`d from the union: the conditional would cost every route.
  it('names a subset of the RunTypes encoder strategies', () => {
    type IsSubset = SerializerStrategy extends JsonEncoderStrategy ? true : false;
    const subset: IsSubset = true;
    expect(subset).toBe(true);
    // the one RunTypes offers and mion does not
    expect(isSerializerStrategy('direct')).toBe(false);
  });

  it('lists exactly the strategies the type names', () => {
    expect([...SERIALIZER_STRATEGIES].sort()).toEqual(['clone', 'compact', 'mutate']);
    for (const strategy of SERIALIZER_STRATEGIES) expect(isSerializerStrategy(strategy)).toBe(true);
  });

  it('resolves route over router over the built-in default, per direction', () => {
    expect(resolveSerializer(undefined, undefined)).toEqual(DEFAULT_SERIALIZER);
    expect(resolveSerializer(undefined, 'compact')).toEqual({params: 'compact', return: 'compact'});
    expect(resolveSerializer({return: 'mutate'}, 'compact')).toEqual({params: 'compact', return: 'mutate'});
  });

  it('refuses a strategy mion does not have, naming the ones it does', () => {
    expect(() => resolveSerializer('direct' as never, undefined)).toThrow(/invalid serializer strategy 'direct'/);
    expect(() => resolveSerializer('direct' as never, undefined)).toThrow(/clone, mutate, compact/);
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
