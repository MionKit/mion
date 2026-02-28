/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createIsTypeFn, createMockTypeFn, createTypeErrorsFn} from '@mionkit/run-types';
import {RunTypeError} from '@mionkit/core';
import {FormatEmail, FormatEmailStrict, FormatEmailPunycode} from './email.runtype';

it('should validate strict email values', async () => {
    const isType = await createIsTypeFn<FormatEmailStrict>();
    // Valid cases
    expect(isType('user@example.com')).toBe(true);
    expect(isType('user.name@sub.example.com')).toBe(true);
    // do not allow multiple @
    expect(isType('user@name@sub.example.com')).toBe(false);
    // Invalid maxLength
    const longEmail = 'a'.repeat(65) + '@example.com';
    expect(isType(longEmail)).toBe(false);
    // Missing parts
    expect(isType('userexample.com')).toBe(false);
    expect(isType('@example.com')).toBe(false);
    expect(isType('user@')).toBe(false);
    // Disallowed characters
    expect(isType('user+name@example.com')).toBe(false);
    expect(isType('user(name)@example.com')).toBe(false);
    expect(isType('user,name@example.com')).toBe(false);
});

it('should return strict email errors', async () => {
    const typeErrors = await createTypeErrorsFn<FormatEmailStrict>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'email', formatPath: [], val: ''}};
    const localPartErr: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['localPart', 'disallowedChars'], val: 'Invalid characters in email local part'},
    };
    const maxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 254}};
    const localMaxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['localPart', 'maxLength'], val: 64}};
    const localMinlengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['localPart', 'minLength'], val: 1}};
    const localDisallowedCharsErr: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['localPart', 'disallowedChars'], val: 'Invalid characters in email local part'},
    };
    const domainMinLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['domain', 'minLength'], val: 5}};
    const missingPartsErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['@'], val: 'Email missing @ symbol'}};
    // Valid cases
    expect(typeErrors('user@example.com')).toEqual([]);
    // do not allow multiple @
    expect(typeErrors('user@name@example.com')).toEqual([localDisallowedCharsErr]);
    // invalid max length - now returns multiple errors
    const longEmail = 'a'.repeat(255) + '@example.com';
    const localMaxLengthErr2: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['localPart', 'maxLength'], val: 64},
    };
    expect(typeErrors(longEmail)).toEqual([maxLengthErr, localMaxLengthErr2]);
    // Invalid local maxLength
    const longLocalPart = 'a'.repeat(65) + '@example.com';
    expect(typeErrors(longLocalPart)).toEqual([localMaxLengthErr]);
    // Missing parts - now returns multiple errors
    const localMinLengthErr2: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['localPart', 'minLength'], val: 1},
    };
    expect(typeErrors('userexample.com')).toEqual([missingPartsErr, localMinLengthErr2]);
    expect(typeErrors('@example.com')).toEqual([localMinlengthErr]);
    // Missing domain - now returns multiple errors
    const domainMinPartsErr: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['domain', 'minParts'], val: 2},
    };
    const domainTldMinLengthErr: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['domain', 'tld', 'minLength'], val: 2},
    };
    const domainTldPatternErr: RunTypeError = {
        ...err,
        format: {
            name: 'email',
            formatPath: ['domain', 'tld', 'pattern'],
            val: 'top level domain can only contain letters and dots',
        },
    };
    expect(typeErrors('user@')).toEqual([domainMinLengthErr, domainMinPartsErr, domainTldMinLengthErr, domainTldPatternErr]);
    // Disallowed characters
    expect(typeErrors('user+name@example.com')).toEqual([localPartErr]);
    expect(typeErrors('user(name)@example.com')).toEqual([localPartErr]);
    expect(typeErrors('user,name@example.com')).toEqual([localPartErr]);
});

it('should mock strict email values', async () => {
    const mockType = await createMockTypeFn<FormatEmailStrict>();
    const isType = await createIsTypeFn<FormatEmailStrict>();
    const typeErrors = await createTypeErrorsFn<FormatEmailStrict>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});

// ########## QUick Email ##########

it('should validate quick email values', async () => {
    const isType = await createIsTypeFn<FormatEmail>();
    // Valid cases
    expect(isType('user@example.com')).toBe(true);
    expect(isType('user.name@sub.example.com')).toBe(true);
    expect(isType('r@ho.co')).toBe(true); // min local part and min domain
    // do not allow multiple @
    expect(isType('user@name@sub.example.com')).toBe(false);
    // Invalid maxLength
    const longEmail = 'a'.repeat(65) + '@example.com';
    expect(isType(longEmail)).toBe(false);
    // Missing parts
    expect(isType('userexample.com')).toBe(false);
    expect(isType('@example.com')).toBe(false);
    expect(isType('user@')).toBe(false);
    // Disallowed characters (quick email does not validate special characters)
    expect(isType('user+name@example.com')).toBe(true);
    expect(isType('user(name)@example.com')).toBe(true);
    expect(isType('user,name@example.com')).toBe(true);
});

it('should return quick email errors', async () => {
    const typeErrors = await createTypeErrorsFn<FormatEmail>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'email', formatPath: [], val: ''}};
    const maxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 254}};
    const patternErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['pattern'], val: 'Invalid email format'}};
    const minlengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['minLength'], val: 7}};
    // Valid cases
    expect(typeErrors('user@example.com')).toEqual([]);
    // do not allow multiple @
    expect(typeErrors('user@name@example.com')).toEqual([patternErr]);
    expect(typeErrors('r@ho.co')).toEqual([]); // min local part and min do
    // invalid max length - now returns multiple errors
    const longEmail = 'a'.repeat(255) + '@example.com';
    const patternErr2: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['pattern'], val: 'Invalid email format'},
    };
    expect(typeErrors(longEmail)).toEqual([maxLengthErr, patternErr2]);
    // Invalid local maxLength
    const longLocalPart = 'a'.repeat(65) + '@example.com';
    expect(typeErrors(longLocalPart)).toEqual([patternErr]);
    // Missing parts
    expect(typeErrors('userexample.com')).toEqual([patternErr]);
    expect(typeErrors('@example.com')).toEqual([patternErr]);
    // Missing domain - now returns multiple errors
    const patternErr4: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['pattern'], val: 'Invalid email format'},
    };
    expect(typeErrors('user@')).toEqual([minlengthErr, patternErr4]);
    // Disallowed characters (quick email does not validate special characters)
    expect(typeErrors('user+name@example.com')).toEqual([]);
    expect(typeErrors('user(name)@example.com')).toEqual([]);
    expect(typeErrors('user,name@example.com')).toEqual([]);
});

it('should mock quick email values', async () => {
    const mockType = await createMockTypeFn<FormatEmail>();
    const isType = await createIsTypeFn<FormatEmail>();
    const typeErrors = await createTypeErrorsFn<FormatEmail>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});

it('quick email validation should be faster than normal email', async () => {
    const isType = await createIsTypeFn<FormatEmailStrict>();
    const isTypeQuick = await createIsTypeFn<FormatEmail>();
    const mockType = await createMockTypeFn<FormatEmailStrict>();
    const mockedItems = Array.from({length: 50}, () => mockType());
    const start = performance.now();
    for (const item of mockedItems) {
        isType(item);
    }
    const end = performance.now();
    const startQuick = performance.now();
    for (const item of mockedItems) {
        isTypeQuick(item);
    }
    const endQuick = performance.now();
    const normalTime = Math.round((end - start) * 1000);
    const quickTime = Math.round((endQuick - startQuick) * 1000);
    // console.log(`Normal email (${normalTime}ms) | Quick email (${quickTime}ms)`);
    expect(quickTime).toBeLessThan(normalTime);

    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(isTypeQuick(item)).toBe(true);
    }
});

// ########## Punycode Email ##########

it('should validate punycode email values', async () => {
    const isType = await createIsTypeFn<FormatEmailPunycode>();
    // Valid cases
    expect(isType('user@example.com')).toBe(true);
    expect(isType('user.name@sub.example.com')).toBe(true);
    expect(isType('user@xn--80akhbyknj4f.xn--p1ai')).toBe(true); // Punycode domain
    expect(isType('user@sub-domain.example-site.com')).toBe(true); // Hyphen in domain
    expect(isType('user@domain.with-number123.com')).toBe(true); // Numbers in domain
    expect(isType('r@ho.co')).toBe(true); // min local part and min domain
    // do not allow multiple @
    expect(isType('user@name@sub.example.com')).toBe(false);
    // Invalid maxLength
    const longEmail = 'a'.repeat(65) + '@example.com';
    expect(isType(longEmail)).toBe(false);
    // Missing parts
    expect(isType('userexample.com')).toBe(false);
    expect(isType('@example.com')).toBe(false);
    expect(isType('user@')).toBe(false);
    // Special characters in local part (allowed in pattern-based validation)
    expect(isType('user+name@example.com')).toBe(true);
    expect(isType('user(name)@example.com')).toBe(true);
    expect(isType('user,name@example.com')).toBe(true);
});

it('should return punycode email errors', async () => {
    const typeErrors = await createTypeErrorsFn<FormatEmailPunycode>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'email', formatPath: [], val: ''}};
    const maxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 254}};
    const patternErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['pattern'], val: 'Invalid email format'}};
    const minlengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['minLength'], val: 7}};
    // Valid cases
    expect(typeErrors('user@example.com')).toEqual([]);
    expect(typeErrors('user@xn--80akhbyknj4f.xn--p1ai')).toEqual([]); // Punycode domain
    expect(typeErrors('user@sub-domain.example-site.com')).toEqual([]); // Hyphen in domain
    expect(typeErrors('user@domain.with-number123.com')).toEqual([]); // Numbers in domain
    // do not allow multiple @
    expect(typeErrors('user@name@example.com')).toEqual([patternErr]);
    expect(typeErrors('r@ho.co')).toEqual([]); // min local part and min domain
    // invalid max length - now returns multiple errors
    const longEmail = 'a'.repeat(255) + '@example.com';
    const patternErr3: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['pattern'], val: 'Invalid email format'},
    };
    expect(typeErrors(longEmail)).toEqual([maxLengthErr, patternErr3]);
    // Invalid local maxLength
    const longLocalPart = 'a'.repeat(65) + '@example.com';
    expect(typeErrors(longLocalPart)).toEqual([patternErr]);
    // Missing parts
    expect(typeErrors('userexample.com')).toEqual([patternErr]);
    expect(typeErrors('@example.com')).toEqual([patternErr]);
    // Missing domain - now returns multiple errors
    const patternErr5: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['pattern'], val: 'Invalid email format'},
    };
    expect(typeErrors('user@')).toEqual([minlengthErr, patternErr5]);
    // Special characters in local part (allowed in pattern-based validation)
    expect(typeErrors('user+name@example.com')).toEqual([]);
    expect(typeErrors('user(name)@example.com')).toEqual([]);
    expect(typeErrors('user,name@example.com')).toEqual([]);
});

it('should mock punycode email values', async () => {
    const mockType = await createMockTypeFn<FormatEmailPunycode>();
    const isType = await createIsTypeFn<FormatEmailPunycode>();
    const typeErrors = await createTypeErrorsFn<FormatEmailPunycode>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
    // Check that at least some mocked emails contain punycode domains or domains with hyphens/numbers
    const hasPunycodeOrSpecialDomain = mockedItems.some((email) => {
        const domain = email.split('@')[1];
        return domain.includes('xn--') || domain.includes('-') || /\d/.test(domain);
    });
    expect(hasPunycodeOrSpecialDomain).toBe(true);
});
