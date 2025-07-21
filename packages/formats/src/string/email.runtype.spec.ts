/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types/src/runTypeFunctions';
import {RunTypeError} from '@mionkit/core/src/types';
import {EmailFormat, EmailFormat_Strict, EmailFormat_Punycode} from './email.runtype';

it('should validate strict email values', async () => {
    const isType = await isTypeFn<EmailFormat_Strict>();
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
    const typeErrors = await typeErrorsFn<EmailFormat_Strict>();
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
    // invalid max length
    const longEmail = 'a'.repeat(255) + '@example.com';
    expect(typeErrors(longEmail)).toEqual([maxLengthErr]);
    // Invalid local maxLength
    const longLocalPart = 'a'.repeat(65) + '@example.com';
    expect(typeErrors(longLocalPart)).toEqual([localMaxLengthErr]);
    // Missing parts
    expect(typeErrors('userexample.com')).toEqual([missingPartsErr]);
    expect(typeErrors('@example.com')).toEqual([localMinlengthErr]);
    expect(typeErrors('user@')).toEqual([domainMinLengthErr]);
    // Disallowed characters
    expect(typeErrors('user+name@example.com')).toEqual([localPartErr]);
    expect(typeErrors('user(name)@example.com')).toEqual([localPartErr]);
    expect(typeErrors('user,name@example.com')).toEqual([localPartErr]);
});

it('should mock strict email values', async () => {
    const mockType = await mockTypeFn<EmailFormat_Strict>();
    const isType = await isTypeFn<EmailFormat_Strict>();
    const typeErrors = await typeErrorsFn<EmailFormat_Strict>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});

// ########## QUick Email ##########

it('should validate quick email values', async () => {
    const isType = await isTypeFn<EmailFormat>();
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
    const typeErrors = await typeErrorsFn<EmailFormat>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'email', formatPath: [], val: ''}};
    const maxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 254}};
    const patternErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['pattern'], val: 'Invalid email format'}};
    const minlengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['minLength'], val: 7}};
    // Valid cases
    expect(typeErrors('user@example.com')).toEqual([]);
    // do not allow multiple @
    expect(typeErrors('user@name@example.com')).toEqual([patternErr]);
    expect(typeErrors('r@ho.co')).toEqual([]); // min local part and min do
    // invalid max length
    const longEmail = 'a'.repeat(255) + '@example.com';
    expect(typeErrors(longEmail)).toEqual([maxLengthErr]);
    // Invalid local maxLength
    const longLocalPart = 'a'.repeat(65) + '@example.com';
    expect(typeErrors(longLocalPart)).toEqual([patternErr]);
    // Missing parts
    expect(typeErrors('userexample.com')).toEqual([patternErr]);
    expect(typeErrors('@example.com')).toEqual([patternErr]);
    expect(typeErrors('user@')).toEqual([minlengthErr]);
    // Disallowed characters (quick email does not validate special characters)
    expect(typeErrors('user+name@example.com')).toEqual([]);
    expect(typeErrors('user(name)@example.com')).toEqual([]);
    expect(typeErrors('user,name@example.com')).toEqual([]);
});

it('should mock quick email values', async () => {
    const mockType = await mockTypeFn<EmailFormat>();
    const isType = await isTypeFn<EmailFormat>();
    const typeErrors = await typeErrorsFn<EmailFormat>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});

it('quick email validation should be faster than normal email', async () => {
    const isType = await isTypeFn<EmailFormat_Strict>();
    const isTypeQuick = await isTypeFn<EmailFormat>();
    const mockType = await mockTypeFn<EmailFormat_Strict>();
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
    const isType = await isTypeFn<EmailFormat_Punycode>();
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
    const typeErrors = await typeErrorsFn<EmailFormat_Punycode>();
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
    // invalid max length
    const longEmail = 'a'.repeat(255) + '@example.com';
    expect(typeErrors(longEmail)).toEqual([maxLengthErr]);
    // Invalid local maxLength
    const longLocalPart = 'a'.repeat(65) + '@example.com';
    expect(typeErrors(longLocalPart)).toEqual([patternErr]);
    // Missing parts
    expect(typeErrors('userexample.com')).toEqual([patternErr]);
    expect(typeErrors('@example.com')).toEqual([patternErr]);
    expect(typeErrors('user@')).toEqual([minlengthErr]);
    // Special characters in local part (allowed in pattern-based validation)
    expect(typeErrors('user+name@example.com')).toEqual([]);
    expect(typeErrors('user(name)@example.com')).toEqual([]);
    expect(typeErrors('user,name@example.com')).toEqual([]);
});

it('should mock punycode email values', async () => {
    const mockType = await mockTypeFn<EmailFormat_Punycode>();
    const isType = await isTypeFn<EmailFormat_Punycode>();
    const typeErrors = await typeErrorsFn<EmailFormat_Punycode>();
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
