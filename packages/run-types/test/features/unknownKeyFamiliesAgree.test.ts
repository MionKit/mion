// Every family that answers "which keys are not declared by this type" held against the others, on
// one value per shape. They are emitted separately, per kind, in four different Go files, and a
// family that stops reaching a position faces UNTRUSTED input (the clone decoder is what a server
// runs on a caller's payload) with nothing downstream to catch it: `validate` accepts undeclared
// keys on an object literal by design.
//
// The value fuzz owns the random half of this. This suite owns the shapes: one row per position an
// undeclared key can hide in, every family asserted on the same value, so a family that stops
// agreeing names itself. A shape whose index signature declares every key answers the other way
// round, so it gets its own test below rather than a row.

import {describe, expect, it} from 'vitest';
import {
  createRemoveUnknownKeysFn,
  createGetValidationErrorsFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createValidateFn,
  type GetValidationErrorsFn,
  type InjectTypeFnArgs,
  type JsonDecoderFn,
  type JsonEncoderFn,
} from '../../src/index.ts';
import {getRTFunction} from '../../src/runtime/index.ts';

type Inner = {a: string};
type TwoObjects = Inner | {b: number};
type Cat = {kind: 'cat'; meows: boolean};
type Dog = {kind: 'dog'; barks: number};
type Pet = Cat | Dog;
type Counts = Record<string, number>;
type CountsOrInner = Counts | Inner;

/** The families answer in three currencies, so each row says what "agrees" means for it:
 *  a boolean, a list of paths, or a value with the key gone. **/
interface Row {
  /** The wire the caller sent, with one undeclared `evil` key planted. **/
  wire: string;
  /** Reported by the strict errors form unless the row is a union. **/
  reported: (string | number)[];
  /** The strict errors form names a union at the root: the key is only undeclared relative to a branch. **/
  union?: true;
  /** The value every deleting family must produce. **/
  clean: unknown;
  /** Set for a union with object members: `removeUnknownKeys` refuses it, not knowing which member to rebuild. **/
  cloneRefuses?: true;
  fns: () => {
    errorsStrict: GetValidationErrorsFn;
    /** `T` varies per row and `ValidateFn<T>` / `RemoveUnknownKeysFn<T>` depend on it, so these are typed loosely. **/
    validateStrict: (value: unknown) => boolean;
    /** Held back unbuilt: a refusing row throws at factory creation, not on the call. **/
    makeRemoveUnknownKeys: () => (value: never) => unknown;
    cloneJsonDecoder: JsonDecoderFn;
    cloneEncoder: JsonEncoderFn;
  };
}

/** Follow an object / array path through a value. **/
function atPath(value: unknown, path: readonly (string | number)[]): unknown {
  return path.reduce<unknown>((cursor, segment) => (cursor as Record<string | number, unknown>)[segment], value);
}

/** The decode half of the `clone` route mion serves: the `rjs` family has no createX factory, so it
 *  is recovered through a marker, the same shape a framework wrapper uses. **/
function cloneDecoder<T>(id?: InjectTypeFnArgs<T, 'restoreFromJsonClone'>) {
  return getRTFunction<'restoreFromJsonClone'>(id);
}

/** The pooled allowlist the codecs read on `Pet`. **/
const PET_KEYS = new Set(['kind', 'meows', 'barks']);
const undeclaredOnPet = (value: Pet) => Object.keys(value).filter((key) => !PET_KEYS.has(key));

describe('every unknown-key family agrees', () => {
  const rows = {
    'flat object': {
      wire: '{"a":"x","evil":1}',
      reported: ['evil'],
      clean: {a: 'x'},
      fns: () => ({
        errorsStrict: createGetValidationErrorsFn<Inner>(undefined, {checkUnknowns: true}),
        validateStrict: createValidateFn<Inner>(undefined, {checkUnknowns: true}),
        makeRemoveUnknownKeys: () => createRemoveUnknownKeysFn<Inner>(),
        cloneJsonDecoder: createJsonDecoderFn<Inner>(undefined, {strategy: 'clone'}),
        cloneEncoder: createJsonEncoderFn<Inner>(undefined, {strategy: 'clone'}),
      }),
    },
    'object inside an array': {
      wire: '[{"a":"x","evil":1}]',
      reported: [0, 'evil'],
      clean: [{a: 'x'}],
      fns: () => ({
        errorsStrict: createGetValidationErrorsFn<Inner[]>(undefined, {checkUnknowns: true}),
        validateStrict: createValidateFn<Inner[]>(undefined, {checkUnknowns: true}),
        makeRemoveUnknownKeys: () => createRemoveUnknownKeysFn<Inner[]>(),
        cloneJsonDecoder: createJsonDecoderFn<Inner[]>(undefined, {strategy: 'clone'}),
        cloneEncoder: createJsonEncoderFn<Inner[]>(undefined, {strategy: 'clone'}),
      }),
    },
    'object in a tuple slot': {
      wire: '[{"a":"x","evil":1},2]',
      reported: [0, 'evil'],
      clean: [{a: 'x'}, 2],
      fns: () => ({
        errorsStrict: createGetValidationErrorsFn<[Inner, number]>(undefined, {checkUnknowns: true}),
        validateStrict: createValidateFn<[Inner, number]>(undefined, {checkUnknowns: true}),
        makeRemoveUnknownKeys: () => createRemoveUnknownKeysFn<[Inner, number]>(),
        cloneJsonDecoder: createJsonDecoderFn<[Inner, number]>(undefined, {strategy: 'clone'}),
        cloneEncoder: createJsonEncoderFn<[Inner, number]>(undefined, {strategy: 'clone'}),
      }),
    },
    'object in a tuple slot one property deep': {
      wire: '{"t":[{"a":"x","evil":1},2]}',
      reported: ['t', 0, 'evil'],
      clean: {t: [{a: 'x'}, 2]},
      fns: () => ({
        errorsStrict: createGetValidationErrorsFn<{t: [Inner, number]}>(undefined, {checkUnknowns: true}),
        validateStrict: createValidateFn<{t: [Inner, number]}>(undefined, {checkUnknowns: true}),
        makeRemoveUnknownKeys: () => createRemoveUnknownKeysFn<{t: [Inner, number]}>(),
        cloneJsonDecoder: createJsonDecoderFn<{t: [Inner, number]}>(undefined, {strategy: 'clone'}),
        cloneEncoder: createJsonEncoderFn<{t: [Inner, number]}>(undefined, {strategy: 'clone'}),
      }),
    },
    // An array is an ATOMIC member of the flat union layout, so this union has no object members at
    // all and every gate keyed on that used to hand the value straight through.
    'object inside the array member of a union': {
      wire: '[{"a":"x","evil":1}]',
      reported: [0, 'evil'],
      clean: [{a: 'x'}],
      union: true,
      fns: () => ({
        errorsStrict: createGetValidationErrorsFn<Inner[] | number>(undefined, {checkUnknowns: true}),
        validateStrict: createValidateFn<Inner[] | number>(undefined, {checkUnknowns: true}),
        makeRemoveUnknownKeys: () => createRemoveUnknownKeysFn<Inner[] | number>(),
        cloneJsonDecoder: createJsonDecoderFn<Inner[] | number>(undefined, {strategy: 'clone'}),
        cloneEncoder: createJsonEncoderFn<Inner[] | number>(undefined, {strategy: 'clone'}),
      }),
    },
    'object inside the tuple member of a union': {
      wire: '[{"a":"x","evil":1},2]',
      reported: [0, 'evil'],
      clean: [{a: 'x'}, 2],
      union: true,
      fns: () => ({
        errorsStrict: createGetValidationErrorsFn<[Inner, number] | string>(undefined, {checkUnknowns: true}),
        validateStrict: createValidateFn<[Inner, number] | string>(undefined, {checkUnknowns: true}),
        makeRemoveUnknownKeys: () => createRemoveUnknownKeysFn<[Inner, number] | string>(),
        cloneJsonDecoder: createJsonDecoderFn<[Inner, number] | string>(undefined, {strategy: 'clone'}),
        cloneEncoder: createJsonEncoderFn<[Inner, number] | string>(undefined, {strategy: 'clone'}),
      }),
    },
    // The plain case the rows above route around: both members are object literals, so the key is
    // undeclared on the member that matched and every family must still say so.
    'the matched member of a union of two object literals': {
      wire: '{"a":"x","evil":1}',
      reported: ['evil'],
      clean: {a: 'x'},
      cloneRefuses: true,
      union: true,
      fns: () => ({
        errorsStrict: createGetValidationErrorsFn<TwoObjects>(undefined, {checkUnknowns: true}),
        validateStrict: createValidateFn<TwoObjects>(undefined, {checkUnknowns: true}),
        // @mion-downgrade-error RUK001
        makeRemoveUnknownKeys: () => createRemoveUnknownKeysFn<TwoObjects>(),
        cloneJsonDecoder: createJsonDecoderFn<TwoObjects>(undefined, {strategy: 'clone'}),
        cloneEncoder: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'clone'}),
      }),
    },
  } satisfies Record<string, Row>;

  for (const [name, row] of Object.entries<Row>(rows)) {
    it(`reports or deletes an undeclared key ${name}`, () => {
      const fns = row.fns();
      const parse = () => JSON.parse(row.wire);

      const expectedErrors = row.union ? [{expected: 'union', path: []}] : [{expected: 'never', path: row.reported}];
      expect(fns.errorsStrict(parse()), 'validation errors {checkUnknowns: true}').toEqual(expectedErrors);
      expect(fns.validateStrict(parse()), 'validate {checkUnknowns: true}').toBe(false);
      if (row.cloneRefuses) {
        expect(fns.makeRemoveUnknownKeys, 'removeUnknownKeys refuses an object-bearing union').toThrow(/RUK001/);
      } else {
        expect(fns.makeRemoveUnknownKeys()(parse() as never), 'removeUnknownKeys').toStrictEqual(row.clean);
      }
      expect(JSON.parse(fns.cloneEncoder(parse()) as string), "encoder {strategy: 'clone'}").toStrictEqual(row.clean);
      const decoded = fns.cloneJsonDecoder(row.wire);
      const host = atPath(decoded, row.reported.slice(0, -1)) as Record<string, unknown>;
      expect('evil' in host, "decoder {strategy: 'clone'} drops the key").toBe(false);
      expect(decoded, "decoder {strategy: 'clone'}").toStrictEqual(row.clean);
    });
  }

  // An index signature declares EVERY key, so a record inverts every answer above: nothing is
  // undeclared, and a family that dropped `evil` here would be destroying the caller's data.
  it('keeps every key of a record, where the index signature declares them all', () => {
    const wire = '{"a":1,"evil":2}';
    const parse = () => JSON.parse(wire) as Counts;
    const all = {a: 1, evil: 2};

    expect(
      createGetValidationErrorsFn<Counts>(undefined, {checkUnknowns: true})(parse()),
      'validation errors {checkUnknowns: true}'
    ).toEqual([]);
    expect(createValidateFn<Counts>(undefined, {checkUnknowns: true})(parse()), 'validate {checkUnknowns: true}').toBe(true);
    expect(createRemoveUnknownKeysFn<Counts>()(parse()), 'removeUnknownKeys').toStrictEqual(all);
    const cloneEncoded = createJsonEncoderFn<Counts>(undefined, {strategy: 'clone'})(parse()) as string;
    expect(JSON.parse(cloneEncoded), "encoder {strategy: 'clone'}").toStrictEqual(all);
    expect(createJsonDecoderFn<Counts>(undefined, {strategy: 'clone'})(wire), "decoder {strategy: 'clone'}").toStrictEqual(all);
  });

  // No codec can tell a stray key from one the record member declares, so every key stays.
  // The strict validator refuses it: the record rejects the string `a`, the object literal the extra key.
  it('keeps every key of a union whose member carries an index signature', () => {
    const wire = '{"a":"x","evil":1}';
    const parse = () => JSON.parse(wire) as CountsOrInner;
    const all = {a: 'x', evil: 1};

    expect(createValidateFn<CountsOrInner>()(parse()), 'validate').toBe(true);
    expect(createValidateFn<CountsOrInner>(undefined, {checkUnknowns: true})(parse()), 'validate {checkUnknowns: true}').toBe(
      false
    );
    // @mion-downgrade-error RUK001
    expect(() => createRemoveUnknownKeysFn<CountsOrInner>(), 'removeUnknownKeys refuses an object-bearing union').toThrow(
      /RUK001/
    );
    const cloneEncoded = createJsonEncoderFn<CountsOrInner>(undefined, {strategy: 'clone'})(parse()) as string;
    expect(JSON.parse(cloneEncoded), "encoder {strategy: 'clone'}").toStrictEqual(all);
    expect(createJsonDecoderFn<CountsOrInner>(undefined, {strategy: 'clone'})(wire), "decoder {strategy: 'clone'}").toStrictEqual(
      all
    );
  });

  // No key is undeclared (the record declares all), yet no member matches strictly: the record rejects `a`, the literal `evil`.
  it('an undeclared key and a shape mismatch are different questions', () => {
    const wire = '{"a":"x","evil":1}';
    const parse = () => JSON.parse(wire) as CountsOrInner;

    expect(createJsonDecoderFn<CountsOrInner>(undefined, {strategy: 'clone'})(wire), 'no key is undeclared').toStrictEqual({
      a: 'x',
      evil: 1,
    });
    expect(createValidateFn<CountsOrInner>()(parse()), 'the value matches a member loosely').toBe(true);
    expect(createValidateFn<CountsOrInner>(undefined, {checkUnknowns: true})(parse()), 'no member matches it strictly').toBe(
      false
    );
  });

  // Every codec pools the members' keys (as `undeclaredOnPet` does by hand), so a cat carrying `barks` survives.
  // Only the strict validator asks the MATCHED member; a codec never validates, so it never learns which one matched.
  it('keeps a key belonging to ANOTHER member of a union, the same answer the pooled list gives', () => {
    const wire = '{"kind":"cat","meows":true,"barks":3}';
    const parse = () => JSON.parse(wire) as Pet;
    const all = {kind: 'cat', meows: true, barks: 3};

    expect(undeclaredOnPet(parse()), 'pooled list').toEqual([]);

    const cloneEncoded = createJsonEncoderFn<Pet>(undefined, {strategy: 'clone'})(parse()) as string;
    const compactWire = createJsonEncoderFn<Pet>(undefined, {strategy: 'compact'})(parse()) as string;
    expect(JSON.parse(cloneEncoded), "encoder {strategy: 'clone'}").toStrictEqual(all);
    expect(createJsonDecoderFn<Pet>(undefined, {strategy: 'compact'})(compactWire), 'compact round trip').toStrictEqual(all);
    expect(createJsonDecoderFn<Pet>(undefined, {strategy: 'clone'})(wire), "decoder {strategy: 'clone'}").toStrictEqual(all);
    expect(cloneDecoder<Pet>()(parse()), 'rjs, the clone route decoder').toStrictEqual(all);

    // The only family that reads the matched branch rather than the pooled list.
    expect(createValidateFn<Pet>(undefined, {checkUnknowns: true})(parse()), 'validate {checkUnknowns: true}').toBe(false);
  });

  // A key NO member declares is undeclared on every road: the half that must never drift.
  it('drops a key belonging to NO member of a union, on every road that strips', () => {
    const wire = '{"kind":"cat","meows":true,"zzz":9}';
    const parse = () => JSON.parse(wire) as Pet;
    const clean = {kind: 'cat', meows: true};

    expect(undeclaredOnPet(parse()), 'pooled list').toEqual(['zzz']);

    const cloneEncoded = createJsonEncoderFn<Pet>(undefined, {strategy: 'clone'})(parse()) as string;
    const compactWire = createJsonEncoderFn<Pet>(undefined, {strategy: 'compact'})(parse()) as string;
    expect(JSON.parse(cloneEncoded), "encoder {strategy: 'clone'}").toStrictEqual(clean);
    expect(createJsonDecoderFn<Pet>(undefined, {strategy: 'compact'})(compactWire), 'compact round trip').toStrictEqual(clean);
    expect(cloneDecoder<Pet>()(parse()), 'rjs, the clone route decoder').toStrictEqual(clean);
    expect(createJsonDecoderFn<Pet>(undefined, {strategy: 'clone'})(wire), "decoder {strategy: 'clone'}").toStrictEqual(clean);

    expect(createValidateFn<Pet>(undefined, {checkUnknowns: true})(parse()), 'validate {checkUnknowns: true}').toBe(false);
  });

  // The other direction: a union carrying nothing keyed must stay compiled away, so the fix above
  // cannot have bought its coverage by making every union walk its members.
  it('leaves a union of primitives alone', () => {
    expect(createValidateFn<string | number>(undefined, {checkUnknowns: true})('hello')).toBe(true);
    expect(createGetValidationErrorsFn<string | number>(undefined, {checkUnknowns: true})('hello')).toEqual([]);
    expect(createJsonDecoderFn<string | number>(undefined, {strategy: 'clone'})('"hello"')).toBe('hello');
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
