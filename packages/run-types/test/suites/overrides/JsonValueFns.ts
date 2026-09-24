// A type whose JSON encoder and decoder are overridden must still get its value-level JSON functions,
// directly and nested inside another type: a route or a caller asks for them without the composite.

import {it, expect} from 'vitest';
import {
  createPrepareForJsonFn,
  createRestoreFromJsonFn,
  createStringifyJsonFn,
  createStripUnknownKeysFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  overrideJsonEncoder,
  overrideJsonDecoder,
} from '@mionjs/run-types';

type JsonValueTarget = {readonly __brand: 'jsonValueOverride'; id: bigint; when: Date};
overrideJsonEncoder<JsonValueTarget>((v) => 'OVR' + (v as JsonValueTarget).id.toString());
overrideJsonDecoder<JsonValueTarget>((s) => ({id: BigInt((s as string).slice(3)), when: new Date(0)}) as never);

type JsonValueParent = {inner: JsonValueTarget};

const target = (): JsonValueTarget => ({__brand: 'jsonValueOverride', id: 7n, when: new Date('2020-01-02T03:04:05.000Z')});

const roundTrip = <T>(prepare: (v: T) => unknown, restore: (v: unknown) => T, value: T): T =>
  restore(JSON.parse(JSON.stringify(prepare(value))));

export function registerJsonValueFnsCase(): void {
  it('JsonValueFns — the encoder override still redirects', () => {
    expect(createJsonEncoderFn<JsonValueTarget>()(target())).toBe('OVR7');
    expect(createJsonDecoderFn<JsonValueTarget>()('OVR7').id).toBe(7n);
  });

  it('JsonValueFns — prepare / restore round-trip the overridden type, clone and mutate', () => {
    const prepared = createPrepareForJsonFn<JsonValueTarget>()(target()) as unknown as {id: unknown};
    expect(prepared.id).toBe('7');
    const cloneRestore = createRestoreFromJsonFn<JsonValueTarget>();
    expect(roundTrip(createPrepareForJsonFn<JsonValueTarget>(), cloneRestore, target())).toEqual(target());
    const mutatePrepare = createPrepareForJsonFn<JsonValueTarget>(undefined, {strategy: 'mutate'});
    const mutateRestore = createRestoreFromJsonFn<JsonValueTarget>(undefined, {strategy: 'mutate'});
    expect(roundTrip(mutatePrepare, mutateRestore, target())).toEqual(target());
  });

  it('JsonValueFns — the value-first call shape compiles the same functions', () => {
    expect(createPrepareForJsonFn(target())).toBe(createPrepareForJsonFn<JsonValueTarget>());
    expect(createRestoreFromJsonFn(target())).toBe(createRestoreFromJsonFn<JsonValueTarget>());
  });

  it('JsonValueFns — prepare / restore round-trip the overridden type nested in a parent', () => {
    const value: JsonValueParent = {inner: target()};
    const clone = roundTrip(createPrepareForJsonFn<JsonValueParent>(), createRestoreFromJsonFn<JsonValueParent>(), value);
    expect(clone).toEqual(value);
    const mutatePrepare = createPrepareForJsonFn<JsonValueParent>(undefined, {strategy: 'mutate'});
    const mutateRestore = createRestoreFromJsonFn<JsonValueParent>(undefined, {strategy: 'mutate'});
    expect(roundTrip(mutatePrepare, mutateRestore, {inner: target()})).toEqual(value);
  });

  it('JsonValueFns — stringify and strip-unknown-keys compile for the overridden type', () => {
    expect(JSON.parse(createStringifyJsonFn<JsonValueTarget>()(target()) as string)).toEqual({
      __brand: 'jsonValueOverride',
      id: '7',
      when: '2020-01-02T03:04:05.000Z',
    });
    const wire = createStripUnknownKeysFn<JsonValueTarget>()({id: '7', when: 'x', extra: 1} as never) as unknown as {
      extra?: number;
    };
    expect(wire.extra).toBeUndefined();
  });
}
