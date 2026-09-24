// The default (`clone`) JSON decoder rebuilds a union value from its members' declared keys, so an
// undeclared key on the wire is dropped at a union node too, whether or not the wire is enveloped.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

describe('the clone decoder drops undeclared keys at union nodes', () => {
  type Disjoint = {a: string} | {b: number};

  it('drops undeclared keys from a hand-written union payload', () => {
    // Both members are JSON-compatible, so the wire is the bare object with no envelope.
    const wire = JSON.stringify({a: 'hi', evil: 'sneaky'});
    const decode = createJsonDecoderFn<Disjoint>();
    const restored = decode(wire);
    expect((restored as Record<string, unknown>).a).toBe('hi');
    expect('evil' in (restored as object)).toBe(false);
  });

  it('round-trips the default encoder and decoder', () => {
    const encode = createJsonEncoderFn<Disjoint>();
    const decode = createJsonDecoderFn<Disjoint>();
    const value: Disjoint = {a: 'hello'};
    const wire = encode(value)!;
    const back = decode(wire);
    expect(back).toEqual({a: 'hello'});
  });

  it('mutate encoder -> clone decoder drops the extras the encoder kept', () => {
    const unsafeEncode = createJsonEncoderFn<Disjoint>(undefined, {strategy: 'mutate'});
    const decode = createJsonDecoderFn<Disjoint>();
    const dirty = {a: 'hello', stranger: 'bad'} as Disjoint;
    const wire = unsafeEncode(dirty)!;
    const back = decode(wire);
    expect((back as Record<string, unknown>).a).toBe('hello');
    expect('stranger' in (back as object)).toBe(false);
  });

  it('atomic-only union: the decoder is identity on the raw atomic wire', () => {
    // Every member is JSON-natural, so the wire has no envelope to peel.
    const decode = createJsonDecoderFn<string | number>();
    expect(decode('"hi"')).toBe('hi');
    expect(decode('42')).toBe(42);
  });
});
