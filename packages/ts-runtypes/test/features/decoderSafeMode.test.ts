// Decoder-safe-mode integration tests for ukuWire.
//
// The safe decoder composes:
//
//   decode(s) → restore(uku(JSON.parse(s)))
//
// where `uku` is actually the ukuWire RT family (the public uku is a
// no-op on unions because the same factory hash is shared with the
// public createUnknownKeysToUndefined API which operates on raw
// objects).
//
// For a union that carries a transform on some member, the parsed wire
// value is `[-1, mergedObject]` (object branch) or `[idx, value]` (atomic
// branch with tuple wrap); ukuWire detects the wrapper at runtime and
// reaches into `v[1]` to apply the merged-allowlist strip. For a union
// that round-trips raw (every member JSON-compatible, e.g.
// `{a: string} | {b: number}`) there is NO envelope — the wire value is
// the bare merged object — so ukuWire strips `v` directly. Either way the
// decoder-safety hole at union nodes (that the legacy uku-no-op-on-union
// created) stays closed.
//
// These tests craft unsafe-encoded wire payloads and assert that the
// safe decoder nukes undeclared keys before returning.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';

describe('safe decoder — ukuWire strips undeclared keys at union nodes', () => {
  type Disjoint = {a: string} | {b: number};

  it('strips undeclared keys from an unsafe-encoded union payload', () => {
    // `Disjoint` round-trips raw (both members are JSON-compatible), so the
    // wire has NO `[-1, …]` envelope — an unsafe encoder produces the bare
    // merged object with an extra key smuggled in. The safe decoder must
    // strip the extra before returning.
    const wire = JSON.stringify({a: 'hi', evil: 'sneaky'});
    const decode = createJsonDecoderFn<Disjoint>();
    const restored = decode(wire);
    expect((restored as Record<string, unknown>).a).toBe('hi');
    expect((restored as Record<string, unknown>).evil).toBeUndefined();
  });

  it('round-trips correctly when both halves use safe mode', () => {
    // Sanity: the safe encoder strips extras by construction, so the
    // safe decoder pipeline shouldn't see them — happy path still
    // works.
    const encode = createJsonEncoderFn<Disjoint>();
    const decode = createJsonDecoderFn<Disjoint>();
    const value: Disjoint = {a: 'hello'};
    const wire = encode(value)!;
    const back = decode(wire);
    expect(back).toEqual({a: 'hello'});
  });

  it('unsafe encoder → safe decoder strips extras', () => {
    // Unsafe encoder lets extras through; safe decoder must nuke
    // them at union arms. Without ukuWire, the extras would survive.
    const unsafeEncode = createJsonEncoderFn<Disjoint>(undefined, {strategy: 'mutate'});
    const decode = createJsonDecoderFn<Disjoint>();
    const dirty = {a: 'hello', stranger: 'bad'} as Disjoint;
    const wire = unsafeEncode(dirty)!;
    const back = decode(wire);
    expect((back as Record<string, unknown>).a).toBe('hello');
    expect((back as Record<string, unknown>).stranger).toBeUndefined();
  });

  it('atomic-only union: ukuWire is identity on raw atomic wire', () => {
    // For `string | number`, AtomicNeedsTuple=false at emit time:
    // every member is JSON-natural so the wire has NO wrapper. The
    // decoder must work identity-style on raw atomics — no wrapper
    // peel attempted.
    const decode = createJsonDecoderFn<string | number>();
    expect(decode('"hi"')).toBe('hi');
    expect(decode('42')).toBe(42);
  });
});
