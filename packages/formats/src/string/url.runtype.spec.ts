/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/runtype/src/functions';
import {RunTypeError} from '@mionkit/runtype/src/types';
import {UrlParams, StringURL} from './url.runtype';

// ####### URL isType #######

// URL format is a string that starts with a valid protocol and has a valid domain
it('validate URL', async () => {
    const isType = await isTypeFn<StringURL<UrlParams>>();
    // valid URLs
    expect(isType('http://example.com')).toBe(true);
    expect(isType('https://example.com')).toBe(true);
    expect(isType('ftp://example.com')).toBe(true);
    expect(isType('ftps://example.com')).toBe(true);
    expect(isType('ws://example.com')).toBe(true);
    expect(isType('wss://example.com')).toBe(true);
    expect(isType('file:///C:/path/to/file')).toBe(true);
    // invalid URLs
    expect(isType('invalid://example.com')).toBe(false);
    expect(isType('http://')).toBe(false);
    expect(isType('http://example')).toBe(false);
    expect(isType('http://example.')).toBe(false);
    expect(isType('http://example.com/invalid path')).toBe(false);
    expect(isType('http://example.com\t')).toBe(false);
    expect(isType('http://example.com\n')).toBe(false);
    expect(isType('http://example.com\r')).toBe(false);
    expect(isType('http://example.com ')).toBe(false);
});

// URL typeErrors
it('get URL errors', async () => {
    const typeErrors = await typeErrorsFn<StringURL<UrlParams>>();
    const expectedError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'url', formatPath: ['maxLength'], val: 2048},
    };
    // valid URLs
    expect(typeErrors('http://example.com')).toEqual([]);
    expect(typeErrors('https://example.com')).toEqual([]);
    expect(typeErrors('ftp://example.com')).toEqual([]);
    expect(typeErrors('ftps://example.com')).toEqual([]);
    expect(typeErrors('ws://example.com')).toEqual([]);
    expect(typeErrors('wss://example.com')).toEqual([]);
    expect(typeErrors('file:///C:/path/to/file')).toEqual([]);
    // invalid URLs
    expect(typeErrors('invalid://example.com')).toEqual([expectedError]);
    expect(typeErrors('http://')).toEqual([expectedError]);
    expect(typeErrors('http://example')).toEqual([expectedError]);
    expect(typeErrors('http://example.')).toEqual([expectedError]);
    expect(typeErrors('http://example.com/invalid path')).toEqual([expectedError]);
    expect(typeErrors('http://example.com\t')).toEqual([expectedError]);
    expect(typeErrors('http://example.com\n')).toEqual([expectedError]);
    expect(typeErrors('http://example.com\r')).toEqual([expectedError]);
    expect(typeErrors('http://example.com ')).toEqual([expectedError]);
});

// URL mock
it('mock URL', async () => {
    const mockType = mockTypeFn<StringURL<UrlParams>>();
    const isType = await isTypeFn<StringURL<UrlParams>>();
    const someUrls = Array.from({length: 20}, () => mockType());
    for (const url of someUrls) expect(isType(url)).toBe(true);
});
