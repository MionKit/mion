/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createIsTypeFn, createMockTypeFn, createTypeErrorsFn} from '@mionkit/run-types';
import {RunTypeError} from '@mionkit/core';
import {StrUrl, StrUrlFile, StrUrlHttp, StrUrlSocialMedia} from './url.runtype';

// ####### URL isType #######

// URL format is a string that starts with a valid protocol and has a valid domain
it('validate URL', async () => {
    const isType = await createIsTypeFn<StrUrl>();
    // valid URLs
    expect(isType('http://example.com')).toBe(true);
    expect(isType('https://example.com')).toBe(true);
    expect(isType('ftp://example.com')).toBe(true);
    expect(isType('ftps://example.com')).toBe(true);
    expect(isType('ws://example.com')).toBe(true);
    expect(isType('wss://example.com')).toBe(true);
    // valid URLs with path & query & fragment
    expect(isType('http://example.com/route1/')).toBe(true);
    expect(isType('https://example.com/route1/?query=1')).toBe(true);
    expect(isType('ftp://example.com/route1#hello-worls')).toBe(true);
    expect(isType('ftps://example.com/route1/?query=123;#hello')).toBe(true);
    expect(isType('ws://example.com/route1')).toBe(true);
    expect(isType('wss://example.com/route1')).toBe(true);
    // valid URLs with Ip
    expect(isType('http://192.168.0.1/route1/')).toBe(true);
    expect(isType('https://256.34.189.36:443/route1/')).toBe(true);
    expect(isType('ftp://example.com/route1/')).toBe(true);
    expect(isType('ftps://localhost:3038/route1/')).toBe(true);
    expect(isType('ws://::1/route1')).toBe(true);
    expect(isType('wss://2001:0db8:85a3:0000:0000:8a2e:0370:7334/route1')).toBe(true);
    // no domain validation so are valid URLs
    expect(isType('http://example')).toBe(true);
    expect(isType('http://example.')).toBe(true);
    // invalid max length
    const example = 'http://example-';
    expect(isType(example + 'a'.repeat(2048 - example.length + 1))).toBe(false);
    // invalid URLs
    expect(isType('invalid://example.com')).toBe(false);
    expect(isType('http://')).toBe(false);
    expect(isType('http://example.com/invalid path')).toBe(false);
    expect(isType('http://example.com\t')).toBe(false);
    expect(isType('http://example.com\n')).toBe(false);
    expect(isType('http://example.com\r')).toBe(false);
    expect(isType('http://example.com ')).toBe(false);
});

it('validate FILE URL', async () => {
    const isType = await createIsTypeFn<StrUrlFile>();
    // valid URLs
    expect(isType('file://hello.png')).toBe(true);
    expect(isType('file:///c:/lorem/ipsum.jpeg')).toBe(true);
    // file irl with no extension
    expect(isType('file://hello')).toBe(true);
    expect(isType('file:///c:/lorem/ipsum')).toBe(true);
    expect(isType('file:///var/log/syslog')).toBe(true);
    // file with query and fragment
    expect(isType('file://hello.png?query=1')).toBe(true);
    expect(isType('file:///c:/lorem/ipsum.jpeg#hello-world')).toBe(true);
    // invalid Protocols
    expect(isType('http://example.com')).toBe(false);
    expect(isType('https://example.com')).toBe(false);
    expect(isType('ftp://example.com')).toBe(false);
    expect(isType('ftps://example.com')).toBe(false);
    expect(isType('ws://example.com')).toBe(false);
    expect(isType('wss://example.com')).toBe(false);
});

it('validate Http only URL', async () => {
    const isType = await createIsTypeFn<StrUrlHttp>();
    // valid URLs
    expect(isType('http://example.com')).toBe(true);
    expect(isType('https://example.com')).toBe(true);
    // invalid URLs
    expect(isType('ftp://example.com')).toBe(false);
    expect(isType('ftps://example.com')).toBe(false);
    expect(isType('ws://example.com')).toBe(false);
    expect(isType('wss://example.com')).toBe(false);
    expect(isType('file://hello.png')).toBe(false);
    expect(isType('file:///c:/lorem/ipsum.jpeg')).toBe(false);
});

it('validate Social media URL', async () => {
    const isType = await createIsTypeFn<StrUrlSocialMedia>();
    // valid URLs
    expect(isType('http://facebook.com')).toBe(true);
    expect(isType('https://twitter.com')).toBe(true);
    expect(isType('http://instagram.com')).toBe(true);
    expect(isType('https://linkedin.com')).toBe(true);
    expect(isType('http://tiktok.com')).toBe(true);
    // valid domain but invalid protocols
    expect(isType('ftp://facebook.com')).toBe(false);
    expect(isType('ftps://twitter.com')).toBe(false);
    expect(isType('ws://instagram.com')).toBe(false);
    expect(isType('wss://linkedin.com')).toBe(false);
    expect(isType('file://tiktok.com')).toBe(false);
    // valid protocols but invalid domains
    expect(isType('http://example.com')).toBe(false);
    expect(isType('https://hello.com')).toBe(false);
    expect(isType('http://world.com')).toBe(false);
});

// URL typeErrors
it('get URL errors', async () => {
    const typeErrors = await createTypeErrorsFn<StrUrl>();
    const maxLengthError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'url', formatPath: ['maxLength'], val: 2048},
    };
    const formatError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'url', formatPath: ['pattern'], val: 'invalid URL format'},
    };
    // valid URLs
    expect(typeErrors('http://example.com')).toEqual([]);
    expect(typeErrors('https://example.com')).toEqual([]);
    expect(typeErrors('ftp://example.com')).toEqual([]);
    expect(typeErrors('ftps://example.com')).toEqual([]);
    expect(typeErrors('ws://example.com')).toEqual([]);
    expect(typeErrors('wss://example.com')).toEqual([]);
    // no domain validation so are valid URLs
    expect(typeErrors('http://example')).toEqual([]);
    expect(typeErrors('http://example.')).toEqual([]);
    // invalid max length
    const example = 'http://example-';
    expect(typeErrors(example + 'a'.repeat(2048 - example.length + 1))).toEqual([maxLengthError]);
    // invalid URLs
    expect(typeErrors('invalid://example.com')).toEqual([formatError]);
    expect(typeErrors('http://')).toEqual([formatError]);
    expect(typeErrors('http://example.com/invalid path')).toEqual([formatError]);
    expect(typeErrors('http://example.com\t')).toEqual([formatError]);
    expect(typeErrors('http://example.com\n')).toEqual([formatError]);
    expect(typeErrors('http://example.com\r')).toEqual([formatError]);
    expect(typeErrors('http://example.com ')).toEqual([formatError]);
});

it('get FILE URL errors', async () => {
    const typeErrors = await createTypeErrorsFn<StrUrlFile>();
    const formatError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'url', formatPath: ['pattern'], val: 'invalid file URL format'},
    };
    // valid URLs
    expect(typeErrors('file://hello.png')).toEqual([]);
    expect(typeErrors('file:///c:/lorem/ipsum.jpeg')).toEqual([]);
    // file irl with no extension
    expect(typeErrors('file://hello')).toEqual([]);
    expect(typeErrors('file:///c:/lorem/ipsum')).toEqual([]);
    expect(typeErrors('file:///var/log/syslog')).toEqual([]);
    // file with query and fragment
    expect(typeErrors('file://hello.png?query=1')).toEqual([]);
    expect(typeErrors('file:///c:/lorem/ipsum.jpeg#hello-world')).toEqual([]);
    // invalid Protocols
    expect(typeErrors('http://example.com')).toEqual([formatError]);
    expect(typeErrors('https://example.com')).toEqual([formatError]);
    expect(typeErrors('ftp://example.com')).toEqual([formatError]);
    expect(typeErrors('ftps://example.com')).toEqual([formatError]);
    expect(typeErrors('ws://example.com')).toEqual([formatError]);
    expect(typeErrors('wss://example.com')).toEqual([formatError]);
});

it('get Http only URL errors', async () => {
    const typeErrors = await createTypeErrorsFn<StrUrlHttp>();
    // Valid Http URL cases
    expect(typeErrors('http://example.com')).toEqual([]);
    expect(typeErrors('https://example.com')).toEqual([]);
    const formatError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'url', formatPath: ['pattern'], val: 'invalid Http URL format'},
    };
    // invalid protocols
    expect(typeErrors('ftp://example.com')).toEqual([formatError]);
    expect(typeErrors('ftp://facebook.com')).toEqual([formatError]);
    expect(typeErrors('ftps://twitter.com')).toEqual([formatError]);
    expect(typeErrors('ws://instagram.com')).toEqual([formatError]);
    expect(typeErrors('wss://linkedin.com')).toEqual([formatError]);
    expect(typeErrors('file://tiktok.com')).toEqual([formatError]);
    expect(typeErrors('file://hello.png')).toEqual([formatError]);
});

it('get Social media errors', async () => {
    const typeErrors = await createTypeErrorsFn<StrUrlSocialMedia>();
    // Valid Social Media URL cases
    expect(typeErrors('http://facebook.com')).toEqual([]);
    expect(typeErrors('https://twitter.com')).toEqual([]);
    expect(typeErrors('http://instagram.com')).toEqual([]);
    expect(typeErrors('https://linkedin.com')).toEqual([]);
    expect(typeErrors('http://tiktok.com')).toEqual([]);
    const formatError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'url', formatPath: ['pattern'], val: 'invalid social media URL format'},
    };
    const wrongDomainErr: RunTypeError = {
        expected: 'string',
        path: [],
        format: {
            name: 'url',
            formatPath: ['domain', 'names', 0, 'allowedValues'],
            val: 'Only social media domains are allowed',
        },
    };
    // invalid cases
    expect(typeErrors('ftp://facebook.com')).toEqual([formatError]);
    expect(typeErrors('http://example.com')).toEqual([wrongDomainErr]);
});

// URL mock
it('mock URL', async () => {
    const mockType = await createMockTypeFn<StrUrl>();
    const isType = await createIsTypeFn<StrUrl>();
    const someUrls = Array.from({length: 20}, () => mockType());
    for (const url of someUrls) expect(isType(url)).toBe(true);
});
it('mock FILE URL', async () => {
    const mockType = await createMockTypeFn<StrUrlFile>();
    const isType = await createIsTypeFn<StrUrlFile>();
    const someUrls = Array.from({length: 20}, () => mockType());
    for (const url of someUrls) expect(isType(url)).toBe(true);
});
it('mock Http URL', async () => {
    const mockType = await createMockTypeFn<StrUrlHttp>();
    const isType = await createIsTypeFn<StrUrlHttp>();
    const someUrls = Array.from({length: 20}, () => mockType());
    for (const url of someUrls) expect(isType(url)).toBe(true);
});
it('mock Social media URL', async () => {
    const mockType = await createMockTypeFn<StrUrlSocialMedia>();
    const isType = await createIsTypeFn<StrUrlSocialMedia>();
    const someUrls = Array.from({length: 20}, () => mockType());
    for (const url of someUrls) expect(isType(url)).toBe(true);
});
