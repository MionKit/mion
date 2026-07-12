/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createValidate, createGetValidationErrors, createMockData} from '@mionjs/run-types';
import {RunTypeError} from '@mionjs/core';
import {FormatEmail, FormatEmailStrict, FormatEmailPunycode} from '../../StringFormats.ts';

it('should validate strict email values', async () => {
    const isType = createValidate<FormatEmailStrict>();
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
    const typeErrors = createGetValidationErrors<FormatEmailStrict>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'email', formatPath: [], val: ''}};
    // ts-runtypes emits sub-part errors without the 'localPart'/'domain'/'tld' formatPath prefixes;
    // domain sub-errors report format name 'domain' instead of 'email'
    const localPartErr: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['disallowedChars'], val: 'Invalid characters in email local part'},
    };
    const maxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 254}};
    const localMaxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 64}};
    const localMinlengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['minLength'], val: 1}};
    const localDisallowedCharsErr: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['disallowedChars'], val: 'Invalid characters in email local part'},
    };
    const domainMinLengthErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['minLength'], val: 5}};
    const missingPartsErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['@'], val: 'Email missing @ symbol'}};
    // Valid cases
    expect(typeErrors('user@example.com')).toEqual([]);
    // do not allow multiple @
    expect(typeErrors('user@name@example.com')).toEqual([localDisallowedCharsErr]);
    // invalid max length - now returns multiple errors
    const longEmail = 'a'.repeat(255) + '@example.com';
    const localMaxLengthErr2: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['maxLength'], val: 64},
    };
    expect(typeErrors(longEmail)).toEqual([maxLengthErr, localMaxLengthErr2]);
    // Invalid local maxLength
    const longLocalPart = 'a'.repeat(65) + '@example.com';
    expect(typeErrors(longLocalPart)).toEqual([localMaxLengthErr]);
    // Missing @ - ts-runtypes short-circuits to a single error (old impl also emitted a localPart minLength error)
    expect(typeErrors('userexample.com')).toEqual([missingPartsErr]);
    expect(typeErrors('@example.com')).toEqual([localMinlengthErr]);
    // Missing domain - returns multiple errors (domain minLength, minParts, tld minLength, tld pattern)
    const domainMinPartsErr: RunTypeError = {
        ...err,
        format: {name: 'domain', formatPath: ['minParts'], val: 2},
    };
    const domainTldMinLengthErr: RunTypeError = {
        ...err,
        format: {name: 'domain', formatPath: ['minLength'], val: 2},
    };
    // built-in tld pattern carries no custom message so val is the default 'Invalid pattern'
    const domainTldPatternErr: RunTypeError = {
        ...err,
        format: {name: 'domain', formatPath: ['pattern'], val: 'Invalid pattern'},
    };
    expect(typeErrors('user@')).toEqual([domainMinLengthErr, domainMinPartsErr, domainTldMinLengthErr, domainTldPatternErr]);
    // Disallowed characters
    expect(typeErrors('user+name@example.com')).toEqual([localPartErr]);
    expect(typeErrors('user(name)@example.com')).toEqual([localPartErr]);
    expect(typeErrors('user,name@example.com')).toEqual([localPartErr]);
});

it('should mock strict email values', async () => {
    const mockType = createMockData<FormatEmailStrict>();
    const isType = createValidate<FormatEmailStrict>();
    const typeErrors = createGetValidationErrors<FormatEmailStrict>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});

// ########## QUick Email ##########

it('should validate quick email values', async () => {
    const isType = createValidate<FormatEmail>();
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
    const typeErrors = createGetValidationErrors<FormatEmail>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'email', formatPath: [], val: ''}};
    const maxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 254}};
    // built-in email pattern carries no custom message so val is the fallback 'pattern'
    const patternErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['pattern'], val: 'pattern'}};
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
        format: {name: 'email', formatPath: ['pattern'], val: 'pattern'},
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
        format: {name: 'email', formatPath: ['pattern'], val: 'pattern'},
    };
    expect(typeErrors('user@')).toEqual([minlengthErr, patternErr4]);
    // Disallowed characters (quick email does not validate special characters)
    expect(typeErrors('user+name@example.com')).toEqual([]);
    expect(typeErrors('user(name)@example.com')).toEqual([]);
    expect(typeErrors('user,name@example.com')).toEqual([]);
});

it('should mock quick email values', async () => {
    const mockType = createMockData<FormatEmail>();
    const isType = createValidate<FormatEmail>();
    const typeErrors = createGetValidationErrors<FormatEmail>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});

it('quick email validation should be faster than normal email', async () => {
    const isType = createValidate<FormatEmailStrict>();
    const isTypeQuick = createValidate<FormatEmail>();
    const mockType = createMockData<FormatEmailStrict>();
    const mockedItems = Array.from({length: 50}, () => mockType());
    // warmup + repeated loops so the timing comparison is stable under parallel test workers
    for (const item of mockedItems) {
        isType(item);
        isTypeQuick(item);
    }
    const repetitions = 200;
    const start = performance.now();
    for (let r = 0; r < repetitions; r++) {
        for (const item of mockedItems) {
            isType(item);
        }
    }
    const end = performance.now();
    const startQuick = performance.now();
    for (let r = 0; r < repetitions; r++) {
        for (const item of mockedItems) {
            isTypeQuick(item);
        }
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
    const isType = createValidate<FormatEmailPunycode>();
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
    const typeErrors = createGetValidationErrors<FormatEmailPunycode>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'email', formatPath: [], val: ''}};
    const maxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 254}};
    // built-in email pattern carries no custom message so val is the fallback 'pattern'
    const patternErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['pattern'], val: 'pattern'}};
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
        format: {name: 'email', formatPath: ['pattern'], val: 'pattern'},
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
        format: {name: 'email', formatPath: ['pattern'], val: 'pattern'},
    };
    expect(typeErrors('user@')).toEqual([minlengthErr, patternErr5]);
    // Special characters in local part (allowed in pattern-based validation)
    expect(typeErrors('user+name@example.com')).toEqual([]);
    expect(typeErrors('user(name)@example.com')).toEqual([]);
    expect(typeErrors('user,name@example.com')).toEqual([]);
});

it('should mock punycode email values', async () => {
    const mockType = createMockData<FormatEmailPunycode>();
    const isType = createValidate<FormatEmailPunycode>();
    const typeErrors = createGetValidationErrors<FormatEmailPunycode>();
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
