// A class `#field` has no key outside the class. Reflected under the checker's internal name, validate required
// that key on every instance (so it always failed) and the JSON encoder wrote it out.

import {describe, expect, test} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, createValidateFn} from '@mionjs/run-types';

class Counter {
  #count = 0;
  label = 'clicks';
  bump(): number {
    return ++this.#count;
  }
}

const counter = new Counter();

describe('class with a #private field', () => {
  test('validate accepts a real instance, type form', () => {
    const isCounter = createValidateFn<Counter>();
    expect(isCounter(counter)).toBe(true);
    expect(isCounter({label: 1})).toBe(false);
  });

  test('validate accepts a real instance, value form', () => {
    const isCounter = createValidateFn(counter);
    expect(isCounter(counter)).toBe(true);
    expect(isCounter({label: 1})).toBe(false);
  });

  test('validate accepts it one level deeper', () => {
    const isHolder = createValidateFn<{counter: Counter}>();
    expect(isHolder({counter})).toBe(true);
  });

  test('JSON writes only the declared data keys', () => {
    const encode = createJsonEncoderFn<{counter: Counter}>();
    const decode = createJsonDecoderFn<{counter: Counter}>();
    const json = encode({counter}) as string;
    expect(JSON.parse(json)).toEqual({counter: {label: 'clicks'}});
    expect((decode(json) as {counter: Counter}).counter.label).toBe('clicks');
  });
});
