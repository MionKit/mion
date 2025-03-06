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
    // Invalid case
    expect(isType('Example.com')).toBe(false);
});

it('should return domain errors', async () => {
    const typeErrors = await typeErrorsFn<Domain>();
    const domainError = {expected: 'string', path: [], format: {name: 'domain'}};
    // Valid cases
    expect(typeErrors('example.com')).toEqual([]);
    // Invalid length
    const longDomain = 'a'.repeat(254) + '.com';
    expect(typeErrors(longDomain)).toEqual([{...domainError, format: {...domainError.format, invalid: {maxLength: 253}}}]);
    // Invalid parts
    expect(typeErrors('example')).toEqual([{...domainError, format: {...domainError.format, invalid: {minParts: 2}}}]);
    expect(typeErrors('example..com')).toEqual([
        {...domainError, format: {...domainError.format, invalid: {pattern: /^[a-zA-Z0-9-]+$/}}},
    ]);
    // Invalid characters
    expect(typeErrors('exa!mple.com')).toEqual([
        {...domainError, format: {...domainError.format, invalid: {pattern: /^[a-zA-Z0-9-]+$/}}},
    ]);
    expect(typeErrors('example.c@m')).toEqual([
        {...domainError, format: {...domainError.format, invalid: {pattern: /^[a-zA-Z-]+$/}}},
    ]);
    // Invalid case
    expect(typeErrors('Example.com')).toEqual([{...domainError, format: {...domainError.format, invalid: {lowerCase: true}}}]);
});

it('should mock domain values', async () => {
    const mockType = mockTypeFn<Domain>();
    const isType = await isTypeFn<Domain>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
    }
});
