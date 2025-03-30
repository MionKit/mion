/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/runtype/src/functions';
import {RunTypeError} from '@mionkit/runtype/src/types';
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
    expect(isType('a.co')).toBe(false); // min domain length is 5
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
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'domain', formatPath: [], val: ''}};
    const domainErrMessage = 'domain names can only contain letters, numbers and hyphens';
    const tldErrMessage = 'top level domain can only contain letters and dots';
    const longErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['maxLength'], val: 253}};
    const minLengthErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['minLength'], val: 5}};
    const minPartsErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['minParts'], val: 2}};
    const minNameLengthErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['names', 1, 'minLength'], val: 2}};
    const tldErrPattern: RunTypeError = {...err, format: {name: 'domain', formatPath: ['tld', 'pattern'], val: tldErrMessage}};
    const namesErrPattern: RunTypeError = {
        ...err,
        format: {name: 'domain', formatPath: ['names', 0, 'pattern'], val: domainErrMessage},
    };
    // Valid cases
    expect(typeErrors('example.com')).toEqual([]);
    // Invalid length
    const longDomain = 'a'.repeat(254) + '.com';
    expect(typeErrors(longDomain)).toEqual([longErr]);
    expect(typeErrors('a.co')).toEqual([minLengthErr]);
    // Invalid parts
    expect(typeErrors('example')).toEqual([minPartsErr]);
    expect(typeErrors('example..com')).toEqual([minNameLengthErr]);
    // Invalid characters
    expect(typeErrors('exa!mple.com')).toEqual([namesErrPattern]);
    expect(typeErrors('example.c@m')).toEqual([tldErrPattern]);
    expect(typeErrors('example.c-om')).toEqual([tldErrPattern]);
});

it('should return domain errors inside an array', async () => {
    // this scenario ensures path access path variables works both for type path and format path
    // access path variables are typically used for array indexes so when generating jit code
    // so access path typically will contain var name s like `v[i]` to access the i-th element in jit code
    const typeErrors = await typeErrorsFn<Domain[]>();
    // Valid cases
    expect(typeErrors('example.com')).toEqual([{expected: 'array', path: []}]);
    expect(typeErrors(['example.com'])).toEqual([]);

    // this should generate jit code with `v[i]` to access the element of the array and idx to access name part within the domain
    expect(typeErrors(['example.com', 'example..com'])).toEqual([
        {
            expected: 'string',
            format: {formatPath: ['names', 1, 'minLength'], name: 'domain', val: 2},
            path: [1], // this is the index of the array
        },
    ]);
});

it('should return domain errors inside recursive data', async () => {
    // similar scenario as above but this time we have a recursive data structure
    type DomainRecursive = {
        name: string;
        domains: Domain[];
        children?: DomainRecursive[];
    };
    const typeErrors = await typeErrorsFn<DomainRecursive>();
    // Valid cases
    expect(typeErrors({name: 'item1', domains: ['example.com']})).toEqual([]);
    expect(typeErrors({name: 'item1', domains: ['example.com'], children: []})).toEqual([]);

    // Invalid cases

    expect(typeErrors({name: 'item1', domains: ['example..com']})).toEqual([
        {
            expected: 'string',
            format: {formatPath: ['names', 1, 'minLength'], name: 'domain', val: 2},
            path: ['domains', 0], // this is the index of the array
        },
    ]);

    // Invalid whit children
    const dRec1: DomainRecursive = {
        name: 'item1',
        domains: ['example.com'],
        children: [
            {name: 'item2', domains: ['example.com']},
            {name: 'item3', domains: ['example.com', 'hello.org', 'example..com']}, // this is the invalid domain
        ],
    };
    const err1: RunTypeError = {
        expected: 'string',
        format: {formatPath: ['names', 1, 'minLength'], name: 'domain', val: 2},
        path: ['children', 1, 'domains', 2],
    };
    expect(typeErrors(dRec1)).toEqual([err1]);
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
    type CustomParams = {
        maxLength: 20;
        names: {maxLength: 8};
        tld: {maxLength: 2};
    };
    type CustomDomain = Domain<CustomParams>;
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
