// A class `#field` has no key outside the class. Reflected under the checker's internal name, validate required
// that key on every instance (so it always failed) and the JSON encoder wrote it out.

import {describe, expect, test} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, createValidateFn} from '@mionjs/run-types';
import {registerClassSerializer} from '@mionjs/run-types/runtime';

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
    const holder = {counter};
    expect(createValidateFn(holder)(holder)).toBe(true);
  });

  test('JSON writes only the declared data keys', () => {
    const encode = createJsonEncoderFn<{counter: Counter}>();
    const decode = createJsonDecoderFn<{counter: Counter}>();
    const json = encode({counter}) as string;
    expect(JSON.parse(json)).toEqual({counter: {label: 'clicks'}});
    expect((decode(json) as {counter: Counter}).counter.label).toBe('clicks');
    const holder = {counter};
    expect(JSON.parse(createJsonEncoderFn(holder)(holder) as string)).toEqual({counter: {label: 'clicks'}});
  });
});

// TS `private` / `protected` is only a compile-time word: the fields are data, checked and sent like public ones.
class Wallet {
  owner = 'ann';
  private balance = 10;
  protected currency = 'EUR';
  deposit(amount: number): number {
    return (this.balance += amount);
  }
}

registerClassSerializer(Wallet);

const wallet = new Wallet();
const brokeWallet = Object.assign(new Wallet(), {balance: 'ten'});
const noCurrency = {owner: 'ann', balance: 10};

describe('class with TS private and protected fields', () => {
  test('validate checks them like public fields, type form', () => {
    const isWallet = createValidateFn<Wallet>();
    expect(isWallet(wallet)).toBe(true);
    expect(isWallet(brokeWallet)).toBe(false);
    expect(isWallet(noCurrency)).toBe(false);
  });

  test('validate checks them like public fields, value form', () => {
    const isWallet = createValidateFn(wallet);
    expect(isWallet(wallet)).toBe(true);
    expect(isWallet(brokeWallet)).toBe(false);
    expect(isWallet(noCurrency)).toBe(false);
  });

  test('a registered class gets its private state back, both forms', () => {
    const json = createJsonEncoderFn<Wallet>()(wallet) as string;
    expect(JSON.parse(json)).toEqual({owner: 'ann', balance: 10, currency: 'EUR'});
    const decoded = createJsonDecoderFn<Wallet>()(json) as Wallet;
    expect(decoded).toBeInstanceOf(Wallet);
    expect(decoded.deposit(5)).toBe(15);
    expect(JSON.parse(createJsonEncoderFn(wallet)(wallet) as string)).toEqual({owner: 'ann', balance: 10, currency: 'EUR'});
    expect((createJsonDecoderFn(wallet)(json) as Wallet).deposit(1)).toBe(11);
  });
});

// What plain tsc writes in a .d.ts: private members lose their type, and a method looks just like a field.
declare class TscLedger {
  id: string;
  private balance;
  private audit;
}

describe('class from a plain tsc .d.ts, with marker-untyped-private-member turned off', () => {
  test('a typeless private member is an optional any, type form', () => {
    // @mion-downgrade-error marker-untyped-private-member
    const isLedger = createValidateFn<TscLedger>();
    expect(isLedger({id: 'a'})).toBe(true);
    expect(isLedger({id: 'a', balance: 'anything'})).toBe(true);
    expect(isLedger({id: 1})).toBe(false);
  });

  test('a typeless private member is an optional any, value form', () => {
    const ledger = {id: 'a'} as unknown as TscLedger;
    // @mion-downgrade-error marker-untyped-private-member
    const isLedger = createValidateFn(ledger);
    expect(isLedger({id: 'a'})).toBe(true);
    expect(isLedger({id: 1})).toBe(false);
  });
});
