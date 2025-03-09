/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '../functions';
import {Domain} from './domain.runtype';

it('should validate domain values', async () => {
    const isType = await isTypeFn<Domain>();
    // Valid cases
    expect(isType('example.com')).toBe(true);
    expect(isType('sub.example.com')).toBe(true);
    expect(isType('example.co.uk')).toBe(true);
    // Invalid length
    const longDomain = 'a'.repeat(254) + '.com';
    expect(isType(longDomain)).toBe(false);
    // Invalid parts
    expect(isType('example')).toBe(false);
    expect(isType('example..com')).toBe(false);
    // Invalid characters
    expect(isType('exa!mple.com')).toBe(false);
    expect(isType('example.c@m')).toBe(false);
    expect(isType('example.co-m')).toBe(false);
});

it('should return domain errors', async () => {
    const typeErrors = await typeErrorsFn<Domain>();
    const err = {expected: 'string', path: [], format: {name: 'domain'}};
    // Valid cases
    expect(typeErrors('example.com')).toEqual([]);
    // Invalid length
    const longDomain = 'a'.repeat(254) + '.com';
    expect(typeErrors(longDomain)).toEqual([
        {...err, format: {name: 'domain', invalid: {maxLength: 253, names: {maxLength: 63, index: 0}}}},
    ]);
    // Invalid parts
    expect(typeErrors('example')).toEqual([{...err, format: {name: 'domain', invalid: {minParts: 2}}}]);
    expect(typeErrors('example..com')).toEqual([
        {...err, format: {name: 'domain', invalid: {names: {index: 1, minLength: 2, pattern: '/^[a-zA-Z0-9-]+$/'}}}},
    ]);
    // Invalid characters
    expect(typeErrors('exa!mple.com')).toEqual([
        {...err, format: {name: 'domain', invalid: {names: {index: 0, pattern: '/^[a-zA-Z0-9-]+$/'}}}},
    ]);
    expect(typeErrors('example.c@m')).toEqual([
        {...err, format: {name: 'domain', invalid: {tld: {pattern: '/^[a-zA-Z]+(\\.[a-zA-Z]+)?$/'}}}},
    ]);
    expect(typeErrors('example.c-om')).toEqual([
        {...err, format: {name: 'domain', invalid: {tld: {pattern: '/^[a-zA-Z]+(\\.[a-zA-Z]+)?$/'}}}},
    ]);
});

it('should mock domain values', async () => {
    const mockType = mockTypeFn<Domain>();
    const isType = await isTypeFn<Domain>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
    }
});

// ######## OVERRIDE DEFAULTS ########

it('should validate domain with custom params', async () => {
    type CustomName = {maxLength: 8; samples: ['dom1', 'ggle', 'fcbook', 'mion']};
    type CustomTld = {maxLength: 2; samples: ['co', 'uk', 'br']};
    type CustomDomain = Domain<{maxLength: 20}, CustomTld, CustomName>;
    const isType = await isTypeFn<CustomDomain>();
    const isTypeDefault = await isTypeFn<Domain>();
    // Valid cases
    expect(isType('example.co')).toBe(true);
    expect(isType('sub.example.co')).toBe(true);
    expect(isType('example.uk')).toBe(true);
    // Invalid name length
    const longDomain = 'a'.repeat(9) + '.co';
    expect(isType(longDomain)).toBe(false);
    expect(isTypeDefault(longDomain)).toBe(true);
    // invalid tld length
    const longTld = 'example.com';
    expect(isType(longTld)).toBe(false);
    expect(isTypeDefault(longTld)).toBe(true);
    // INvalid Domain length
    const longFull = 'a'.repeat(21) + '.co';
    expect(isType(longFull)).toBe(false);
    expect(isTypeDefault(longFull)).toBe(true);
});
