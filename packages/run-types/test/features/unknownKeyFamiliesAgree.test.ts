// Every family that answers "which keys are not declared by this type" held against the others, on
// one value per shape. They are emitted separately, per kind, in four different Go files, and a
// family that stops reaching a position faces UNTRUSTED input (the strip decoder is what a server
// runs on a caller's payload) with nothing downstream to catch it: `validate` accepts undeclared
// keys on an object literal by design.
//
// The value fuzz owns the random half of this. This suite owns the shapes: one row per position an
// undeclared key can hide in, every family asserted on the same value, so a family that stops
// agreeing names itself. A shape whose index signature declares every key answers the other way
// round, so it gets its own test below rather than a row.

import {describe, expect, it} from 'vitest';
import {
  createCloneExactShapeFn,
  createGetValidationErrorsFn,
  createHasUnknownKeysFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createUnknownKeyErrorsFn,
  createValidateFn,
  type HasUnknownKeysFn,
  type JsonDecoderFn,
  type JsonEncoderFn,
  type UnknownKeyErrorsFn,
} from '../../src/index.ts';

type Inner = {a: string};
type TwoObjects = Inner | {b: number};
type Counts = Record<string, number>;
type CountsOrInner = Counts | Inner;

/** The families answer in three currencies, so each row says what "agrees" means for it:
 *  a boolean, a list of paths, or a value with the key gone. **/
interface Row {
  /** The wire the caller sent, with one undeclared `evil` key planted. **/
  wire: string;
  /** The path `unknownKeyErrors` must report for that key. **/
  reported: (string | number)[];
  /** The value every deleting family must produce; the strip decoder blanks the key instead. **/
  clean: unknown;
  /** Set when `cloneExactShape` refuses the shape outright, which it does for a union carrying
   *  object members: rebuilding from the declared shape needs to know which member matched. **/
  cloneRefuses?: true;
  fns: () => {
    hasUnknownKeys: HasUnknownKeysFn;
    unknownKeyErrors: UnknownKeyErrorsFn;
    /** `ValidateFn<T>` narrows to `T` and `CloneExactShapeFn<T>` takes `T`; `T` varies per row, so
     *  these two are spelled by what every row can supply. **/
    validateStrict: (value: unknown) => boolean;
    /** Held back unbuilt: a refusing row throws at factory creation, not on the call. **/
    makeCloneExactShape: () => (value: never) => unknown;
    stripDecoder: JsonDecoderFn;
    cloneEncoder: JsonEncoderFn;
    directEncoder: JsonEncoderFn;
  };
}

/** Follow an object / array path through a value. **/
function atPath(value: unknown, path: readonly (string | number)[]): unknown {
  return path.reduce<unknown>((cursor, segment) => (cursor as Record<string | number, unknown>)[segment], value);
}

describe('every unknown-key family agrees', () => {
  const rows = {
    'flat object': {
      wire: '{"a":"x","evil":1}',
      reported: ['evil'],
      clean: {a: 'x'},
      fns: () => ({
        hasUnknownKeys: createHasUnknownKeysFn<Inner>(),
        unknownKeyErrors: createUnknownKeyErrorsFn<Inner>(),
        validateStrict: createValidateFn<Inner>(undefined, {checkUnknowns: true}),
        makeCloneExactShape: () => createCloneExactShapeFn<Inner>(),
        stripDecoder: createJsonDecoderFn<Inner>(undefined, {strategy: 'strip'}),
        cloneEncoder: createJsonEncoderFn<Inner>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<Inner>(undefined, {strategy: 'direct'}),
      }),
    },
    'object inside an array': {
      wire: '[{"a":"x","evil":1}]',
      reported: [0, 'evil'],
      clean: [{a: 'x'}],
      fns: () => ({
        hasUnknownKeys: createHasUnknownKeysFn<Inner[]>(),
        unknownKeyErrors: createUnknownKeyErrorsFn<Inner[]>(),
        validateStrict: createValidateFn<Inner[]>(undefined, {checkUnknowns: true}),
        makeCloneExactShape: () => createCloneExactShapeFn<Inner[]>(),
        stripDecoder: createJsonDecoderFn<Inner[]>(undefined, {strategy: 'strip'}),
        cloneEncoder: createJsonEncoderFn<Inner[]>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<Inner[]>(undefined, {strategy: 'direct'}),
      }),
    },
    'object in a tuple slot': {
      wire: '[{"a":"x","evil":1},2]',
      reported: [0, 'evil'],
      clean: [{a: 'x'}, 2],
      fns: () => ({
        hasUnknownKeys: createHasUnknownKeysFn<[Inner, number]>(),
        unknownKeyErrors: createUnknownKeyErrorsFn<[Inner, number]>(),
        validateStrict: createValidateFn<[Inner, number]>(undefined, {checkUnknowns: true}),
        makeCloneExactShape: () => createCloneExactShapeFn<[Inner, number]>(),
        stripDecoder: createJsonDecoderFn<[Inner, number]>(undefined, {strategy: 'strip'}),
        cloneEncoder: createJsonEncoderFn<[Inner, number]>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<[Inner, number]>(undefined, {strategy: 'direct'}),
      }),
    },
    'object in a tuple slot one property deep': {
      wire: '{"t":[{"a":"x","evil":1},2]}',
      reported: ['t', 0, 'evil'],
      clean: {t: [{a: 'x'}, 2]},
      fns: () => ({
        hasUnknownKeys: createHasUnknownKeysFn<{t: [Inner, number]}>(),
        unknownKeyErrors: createUnknownKeyErrorsFn<{t: [Inner, number]}>(),
        validateStrict: createValidateFn<{t: [Inner, number]}>(undefined, {checkUnknowns: true}),
        makeCloneExactShape: () => createCloneExactShapeFn<{t: [Inner, number]}>(),
        stripDecoder: createJsonDecoderFn<{t: [Inner, number]}>(undefined, {strategy: 'strip'}),
        cloneEncoder: createJsonEncoderFn<{t: [Inner, number]}>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<{t: [Inner, number]}>(undefined, {strategy: 'direct'}),
      }),
    },
    // An array is an ATOMIC member of the flat union layout, so this union has no object members at
    // all and every gate keyed on that used to hand the value straight through.
    'object inside the array member of a union': {
      wire: '[{"a":"x","evil":1}]',
      reported: [0, 'evil'],
      clean: [{a: 'x'}],
      fns: () => ({
        hasUnknownKeys: createHasUnknownKeysFn<Inner[] | number>(),
        unknownKeyErrors: createUnknownKeyErrorsFn<Inner[] | number>(),
        validateStrict: createValidateFn<Inner[] | number>(undefined, {checkUnknowns: true}),
        makeCloneExactShape: () => createCloneExactShapeFn<Inner[] | number>(),
        stripDecoder: createJsonDecoderFn<Inner[] | number>(undefined, {strategy: 'strip'}),
        cloneEncoder: createJsonEncoderFn<Inner[] | number>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<Inner[] | number>(undefined, {strategy: 'direct'}),
      }),
    },
    'object inside the tuple member of a union': {
      wire: '[{"a":"x","evil":1},2]',
      reported: [0, 'evil'],
      clean: [{a: 'x'}, 2],
      fns: () => ({
        hasUnknownKeys: createHasUnknownKeysFn<[Inner, number] | string>(),
        unknownKeyErrors: createUnknownKeyErrorsFn<[Inner, number] | string>(),
        validateStrict: createValidateFn<[Inner, number] | string>(undefined, {checkUnknowns: true}),
        makeCloneExactShape: () => createCloneExactShapeFn<[Inner, number] | string>(),
        stripDecoder: createJsonDecoderFn<[Inner, number] | string>(undefined, {strategy: 'strip'}),
        cloneEncoder: createJsonEncoderFn<[Inner, number] | string>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<[Inner, number] | string>(undefined, {strategy: 'direct'}),
      }),
    },
    // The plain case the rows above route around: both members are object literals, so the key is
    // undeclared on the member that matched and every family must still say so.
    'the matched member of a union of two object literals': {
      wire: '{"a":"x","evil":1}',
      reported: ['evil'],
      clean: {a: 'x'},
      cloneRefuses: true,
      fns: () => ({
        hasUnknownKeys: createHasUnknownKeysFn<TwoObjects>(),
        unknownKeyErrors: createUnknownKeyErrorsFn<TwoObjects>(),
        validateStrict: createValidateFn<TwoObjects>(undefined, {checkUnknowns: true}),
        makeCloneExactShape: () => createCloneExactShapeFn<TwoObjects>(),
        stripDecoder: createJsonDecoderFn<TwoObjects>(undefined, {strategy: 'strip'}),
        cloneEncoder: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'direct'}),
      }),
    },
  } satisfies Record<string, Row>;

  for (const [name, row] of Object.entries<Row>(rows)) {
    it(`reports, deletes or blanks an undeclared key ${name}`, () => {
      const fns = row.fns();
      const parse = () => JSON.parse(row.wire);

      expect(fns.hasUnknownKeys(parse()), 'hasUnknownKeys').toBe(true);
      expect(
        fns.unknownKeyErrors(parse()).map((error) => error.path),
        'unknownKeyErrors'
      ).toEqual([row.reported]);
      expect(fns.validateStrict(parse()), 'validate {checkUnknowns: true}').toBe(false);
      if (row.cloneRefuses) {
        expect(fns.makeCloneExactShape, 'cloneExactShape refuses an object-bearing union').toThrow(/CES001/);
      } else {
        expect(fns.makeCloneExactShape()(parse() as never), 'cloneExactShape').toStrictEqual(row.clean);
      }
      expect(JSON.parse(fns.cloneEncoder(parse()) as string), "encoder {strategy: 'clone'}").toStrictEqual(row.clean);
      expect(JSON.parse(fns.directEncoder(parse()) as string), "encoder {strategy: 'direct'}").toStrictEqual(row.clean);
      // The strip decoder blanks rather than deletes, its contract: the key stays own, set to undefined.
      const stripped = fns.stripDecoder(row.wire);
      const host = atPath(stripped, row.reported.slice(0, -1)) as Record<string, unknown>;
      expect(Object.hasOwn(host, 'evil'), "decoder {strategy: 'strip'} keeps the key").toBe(true);
      expect(host.evil, "decoder {strategy: 'strip'} blanks the key").toBeUndefined();
      // toEqual skips undefined-valued own keys, so this compares everything but the blank.
      expect(stripped, "decoder {strategy: 'strip'}").toEqual(row.clean);
    });
  }

  // An index signature declares EVERY key, so a record inverts every answer above: nothing is
  // undeclared, and a family that dropped `evil` here would be destroying the caller's data.
  it('keeps every key of a record, where the index signature declares them all', () => {
    const wire = '{"a":1,"evil":2}';
    const parse = () => JSON.parse(wire) as Counts;
    const all = {a: 1, evil: 2};

    expect(createHasUnknownKeysFn<Counts>()(parse()), 'hasUnknownKeys').toBe(false);
    expect(createUnknownKeyErrorsFn<Counts>()(parse()), 'unknownKeyErrors').toEqual([]);
    expect(createValidateFn<Counts>(undefined, {checkUnknowns: true})(parse()), 'validate {checkUnknowns: true}').toBe(true);
    expect(createCloneExactShapeFn<Counts>()(parse()), 'cloneExactShape').toStrictEqual(all);
    const cloneEncoded = createJsonEncoderFn<Counts>(undefined, {strategy: 'clone'})(parse()) as string;
    const directEncoded = createJsonEncoderFn<Counts>(undefined, {strategy: 'direct'})(parse()) as string;
    expect(JSON.parse(cloneEncoded), "encoder {strategy: 'clone'}").toStrictEqual(all);
    expect(JSON.parse(directEncoded), "encoder {strategy: 'direct'}").toStrictEqual(all);
    expect(createJsonDecoderFn<Counts>(undefined, {strategy: 'strip'})(wire), "decoder {strategy: 'strip'}").toStrictEqual(all);
  });

  // A union with an index-signature member: no codec can tell a stray key on the object member from
  // a key the record member declares, so every key stays, on a value that only the object member
  // matches. Strict validate is the one family that answers no, because it judges each member whole:
  // the record refuses the string `a`, the object literal refuses the extra key.
  it('keeps every key of a union whose member carries an index signature', () => {
    const wire = '{"a":"x","evil":1}';
    const parse = () => JSON.parse(wire) as CountsOrInner;
    const all = {a: 'x', evil: 1};

    expect(createHasUnknownKeysFn<CountsOrInner>()(parse()), 'hasUnknownKeys').toBe(false);
    expect(createUnknownKeyErrorsFn<CountsOrInner>()(parse()), 'unknownKeyErrors').toEqual([]);
    expect(createValidateFn<CountsOrInner>()(parse()), 'validate').toBe(true);
    expect(createValidateFn<CountsOrInner>(undefined, {checkUnknowns: true})(parse()), 'validate {checkUnknowns: true}').toBe(
      false
    );
    expect(() => createCloneExactShapeFn<CountsOrInner>(), 'cloneExactShape refuses an object-bearing union').toThrow(/CES001/);
    const cloneEncoded = createJsonEncoderFn<CountsOrInner>(undefined, {strategy: 'clone'})(parse()) as string;
    const directEncoded = createJsonEncoderFn<CountsOrInner>(undefined, {strategy: 'direct'})(parse()) as string;
    expect(JSON.parse(cloneEncoded), "encoder {strategy: 'clone'}").toStrictEqual(all);
    expect(JSON.parse(directEncoded), "encoder {strategy: 'direct'}").toStrictEqual(all);
    expect(createJsonDecoderFn<CountsOrInner>(undefined, {strategy: 'strip'})(wire), "decoder {strategy: 'strip'}").toStrictEqual(
      all
    );
  });

  // The other direction: a union carrying nothing keyed must stay compiled away, so the fix above
  // cannot have bought its coverage by making every union walk its members.
  it('leaves a union of primitives alone', () => {
    expect(createHasUnknownKeysFn<string | number>()('hello')).toBe(false);
    expect(createUnknownKeyErrorsFn<string | number>()('hello')).toEqual([]);
    expect(createJsonDecoderFn<string | number>(undefined, {strategy: 'strip'})('"hello"')).toBe('hello');
  });

  // The strict validator answers the right VERDICT for a union but a blunt path: it detects by
  // branch failure, not through the merged allowlist, so it names the union rather than the key.
  // That holds for every union, a plain union of object literals included, so changing it would
  // change how every union failure is reported. Pinned here so the current answer stays deliberate.
  it('names the union, not the key, when a union branch fails on an unknown key', () => {
    const errors = createGetValidationErrorsFn<Inner[] | number>(undefined, {checkUnknowns: true});
    expect(errors([{a: 'x', evil: 1}] as never)).toEqual([{expected: 'union', path: []}]);
    const objectUnion = createGetValidationErrorsFn<TwoObjects>(undefined, {checkUnknowns: true});
    expect(objectUnion({a: 'x', evil: 1} as never)).toEqual([{expected: 'union', path: []}]);
  });
});
