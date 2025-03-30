/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/runtype/src/functions';
import {RunTypeError} from '@mionkit/runtype/src/types';
import {Email} from './email.runtype';

it('should validate email values', async () => {
    const isType = await isTypeFn<Email>();
    // Valid cases
    expect(isType('user@example.com')).toBe(true);
    expect(isType('user.name@sub.example.com')).toBe(true);
    // allow multiple @
    expect(isType('user@name@sub.example.com')).toBe(true);
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

it('should return email errors', async () => {
    const typeErrors = await typeErrorsFn<Email>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'email', formatPath: [], val: ''}};
    const localPartErr: RunTypeError = {
        ...err,
        format: {name: 'email', formatPath: ['localPart', 'disallowedChars'], val: 'Invalid characters in email local part'},
    };
    const maxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['maxLength'], val: 254}};
    const localMaxLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['localPart', 'maxLength'], val: 64}};
    const localMinlengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['localPart', 'minLength'], val: 1}};
    const domainMinLengthErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['domain', 'minLength'], val: 5}};
    const missingPartsErr: RunTypeError = {...err, format: {name: 'email', formatPath: ['@'], val: 'Missing @ symbol'}};
    // Valid cases
    expect(typeErrors('user@example.com')).toEqual([]);
    expect(typeErrors('user@name@example.com')).toEqual([]);
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

it('should mock email values', async () => {
    const mockType = mockTypeFn<Email>();
    const isType = await isTypeFn<Email>();
    const typeErrors = await typeErrorsFn<Email>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});
