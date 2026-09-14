// A union has TWO wire forms, and which one applies is fixed by the TYPE, not by the value:
//
//   every member JSON-compatible  ->  the bare value, no index      {a:string} | {b:number}
//   any member needs a transform  ->  [index, value]                {a:string} | Date
//
// Both forms carry an object that a caller can hang an undeclared key on, and the bare form has no
// index to dispatch on at all, so each family picks the arm from the value's own shape. That is
// where the arms drift apart, and they have twice: the clone pair rode an object member through
// untouched, and the compact DECODE used the mutate restore while compact ENCODE used the stripping
// one, so a compact route accepted whatever a caller sent.
//
// One row per union shape, every encode and decode function on the same value.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, getRTFunction, type InjectTypeFnArgs} from '../../src/index.ts';

// mion's `clone` strategy decodes with `rjs`, which has no createX factory: it is recovered through
// the marker, the same wrapper shape the router's generated call site uses.
function cloneDecoder<T>(id?: InjectTypeFnArgs<T, 'rjs'>) {
  return getRTFunction<'rjs'>(id);
}
// The mutate decode, the one family that KEEPS undeclared keys on purpose.
function mutateDecoder<T>(id?: InjectTypeFnArgs<T, 'rj'>) {
  return getRTFunction<'rj'>(id);
}

type TwoObjects = {a: string} | {b: number};
type Discriminated = {k: 1; a: string} | {k: 2; b: number};
type ObjectOrPrimitive = {a: string} | number;
type ObjectInsideArray = {a: string}[] | number;
type Enveloped = {a: string} | Date;

describe('every union decode strips the same', () => {
  // `cloneExactShape` is deliberately absent: it refuses a union with object members outright
  // (CES001), because a clone from the declared shape needs to know which arm matched. It is the one
  // family allowed to answer "cannot", and it must keep saying so rather than quietly agreeing.
  const rows = {
    'two object members, bare wire': {
      clean: {a: 'x'},
      value: {a: 'x'},
      wide: {a: 'x', evil: 1},
      fns: () => ({
        cloneEncoder: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'direct'}),
        compactEncoder: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'compact'}),
        cloneDecoder: cloneDecoder<TwoObjects>(),
        stripDecoder: createJsonDecoderFn<TwoObjects>(undefined, {strategy: 'strip'}),
        compactDecoder: createJsonDecoderFn<TwoObjects>(undefined, {strategy: 'compact'}),
        mutateDecoder: mutateDecoder<TwoObjects>(),
      }),
    },
    'discriminated members, bare wire': {
      clean: {k: 1, a: 'x'},
      value: {k: 1, a: 'x'},
      wide: {k: 1, a: 'x', evil: 1},
      fns: () => ({
        cloneEncoder: createJsonEncoderFn<Discriminated>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<Discriminated>(undefined, {strategy: 'direct'}),
        compactEncoder: createJsonEncoderFn<Discriminated>(undefined, {strategy: 'compact'}),
        cloneDecoder: cloneDecoder<Discriminated>(),
        stripDecoder: createJsonDecoderFn<Discriminated>(undefined, {strategy: 'strip'}),
        compactDecoder: createJsonDecoderFn<Discriminated>(undefined, {strategy: 'compact'}),
        mutateDecoder: mutateDecoder<Discriminated>(),
      }),
    },
    'object beside a primitive, bare wire': {
      clean: {a: 'x'},
      value: {a: 'x'},
      wide: {a: 'x', evil: 1},
      fns: () => ({
        cloneEncoder: createJsonEncoderFn<ObjectOrPrimitive>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<ObjectOrPrimitive>(undefined, {strategy: 'direct'}),
        compactEncoder: createJsonEncoderFn<ObjectOrPrimitive>(undefined, {strategy: 'compact'}),
        cloneDecoder: cloneDecoder<ObjectOrPrimitive>(),
        stripDecoder: createJsonDecoderFn<ObjectOrPrimitive>(undefined, {strategy: 'strip'}),
        compactDecoder: createJsonDecoderFn<ObjectOrPrimitive>(undefined, {strategy: 'compact'}),
        mutateDecoder: mutateDecoder<ObjectOrPrimitive>(),
      }),
    },
    // No object member at all: an array is an ATOMIC member of the flat layout, so the object is
    // one level further down than any gate keyed on "has object members" can see.
    'object inside an array member, bare wire': {
      clean: [{a: 'x'}],
      value: [{a: 'x'}],
      wide: [{a: 'x', evil: 1}],
      fns: () => ({
        cloneEncoder: createJsonEncoderFn<ObjectInsideArray>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<ObjectInsideArray>(undefined, {strategy: 'direct'}),
        compactEncoder: createJsonEncoderFn<ObjectInsideArray>(undefined, {strategy: 'compact'}),
        cloneDecoder: cloneDecoder<ObjectInsideArray>(),
        stripDecoder: createJsonDecoderFn<ObjectInsideArray>(undefined, {strategy: 'strip'}),
        compactDecoder: createJsonDecoderFn<ObjectInsideArray>(undefined, {strategy: 'compact'}),
        mutateDecoder: mutateDecoder<ObjectInsideArray>(),
      }),
    },
    // The Date member forces the [index, value] envelope, so the object arrives under index -1.
    'object under an envelope': {
      clean: {a: 'x'},
      value: {a: 'x'},
      wide: {a: 'x', evil: 1},
      fns: () => ({
        cloneEncoder: createJsonEncoderFn<Enveloped>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<Enveloped>(undefined, {strategy: 'direct'}),
        compactEncoder: createJsonEncoderFn<Enveloped>(undefined, {strategy: 'compact'}),
        cloneDecoder: cloneDecoder<Enveloped>(),
        stripDecoder: createJsonDecoderFn<Enveloped>(undefined, {strategy: 'strip'}),
        compactDecoder: createJsonDecoderFn<Enveloped>(undefined, {strategy: 'compact'}),
        mutateDecoder: mutateDecoder<Enveloped>(),
      }),
    },
  };

  // Plant the undeclared key into the first plain object of an already-encoded wire. Each decoder
  // is fed the wire ITS OWN encoder writes, so the test never assumes a layout: compact envelopes
  // some of these shapes and rides others raw, and either way the object is in there somewhere.
  function plantIntoWire(wire: unknown): boolean {
    if (Array.isArray(wire)) return wire.some((item) => plantIntoWire(item));
    if (wire === null || typeof wire !== 'object') return false;
    (wire as Record<string, unknown>).evil = 1;
    return true;
  }

  const PAIRS = [
    ['cloneEncoder', 'cloneDecoder'],
    ['cloneEncoder', 'stripDecoder'],
    ['directEncoder', 'stripDecoder'],
    ['compactEncoder', 'compactDecoder'],
  ] as const;

  for (const [name, row] of Object.entries(rows)) {
    it(`drops an undeclared key planted on the wire: ${name}`, () => {
      const fns = row.fns();
      for (const [encKey, decKey] of PAIRS) {
        const wire = JSON.parse(fns[encKey](structuredClone(row.value)) as string);
        if (!plantIntoWire(wire)) {
          // compact turns a nested object POSITIONAL, so that wire carries no keys at all and an
          // undeclared one cannot be expressed on it. Assert that rather than skipping quietly: a
          // wire that still has keys and refused the plant would be a hole in this test.
          expect(JSON.stringify(wire), `${encKey} wrote keys but nothing was planted`).not.toContain('":');
          continue;
        }
        // rjs takes the parsed value, the keyed decoders take the string; both rewrite in place.
        const planted = decKey === 'cloneDecoder' ? wire : JSON.stringify(wire);
        expect(fns[decKey](planted as never), `${encKey} -> ${decKey}`).toEqual(row.clean);
      }
    });

    it(`drops an undeclared key on encode: ${name}`, () => {
      const fns = row.fns();
      for (const encKey of ['cloneEncoder', 'directEncoder', 'compactEncoder'] as const) {
        const clean = fns[encKey](structuredClone(row.value)) as string;
        expect(JSON.parse(fns[encKey](structuredClone(row.wide)) as string), encKey).toEqual(JSON.parse(clean));
      }
    });

    it(`round-trips its own wire: ${name}`, () => {
      const fns = row.fns();
      for (const [encKey, decKey] of PAIRS) {
        const wire = fns[encKey](structuredClone(row.value)) as string;
        const input = decKey === 'cloneDecoder' ? JSON.parse(wire) : wire;
        expect(fns[decKey](input as never), `${encKey} -> ${decKey}`).toEqual(row.clean);
      }
    });

    it(`the mutate decode keeps the key, which is its contract: ${name}`, () => {
      const fns = row.fns();
      const wire = JSON.parse(fns.cloneEncoder(structuredClone(row.wide)) as string);
      // The clone encoder already dropped it, so plant straight onto the wire to give mutate
      // something to keep.
      plantIntoWire(wire);
      const restored = fns.mutateDecoder(wire as never);
      const found = JSON.stringify(restored).includes('"evil"');
      expect(found, 'mutate must not strip').toBe(true);
    });
  }

  // An enveloped union's wire form is `[index, value]`. A bare object is not one, and nothing
  // assumes an index for it: every decoder refuses, and refuses the SAME way. The message itself is
  // not pinned, only that the four agree, so rewording it stays a one-line change.
  it('every decoder refuses a bare object where the envelope is expected', () => {
    const attempts = {
      cloneDecoder: () => cloneDecoder<Enveloped>()(JSON.parse('{"a":"x"}')),
      stripDecoder: () => createJsonDecoderFn<Enveloped>(undefined, {strategy: 'strip'})('{"a":"x"}'),
      compactDecoder: () => createJsonDecoderFn<Enveloped>(undefined, {strategy: 'compact'})('{"a":"x"}'),
      preserveDecoder: () => createJsonDecoderFn<Enveloped>(undefined, {strategy: 'preserve'})('{"a":"x"}'),
      mutateDecoder: () => mutateDecoder<Enveloped>()(JSON.parse('{"a":"x"}')),
    };
    const thrown = Object.entries(attempts).map(([name, run]) => {
      try {
        run();
        return {name, ctor: 'DID NOT THROW', message: ''};
      } catch (err) {
        return {name, ctor: (err as object).constructor.name, message: (err as Error).message};
      }
    });
    for (const entry of thrown) expect(entry.ctor, `${entry.name} must throw`).toBe('Error');
    const first = thrown[0];
    for (const entry of thrown) expect(entry.message, `${entry.name} vs ${first.name}`).toBe(first.message);
  });

  // An index naming no member is refused the same way, so the guard is on the VALUE of the index,
  // not merely on the wire being a two-slot array.
  it('every decoder refuses an index that names no member', () => {
    const attempts = {
      cloneDecoder: () => cloneDecoder<Enveloped>()(JSON.parse('[99,{"a":"x"}]')),
      stripDecoder: () => createJsonDecoderFn<Enveloped>(undefined, {strategy: 'strip'})('[99,{"a":"x"}]'),
      compactDecoder: () => createJsonDecoderFn<Enveloped>(undefined, {strategy: 'compact'})('[99,{"a":"x"}]'),
      mutateDecoder: () => mutateDecoder<Enveloped>()(JSON.parse('[99,{"a":"x"}]')),
    };
    const messages = Object.entries(attempts).map(([name, run]) => {
      try {
        run();
        return {name, ctor: 'DID NOT THROW', message: ''};
      } catch (err) {
        return {name, ctor: (err as object).constructor.name, message: (err as Error).message};
      }
    });
    for (const entry of messages) expect(entry.ctor, `${entry.name} must throw`).toBe('Error');
    for (const entry of messages) expect(entry.message, entry.name).toBe(messages[0].message);
  });

  // The other direction: a union carrying nothing keyed must stay compiled away, so none of the
  // above was bought by making every union walk its members.
  it('leaves a union of primitives alone', () => {
    type Primitives = string | number;
    expect(createJsonDecoderFn<Primitives>(undefined, {strategy: 'strip'})('"hi"')).toBe('hi');
    expect(createJsonDecoderFn<Primitives>(undefined, {strategy: 'compact'})('"hi"')).toBe('hi');
    expect(cloneDecoder<Primitives>()('hi')).toBe('hi');
    expect(createJsonEncoderFn<Primitives>(undefined, {strategy: 'compact'})('hi')).toBe('"hi"');
  });
});
