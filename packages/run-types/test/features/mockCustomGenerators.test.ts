// Custom mock generators: a name declared on CustomMockGenerators and registered once mocks like a built-in,
// standalone, nested, from a MockData node and under a seed. An unregistered name and a reused name throw.

import {describe, it, expect} from 'vitest';
import {createValidateFn} from '@mionjs/run-types';
import {createMockDataFn, registerMockGenerator, type GeneratorContext} from '@mionjs/run-types/mocking';
import * as TF from '@mionjs/run-types/formats';

declare module '@mionjs/run-types/formats' {
  interface CustomMockGenerators {
    phoneNumberUk: true;
    neverRegistered: true;
    returnsNumber: true;
    alwaysUpper: true;
  }
}

const ukPhone = ({random}: GeneratorContext) => '+44 7' + random.string(9, '0123456789');
registerMockGenerator('phoneNumberUk', ukPhone);

type Contact = {name: string; phone: TF.String<{maxLength: 16; generator: 'phoneNumberUk'}>};
const UK = /^\+44 7\d{9}$/;

describe('custom mock generators', () => {
  it('mock a registered name, standalone and nested (static)', () => {
    const validate = createValidateFn<Contact>();
    const mock = createMockDataFn<Contact>();
    for (let i = 0; i < 50; i++) {
      const contact = mock();
      expect(validate(contact)).toBe(true);
      expect(contact.phone).toMatch(UK);
    }
    expect(createMockDataFn<TF.String<{generator: 'phoneNumberUk'}>>()()).toMatch(UK);
  });

  it('mock a registered name (value)', () => {
    const sample = {name: 'Ann', phone: '+44 7000000000'} as Contact;
    expect(createMockDataFn(sample)().phone).toMatch(UK);
  });

  it('a MockData node names the generator for a plain string field', () => {
    const mock = createMockDataFn<{phone: string}>(undefined, {data: {phone: {pool: [], generator: 'phoneNumberUk'}}});
    expect(mock().phone).toMatch(UK);
  });

  it('repeat under a seed', () => {
    const mock = createMockDataFn<Contact>();
    expect(mock({mock: {seed: 7}})).toEqual(mock({mock: {seed: 7}}));
  });

  it('throw on a name nobody registered', () => {
    const mock = createMockDataFn<TF.String<{generator: 'neverRegistered'}>>();
    expect(() => mock()).toThrow(/`neverRegistered` is not registered; call registerMockGenerator/);
  });

  it('throw on a value that is not a string', () => {
    registerMockGenerator('returnsNumber', () => 42 as unknown as string);
    expect(() => createMockDataFn<TF.String<{generator: 'returnsNumber'}>>()()).toThrow(
      /`returnsNumber` returned a number, not a string/
    );
  });

  it("throw after 64 values the format's char rules reject", () => {
    registerMockGenerator('alwaysUpper', () => 'ABC');
    const mock = createMockDataFn<TF.String<{allowedChars: {val: 'abc'}; generator: 'alwaysUpper'}>>();
    expect(() => mock()).toThrow(/`alwaysUpper`: 64 values failed the format's pattern, allowedChars or disallowedChars/);
  });

  it('refuse a registration that is not a function', () => {
    expect(() => registerMockGenerator('neverRegistered', 'nope' as never)).toThrow(/`neverRegistered` needs a function/);
  });

  it('refuse a built-in name and a second registration', () => {
    expect(() => registerMockGenerator('lastName' as 'phoneNumberUk', ukPhone)).toThrow(/built-in generator/);
    expect(() => registerMockGenerator('phoneNumberUk', ukPhone)).toThrow(/already registered/);
  });
});
