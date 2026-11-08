// Built-in generators pass their own validator; the type-first block pins both createMockDataFn call shapes.

import {describe, it, expect} from 'vitest';
import {createValidateFn, type RunType} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import {GEN} from '@mionjs/run-types/formats';

const DRAWS = 200;

// One schema per built-in, plus the shape each output must have.
const GENERATORS: Record<string, [RunType<string>, RegExp]> = {
  city: [TF.string({generator: GEN.city}), /^[A-Z][A-Za-z]*( [A-Za-z]+)*$/],
  companyName: [TF.string({generator: GEN.companyName}), /^[A-Z][a-z]+( - | and |, | )[A-Z][A-Za-z]+( and [A-Z][a-z]+)?$/],
  country: [TF.string({generator: GEN.country}), /^[A-Z][a-z]+( [A-Z][a-z]+)*$/],
  email: [TF.string({generator: GEN.email}), /^[a-z]+_[a-z]+@[a-z]+\.[a-z]+$/],
  firstName: [TF.string({generator: GEN.firstName}), /^[A-Z][a-z]+$/],
  fullName: [TF.string({generator: GEN.fullName}), /^[A-Z][a-z]+ [A-Z][a-z]+$/],
  jobTitle: [TF.string({generator: GEN.jobTitle}), /^[A-Za-z]+( [A-Za-z]+)*$/],
  lastName: [TF.string({generator: GEN.lastName}), /^[A-Z][a-z]+$/],
  loremIpsum: [TF.string({generator: GEN.loremIpsum}), /^[A-Z][a-z]*( [a-z]+)*\.$/],
  phoneCountryCode: [TF.string({generator: GEN.phoneCountryCode}), /^\+[1-9]\d{0,2}$/],
  phoneNumber: [TF.string({generator: GEN.phoneNumber}), /^\+[1-9]\d{9,12}$/],
  phoneNumberLocal: [TF.string({generator: GEN.phoneNumberLocal}), /^[1-9]\d{7,10}$/],
  postcode: [TF.string({generator: GEN.postcode}), /^\d{5}(-\d{4})?$/],
  state: [TF.string({generator: GEN.state}), /^[A-Z][a-z]+( [A-Z][a-z]+)?$/],
  streetAddress: [TF.string({generator: GEN.streetAddress}), /^[1-9]\d{0,3} [A-Z][a-z]+ [A-Z][a-z]+$/],
};

describe('mock generators: every built-in', () => {
  for (const [name, [schema, shape]] of Object.entries(GENERATORS)) {
    it(`${name}: every draw validates and has the expected shape`, () => {
      const validate = createValidateFn(schema);
      const mock = createMockDataFn(schema);
      for (let i = 0; i < DRAWS; i++) {
        const value = mock();
        expect(validate(value), value).toBe(true);
        expect(value).toMatch(shape);
      }
    });
  }
});

describe('mock generators: under the format rules', () => {
  const bounded: Record<string, RunType<string>> = {
    'fullName within 6..8': TF.string({generator: GEN.fullName, minLength: 6, maxLength: 8}),
    'companyName exactly 12': TF.string({generator: GEN.companyName, length: 12}),
    'loremIpsum 200..220': TF.string({generator: GEN.loremIpsum, minLength: 200, maxLength: 220}),
    'loremIpsum up to 3': TF.string({generator: GEN.loremIpsum, maxLength: 3}),
    'postcode exactly 10': TF.string({generator: GEN.postcode, length: 10}),
    'phoneNumber exactly 11': TF.string({generator: GEN.phoneNumber, length: 11}),
    'streetAddress up to 10': TF.string({generator: GEN.streetAddress, maxLength: 10}),
    'firstName lowercase only': TF.string({generator: GEN.firstName, transform: {lowercase: true}}),
    'city without spaces': TF.string({generator: GEN.city, disallowedChars: {val: ' ', mockSamples: 'x'}}),
    'Alpha firstName up to 4': TF.alpha({generator: GEN.firstName, maxLength: 4}),
  };
  for (const [label, schema] of Object.entries(bounded)) {
    it(`${label}: every draw validates`, () => {
      const validate = createValidateFn(schema);
      const mock = createMockDataFn(schema);
      for (let i = 0; i < DRAWS; i++) {
        const value = mock();
        expect(validate(value), value).toBe(true);
      }
    });
  }

  it('a contains child built from a generator', () => {
    const schema = RT.array(TF.string(), {contains: TF.string({generator: GEN.postcode, length: 5}), minContains: 1});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema);
    for (let i = 0; i < DRAWS; i++) expect(validate(mock())).toBe(true);
  });
});

type User = {
  firstName: TF.String<{maxLength: 120; generator: GEN.firstName}>;
  lastName: TF.String<{maxLength: 120; generator: 'lastName'}>;
  phone?: TF.String<{generator: 'phoneNumber'}>;
};

describe('mock generators: type-first, both call shapes', () => {
  const check = (mock: () => User) => {
    const validate = createValidateFn<User>();
    for (let i = 0; i < DRAWS; i++) {
      const user = mock();
      expect(validate(user)).toBe(true);
      expect(user.firstName).toMatch(/^[A-Z][a-z]+$/);
      expect(user.lastName).toMatch(/^[A-Z][a-z]+$/);
    }
  };

  it('static', () => check(createMockDataFn<User>()));

  it('value', () => {
    const sample = {firstName: 'Ann', lastName: 'Lee'} as User;
    check(createMockDataFn(sample));
  });

  it('firstName and lastName twins keep their own generators', () => {
    const firstNames = new Set<string>(['Aaron', 'Olivia', 'Mei', 'Liam', 'Sofia']);
    const mock = createMockDataFn<User>();
    let lastNameLooksLikeFirst = 0;
    for (let i = 0; i < DRAWS; i++) if (firstNames.has(mock().lastName)) lastNameLooksLikeFirst++;
    expect(lastNameLooksLikeFirst).toBeLessThan(DRAWS / 4);
  });
});

describe('mock generators: the three phone generators agree', () => {
  // One seed draws one country row across all three phone generators.
  it('for the same seed', () => {
    const code = createMockDataFn(TF.string({generator: GEN.phoneCountryCode}));
    const full = createMockDataFn(TF.string({generator: GEN.phoneNumber}));
    const local = createMockDataFn(TF.string({generator: GEN.phoneNumberLocal}));
    for (let seed = 1; seed <= 200; seed++) {
      const options = {mock: {seed}};
      const [countryCode, number, national] = [code(options), full(options), local(options)];
      expect(number.startsWith(countryCode), `${number} vs ${countryCode}`).toBe(true);
      expect(national).toHaveLength(number.length - countryCode.length);
    }
  });
});
