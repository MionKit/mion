/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types/src/runTypeFunctions';
import {RunTypeError} from '@mionkit/core/src/types';
import {StrDomainStrict, StrDomain} from './domain.runtype';

it('should validate custom domain values', async () => {
    const isType = await isTypeFn<StrDomainStrict>();
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

it('should validate domain values', async () => {
    const isType = await isTypeFn<StrDomain>();
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

const err: RunTypeError = {expected: 'string', path: [], format: {name: 'domain', formatPath: [], val: ''}};
const domainErrMessage = 'domain names can only contain letters, numbers and hyphens';
const tldErrMessage = 'top level domain can only contain letters and dots';
const maxLengthErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['maxLength'], val: 253}};
const minLengthErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['minLength'], val: 5}};
const minPartsErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['minParts'], val: 2}};
const minNameLengthErr: RunTypeError = {...err, format: {name: 'domain', formatPath: ['names', 1, 'minLength'], val: 2}};
const tldErrPattern: RunTypeError = {...err, format: {name: 'domain', formatPath: ['tld', 'pattern'], val: tldErrMessage}};
const namesErrPattern: RunTypeError = {
    ...err,
    format: {name: 'domain', formatPath: ['names', 0, 'pattern'], val: domainErrMessage},
};
const domainErrPattern: RunTypeError = {
    ...err,
    format: {name: 'domain', formatPath: ['pattern'], val: 'invalid domain'},
};

it('should return custom domain errors', async () => {
    const typeErrors = await typeErrorsFn<StrDomainStrict>();
    // Valid cases
    expect(typeErrors('example.com')).toEqual([]);
    // Invalid length
    const longDomain = 'a'.repeat(254) + '.com';
    expect(typeErrors(longDomain)).toEqual([maxLengthErr]);
    expect(typeErrors('a.co')).toEqual([minLengthErr]);
    // Invalid parts
    expect(typeErrors('example')).toEqual([minPartsErr]);
    expect(typeErrors('example..com')).toEqual([minNameLengthErr]);
    // Invalid characters
    expect(typeErrors('exa!mple.com')).toEqual([namesErrPattern]);
    expect(typeErrors('example.c@m')).toEqual([tldErrPattern]);
    expect(typeErrors('example.c-om')).toEqual([tldErrPattern]);
});

it('should return domain errors', async () => {
    // wen using pattern the errors are more generic
    const typeErrors = await typeErrorsFn<StrDomain>();
    // Valid cases
    expect(typeErrors('example.com')).toEqual([]);
    // Invalid length
    const longDomain = 'a'.repeat(254) + '.com';
    expect(typeErrors(longDomain)).toEqual([maxLengthErr]);
    expect(typeErrors('a.co')).toEqual([minLengthErr]);
    // Invalid parts
    expect(typeErrors('example')).toEqual([domainErrPattern]);
    expect(typeErrors('example..com')).toEqual([domainErrPattern]);
    // Invalid characters
    expect(typeErrors('exa!mple.com')).toEqual([domainErrPattern]);
    expect(typeErrors('example.c@m')).toEqual([domainErrPattern]);
    expect(typeErrors('example.c-om')).toEqual([domainErrPattern]);
});

it('should validate custom domain inside an array', async () => {
    // this scenario ensures path access path variables works both for type path and format path
    // access path variables are typically used for array indexes so when generating jit code
    // so access path typically will contain var name s like `v[i]` to access the i-th element in jit code
    const isType = await isTypeFn<StrDomainStrict[]>();
    // not array
    expect(isType('example.com')).toBe(false);
    // Valid cases
    expect(isType(['example.com'])).toBe(true);
    // this should generate jit code with `v[i]` to access the element of the array and idx to access name part within the domain
    expect(isType(['example.com', 'example..com'])).toBe(false);
});

it('should validate domain inside an array', async () => {
    // this scenario ensures path access path variables works both for type path and format path
    // access path variables are typically used for array indexes so when generating jit code
    // so access path typically will contain var name s like `v[i]` to access the i-th element in jit code
    const isType = await isTypeFn<StrDomain[]>();
    // not array
    expect(isType('example.com')).toBe(false);
    // Valid cases
    expect(isType(['example.com'])).toBe(true);
    // this should generate jit code with `v[i]` to access the element of the array and idx to access name part within the domain
    expect(isType(['example.com', 'example..com'])).toBe(false);
});

it('should return custom domain errors inside an array', async () => {
    // this scenario ensures path access path variables works both for type path and format path
    // access path variables are typically used for array indexes so when generating jit code
    // so access path typically will contain var name s like `v[i]` to access the i-th element in jit code
    const typeErrors = await typeErrorsFn<StrDomainStrict[]>();
    // Valid cases
    expect(typeErrors('example.com')).toEqual([{expected: 'array', path: []}]);
    expect(typeErrors(['example.com'])).toEqual([]);
    // this should generate jit code with `v[i]` to access the element of the array and idx to access name part within the domain
    const err: RunTypeError = {
        expected: 'string',
        format: {formatPath: ['names', 1, 'minLength'], name: 'domain', val: 2},
        path: [1], // this is the index of the array
    };
    expect(typeErrors(['example.com', 'example..com'])).toEqual([err]);
});

it('should return domain errors inside an array', async () => {
    // this scenario ensures path access path variables works both for type path and format path
    // access path variables are typically used for array indexes so when generating jit code
    // so access path typically will contain var name s like `v[i]` to access the i-th element in jit code
    const typeErrors = await typeErrorsFn<StrDomain[]>();
    // Valid cases
    expect(typeErrors('example.com')).toEqual([{expected: 'array', path: []}]);
    expect(typeErrors(['example.com'])).toEqual([]);

    // this should generate jit code with `v[i]` to access the element of the array and idx to access name part within the domain
    const err: RunTypeError = {
        expected: 'string',
        format: {formatPath: ['pattern'], name: 'domain', val: 'invalid domain'},
        path: [1], // this is the index of the array
    };
    expect(typeErrors(['example.com', 'example..com'])).toEqual([err]);
});

it('should validate custom domain inside recursive data', async () => {
    // similar scenario as above but this time we have a recursive data structure
    type StrictDomainRecursive = {
        name: string;
        domains: StrDomainStrict[];
        children?: StrictDomainRecursive[];
    };
    const isType = await isTypeFn<StrictDomainRecursive>();
    // Valid cases
    expect(isType({name: 'item1', domains: ['example.com']})).toBe(true);
    expect(isType({name: 'item1', domains: ['example.com'], children: []})).toBe(true);
    // Invalid cases
    expect(isType({name: 'item1', domains: ['example..com']})).toBe(false);
    // Invalid whit children
    const dRec1: StrictDomainRecursive = {
        name: 'item1',
        domains: ['example.com'],
        children: [
            {name: 'item2', domains: ['example.com']},
            {name: 'item3', domains: ['example.com', 'hello.org', 'example..com']}, // this is the invalid domain
        ],
    };
    expect(isType(dRec1)).toBe(false);
});

it('should validate domain inside recursive data', async () => {
    // similar scenario as above but this time we have a recursive data structure
    type DomainRecursive = {
        name: string;
        domains: StrDomain[];
        children?: DomainRecursive[];
    };
    const isType = await isTypeFn<DomainRecursive>();
    // Valid cases
    expect(isType({name: 'item1', domains: ['example.com']})).toBe(true);
    expect(isType({name: 'item1', domains: ['example.com'], children: []})).toBe(true);
    // Invalid cases
    expect(isType({name: 'item1', domains: ['example..com']})).toBe(false);
    // Invalid whit children
    const dRec1: DomainRecursive = {
        name: 'item1',
        domains: ['example.com'],
        children: [
            {name: 'item2', domains: ['example.com']},
            {name: 'item3', domains: ['example.com', 'hello.org', 'example..com']}, // this is the invalid domain
        ],
    };
    expect(isType(dRec1)).toBe(false);
});

it('should return custom domain errors inside recursive data', async () => {
    // similar scenario as above but this time we have a recursive data structure
    type StrictDomainRecursive = {
        name: string;
        domains: StrDomainStrict[];
        children?: StrictDomainRecursive[];
    };
    const typeErrors = await typeErrorsFn<StrictDomainRecursive>();
    // Valid cases
    expect(typeErrors({name: 'item1', domains: ['example.com']})).toEqual([]);
    expect(typeErrors({name: 'item1', domains: ['example.com'], children: []})).toEqual([]);

    // Invalid cases
    const err: RunTypeError = {
        expected: 'string',
        format: {formatPath: ['names', 1, 'minLength'], name: 'domain', val: 2},
        path: ['domains', 0], // this is the index of the array
    };
    expect(typeErrors({name: 'item1', domains: ['example..com']})).toEqual([err]);

    // Invalid whit children
    const dRec1: StrictDomainRecursive = {
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

it('should return domain errors inside recursive data', async () => {
    // similar scenario as above but this time we have a recursive data structure
    type DomainRecursive = {
        name: string;
        domains: StrDomain[];
        children?: DomainRecursive[];
    };
    const typeErrors = await typeErrorsFn<DomainRecursive>();
    // Valid cases
    expect(typeErrors({name: 'item1', domains: ['example.com']})).toEqual([]);
    expect(typeErrors({name: 'item1', domains: ['example.com'], children: []})).toEqual([]);

    // Invalid cases

    const err: RunTypeError = {
        expected: 'string',
        format: {formatPath: ['pattern'], name: 'domain', val: 'invalid domain'},
        path: ['domains', 0], // this is the index of the array
    };
    expect(typeErrors({name: 'item1', domains: ['example..com']})).toEqual([err]);

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
        format: {formatPath: ['pattern'], name: 'domain', val: 'invalid domain'},
        path: ['children', 1, 'domains', 2],
    };
    expect(typeErrors(dRec1)).toEqual([err1]);
});

it('should mock custom domain values', async () => {
    const mockType = await mockTypeFn<StrDomainStrict>();
    const isType = await isTypeFn<StrDomainStrict>();
    const typeErrors = await typeErrorsFn<StrDomainStrict>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});

it('should mock domain values', async () => {
    const mockType = await mockTypeFn<StrDomain>();
    const isType = await isTypeFn<StrDomain>();
    const typeErrors = await typeErrorsFn<StrDomain>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(typeErrors(item)).toEqual([]);
        expect(isType(item)).toBe(true);
    }
});

// ######## OVERRIDE DEFAULTS ########

it('should validate custom domain with custom params', async () => {
    type CustomParams = {
        maxLength: 20;
        names: {maxLength: 8};
        tld: {maxLength: 2};
    };
    type CustomDomain = StrDomainStrict<CustomParams>;
    const isType = await isTypeFn<CustomDomain>();
    // Valid cases
    expect(isType('example.co')).toBe(true);
    expect(isType('sub.example.co')).toBe(true);
    expect(isType('example.uk')).toBe(true);
    // Invalid name length
    const longDomain = 'a'.repeat(9) + '.co';
    expect(isType(longDomain)).toBe(false);
    // invalid tld length
    const longTld = 'example.com';
    expect(isType(longTld)).toBe(false);
    // INvalid CustomDomain length
    const longFull = 'a'.repeat(21) + '.co';
    expect(isType(longFull)).toBe(false);
});

// ######## PERF ########

it('domain should be faster than strict domain', async () => {
    const isType = await isTypeFn<StrDomainStrict>();
    const isTypeQuick = await isTypeFn<StrDomain>();
    // TODO: regexp seems to be a bit faster than quick email so maybe we should use it

    const mockType = await mockTypeFn<StrDomainStrict>();
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
    // console.log(`Strict Domain (${normalTime}ms) | Domain (${quickTime}ms)`);
    expect(quickTime).toBeLessThan(normalTime);

    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(isTypeQuick(item)).toBe(true);
    }
});

it('mock allowedValues', async () => {
    type SocialNames = StrDomain<{
        maxLength: 200;
        minLength: 3;
        maxParts: 3;
        minParts: 2;
        names: {
            allowedValues: {
                val: [
                    'mion',
                    'mionkit',
                    'facebook',
                    'twitter',
                    'instagram',
                    'linkedin',
                    'tiktok',
                    'youtube',
                    'snapchat',
                    'pinterest',
                ];
                errorMessage: 'Only social media domains are allowed';
            };
        };
        tld: {
            allowedValues: {
                val: ['com'];
                errorMessage: 'Only com and io TLDs are allowed';
            };
        };
    }>;
    const isType = await isTypeFn<SocialNames>();
    const mockType = await mockTypeFn<SocialNames>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
    }
});
