// Every family that answers "which keys are not declared by this type" held against the others, on
// one value per shape. They are emitted separately, per kind, in four different Go files, and they
// drifted apart three times: an object inside an array member of a union, a tuple slot, and a tuple
// slot one property deep. Each time the leak faced UNTRUSTED input (the strip decoder is what a
// server runs on a caller's payload) and nothing downstream caught it, because `validate` accepts
// undeclared keys on an object literal by design.
//
// The value fuzz owns the random half of this. This suite owns the shapes: one row per position an
// undeclared key can hide in, every family asserted on the same value, so a family that stops
// agreeing names itself.

import {describe, expect, it} from 'vitest';
import {
  createCloneExactShapeFn,
  createGetValidationErrorsFn,
  createHasUnknownKeysFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createUnknownKeyErrorsFn,
  createValidateFn,
} from '../../src/index.ts';

type Inner = {a: string};

/** The families answer in three currencies, so each row says what "agrees" means for it:
 *  a boolean, a list of paths, or a value with the key gone. **/
interface Row {
  /** The wire the caller sent, with one undeclared `evil` key planted. **/
  wire: string;
  /** The path `unknownKeyErrors` must report for that key. **/
  reported: (string | number)[];
  /** The value every stripping family must produce. **/
  clean: unknown;
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
        cloneExactShape: createCloneExactShapeFn<Inner>(),
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
        cloneExactShape: createCloneExactShapeFn<Inner[]>(),
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
        cloneExactShape: createCloneExactShapeFn<[Inner, number]>(),
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
        cloneExactShape: createCloneExactShapeFn<{t: [Inner, number]}>(),
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
        cloneExactShape: createCloneExactShapeFn<Inner[] | number>(),
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
        cloneExactShape: createCloneExactShapeFn<[Inner, number] | string>(),
        stripDecoder: createJsonDecoderFn<[Inner, number] | string>(undefined, {strategy: 'strip'}),
        cloneEncoder: createJsonEncoderFn<[Inner, number] | string>(undefined, {strategy: 'clone'}),
        directEncoder: createJsonEncoderFn<[Inner, number] | string>(undefined, {strategy: 'direct'}),
      }),
    },
  } satisfies Record<string, Row & {fns: () => Record<string, any>}>;

  for (const [name, row] of Object.entries(rows)) {
    it(`reports and removes an undeclared key ${name}`, () => {
      const fns = row.fns();
      const parse = () => JSON.parse(row.wire);

      expect(fns.hasUnknownKeys(parse()), 'hasUnknownKeys').toBe(true);
      expect(
        fns.unknownKeyErrors(parse()).map((e: any) => e.path),
        'unknownKeyErrors'
      ).toEqual([row.reported]);
      expect(fns.validateStrict(parse()), 'validate {checkUnknowns: true}').toBe(false);
      expect(fns.cloneExactShape(parse()), 'cloneExactShape').toEqual(row.clean);
      expect(fns.stripDecoder(row.wire), "decoder {strategy: 'strip'}").toEqual(row.clean);
      expect(JSON.parse(fns.cloneEncoder(parse()) as string), "encoder {strategy: 'clone'}").toEqual(row.clean);
      expect(JSON.parse(fns.directEncoder(parse()) as string), "encoder {strategy: 'direct'}").toEqual(row.clean);
    });
  }

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
  });
});
