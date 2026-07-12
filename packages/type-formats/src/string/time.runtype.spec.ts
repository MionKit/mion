/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createValidate, createGetValidationErrors, createMockData} from '@mionjs/run-types';
import {RunTypeError} from '@mionjs/core';
import {FormatStringTime} from '../../StringFormats.ts';

// ####### Time format HH:mm:ss #######

type HHmmss = FormatStringTime<{format: 'HH:mm:ss'}>;

it('validate time with format HH:mm:ss', async () => {
    const isType = createValidate<HHmmss>();
    // valid time
    expect(isType('00:00:00')).toBe(true);
    expect(isType('23:59:59')).toBe(true);
    // invalid max time
    expect(isType('24:00:00')).toBe(false);
    expect(isType('00:60:00')).toBe(false);
    expect(isType('00:00:60')).toBe(false);
    // invalid characters
    expect(isType('!0:00:00')).toBe(false);
    expect(isType('00:00:00!')).toBe(false);
    expect(isType('00:00:00!')).toBe(false);
    // wrong length
    expect(isType('00')).toBe(false);
    expect(isType('00:00')).toBe(false);
    expect(isType('00:00:00:00')).toBe(false);
    // invalid time
    expect(isType('25:00:00')).toBe(false);
    expect(isType('00:61:00')).toBe(false);
    expect(isType('00:00:61')).toBe(false);
});
it('get time errors for format HH:mm:ss', async () => {
    const typeErrors = createGetValidationErrors<HHmmss>();
    const timeError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'time', formatPath: ['format'], val: 'HH:mm:ss'},
    };
    // valid time
    expect(typeErrors('00:00:00')).toEqual([]);
    expect(typeErrors('23:59:59')).toEqual([]);
    // invalid max time
    expect(typeErrors('24:00:00')).toEqual([timeError]);
    expect(typeErrors('00:60:00')).toEqual([timeError]);
    expect(typeErrors('00:00:60')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('!0:00:00')).toEqual([timeError]);
    expect(typeErrors('00:00:00!')).toEqual([timeError]);
    expect(typeErrors('00:00:00!')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('00')).toEqual([timeError]);
    expect(typeErrors('00:00')).toEqual([timeError]);
    expect(typeErrors('00:00:00:00')).toEqual([timeError]);
    // invalid time
    expect(typeErrors('25:00:00')).toEqual([timeError]);
    expect(typeErrors('00:61:00')).toEqual([timeError]);
    expect(typeErrors('00:00:61')).toEqual([timeError]);
});
it('mock time with format HH:mm:ss', async () => {
    const mockType = createMockData<HHmmss>();
    const isType = createValidate<HHmmss>();
    const matchRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format HH:mm ######

type HHmm = FormatStringTime<{format: 'HH:mm'}>;

it('validate time with format HH:mm', async () => {
    const isType = createValidate<HHmm>();
    // valid time
    expect(isType('00:00')).toBe(true);
    expect(isType('23:59')).toBe(true);
    // invalid max time
    expect(isType('25:00')).toBe(false);
    expect(isType('00:61')).toBe(false);
    // invalid characters
    expect(isType('!0:00')).toBe(false);
    expect(isType('00:00!')).toBe(false);
    // wrong length
    expect(isType('00')).toBe(false);
    expect(isType('00:00:00')).toBe(false);
});
it('get time errors for format HH:mm', async () => {
    const typeErrors = createGetValidationErrors<HHmm>();
    const timeError: RunTypeError = {expected: 'string', path: [], format: {name: 'time', formatPath: ['format'], val: 'HH:mm'}};
    // valid time
    expect(typeErrors('00:00')).toEqual([]);
    expect(typeErrors('23:59')).toEqual([]);
    // invalid max time
    expect(typeErrors('25:00')).toEqual([timeError]);
    expect(typeErrors('00:61')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('!0:00')).toEqual([timeError]);
    expect(typeErrors('00:00!')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('00')).toEqual([timeError]);
    expect(typeErrors('00:00:00')).toEqual([timeError]);
});
it('mock time with format HH:mm', async () => {
    const mockType = createMockData<HHmm>();
    const isType = createValidate<HHmm>();
    const matchRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format mm:ss ########

type mmss = FormatStringTime<{format: 'mm:ss'}>;

it('validate time with format mm:ss', async () => {
    const isType = createValidate<mmss>();
    // valid time
    expect(isType('00:00')).toBe(true);
    expect(isType('59:59')).toBe(true);
    // invalid max time
    expect(isType('61:00')).toBe(false);
    expect(isType('00:61')).toBe(false);
    // invalid characters
    expect(isType('!0:00')).toBe(false);
    expect(isType('00:00!')).toBe(false);
    // wrong length
    expect(isType('00')).toBe(false);
    expect(isType('00:00:00')).toBe(false);
});
it('get time errors for format mm:ss', async () => {
    const typeErrors = createGetValidationErrors<mmss>();
    const timeError: RunTypeError = {expected: 'string', path: [], format: {name: 'time', formatPath: ['format'], val: 'mm:ss'}};
    // valid time
    expect(typeErrors('00:00')).toEqual([]);
    expect(typeErrors('59:59')).toEqual([]);
    // invalid max time
    expect(typeErrors('61:00')).toEqual([timeError]);
    expect(typeErrors('00:61')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('!0:00')).toEqual([timeError]);
    expect(typeErrors('00:00!')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('00')).toEqual([timeError]);
    expect(typeErrors('00:00:00')).toEqual([timeError]);
});
it('mock time with format mm:ss', async () => {
    const mockType = createMockData<mmss>();
    const isType = createValidate<mmss>();
    const matchRegex = /^([0-5]\d):([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format HH ########

type HH = FormatStringTime<{format: 'HH'}>;

it('validate time with format HH', async () => {
    const isType = createValidate<HH>();
    // valid time
    expect(isType('00')).toBe(true);
    expect(isType('23')).toBe(true);
    // invalid max time
    expect(isType('24')).toBe(false);
    // invalid characters
    expect(isType('!0')).toBe(false);
    // wrong length
    expect(isType('00:00')).toBe(false);
});
it('get time errors for format HH', async () => {
    const typeErrors = createGetValidationErrors<HH>();
    const timeError: RunTypeError = {expected: 'string', path: [], format: {name: 'time', formatPath: ['format'], val: 'HH'}};
    // valid time
    expect(typeErrors('00')).toEqual([]);
    expect(typeErrors('23')).toEqual([]);
    // invalid max time
    expect(typeErrors('24')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('!0')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('00:00')).toEqual([timeError]);
});
it('mock time with format HH', async () => {
    const mockType = createMockData<HH>();
    const isType = createValidate<HH>();
    const matchRegex = /^([01]\d|2[0-3])$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format mm ########

type mm = FormatStringTime<{format: 'mm'}>;

it('validate time with format mm', async () => {
    const isType = createValidate<mm>();
    // valid time
    expect(isType('00')).toBe(true);
    expect(isType('59')).toBe(true);
    // invalid max time
    expect(isType('60')).toBe(false);
    // invalid characters
    expect(isType('!0')).toBe(false);
    // wrong length
    expect(isType('00:00')).toBe(false);
});
it('get time errors for format mm', async () => {
    const typeErrors = createGetValidationErrors<mm>();
    const timeError: RunTypeError = {expected: 'string', path: [], format: {name: 'time', formatPath: ['format'], val: 'mm'}};
    // valid time
    expect(typeErrors('00')).toEqual([]);
    expect(typeErrors('59')).toEqual([]);
    // invalid max time
    expect(typeErrors('60')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('!0')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('00:00')).toEqual([timeError]);
});
it('mock time with format mm', async () => {
    const mockType = createMockData<mm>();
    const isType = createValidate<mm>();
    const matchRegex = /^([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format ss ########

type ss = FormatStringTime<{format: 'ss'}>;

it('validate time with format ss', async () => {
    const isType = createValidate<ss>();
    // valid time
    expect(isType('00')).toBe(true);
    expect(isType('59')).toBe(true);
    // invalid max time
    expect(isType('60')).toBe(false);
    // invalid characters
    expect(isType('!0')).toBe(false);
    // wrong length
    expect(isType('00:00')).toBe(false);
});
it('get time errors for format ss', async () => {
    const typeErrors = createGetValidationErrors<ss>();
    const timeError: RunTypeError = {expected: 'string', path: [], format: {name: 'time', formatPath: ['format'], val: 'ss'}};
    // valid time
    expect(typeErrors('00')).toEqual([]);
    expect(typeErrors('59')).toEqual([]);
    // invalid max time
    expect(typeErrors('60')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('!0')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('00:00')).toEqual([timeError]);
});
it('mock time with format ss', async () => {
    const mockType = createMockData<ss>();
    const isType = createValidate<ss>();
    const matchRegex = /^([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format HH:mm:ss[.mmm]TZ ########

// must include timezone but milliseconds are optional
type ISOtime = FormatStringTime<{format: 'ISO'}>; // same as StringTime<{format: 'HH:mm:ss[.mmm]TZ'}>

it('validate time with format HH:mm:ss[.mmm]TZ', async () => {
    // must include timezone but milliseconds are optiona
    const isType = createValidate<ISOtime>();
    // valid time
    expect(isType('00:00:00Z')).toBe(true);
    expect(isType('23:59:59Z')).toBe(true);
    expect(isType('00:00:00+00:00')).toBe(true);
    expect(isType('23:59:59+23:59')).toBe(true);
    expect(isType('00:00:00-00:00')).toBe(true);
    expect(isType('23:59:59-23:59')).toBe(true);
    expect(isType('00:00:00.000Z')).toBe(true);
    expect(isType('23:59:59.999Z')).toBe(true);
    expect(isType('00:00:00.000+00:00')).toBe(true);
    expect(isType('23:59:59.999+00:00')).toBe(true);
    expect(isType('00:00:00.000-00:00')).toBe(true);
    expect(isType('23:59:59.999-00:00')).toBe(true);
    // invalid max time
    expect(isType('24:00:00Z')).toBe(false);
    expect(isType('00:60:00Z')).toBe(false);
    expect(isType('00:00:60Z')).toBe(false);
    // invalid max timezone
    expect(isType('00:00:00+24:00')).toBe(false);
    expect(isType('00:00:00+23:60')).toBe(false);
    // invalid max milliseconds
    expect(isType('00:00:00.1000Z')).toBe(false);
    expect(isType('00:00:00.1000+00:00')).toBe(false);
    expect(isType('00:00:00.1000-00:00')).toBe(false);
    // invalid characters
    expect(isType('!0:00:00Z')).toBe(false);
    expect(isType('00:00:00!Z')).toBe(false);
    expect(isType('00:00:00Z!')).toBe(false);
    // wrong length
    expect(isType('00')).toBe(false);
    expect(isType('00:00')).toBe(false);
    expect(isType('00:00:00:00')).toBe(false);
});
it('get time errors for format HH:mm:ss[.mmm]TZ', async () => {
    const typeErrors = createGetValidationErrors<ISOtime>();
    const timeError: RunTypeError = {expected: 'string', path: [], format: {name: 'time', formatPath: ['format'], val: 'ISO'}};
    // valid time
    expect(typeErrors('00:00:00Z')).toEqual([]);
    expect(typeErrors('23:59:59Z')).toEqual([]);
    expect(typeErrors('00:00:00+00:00')).toEqual([]);
    expect(typeErrors('23:59:59+23:59')).toEqual([]);
    expect(typeErrors('00:00:00-00:00')).toEqual([]);
    expect(typeErrors('23:59:59-23:59')).toEqual([]);
    expect(typeErrors('00:00:00.000Z')).toEqual([]);
    expect(typeErrors('23:59:59.999Z')).toEqual([]);
    expect(typeErrors('00:00:00.000+00:00')).toEqual([]);
    expect(typeErrors('23:59:59.999+00:00')).toEqual([]);
    expect(typeErrors('00:00:00.000-00:00')).toEqual([]);
    expect(typeErrors('23:59:59.999-00:00')).toEqual([]);
    // invalid max time
    expect(typeErrors('24:00:00Z')).toEqual([timeError]);
    expect(typeErrors('00:60:00Z')).toEqual([timeError]);
    expect(typeErrors('00:00:60Z')).toEqual([timeError]);
    // invalid max timezone
    expect(typeErrors('00:00:00+24:00')).toEqual([timeError]);
    expect(typeErrors('00:00:00+23:60')).toEqual([timeError]);
    // invalid max milliseconds
    expect(typeErrors('00:00:00.1000Z')).toEqual([timeError]);
    expect(typeErrors('00:00:00.1000+00:00')).toEqual([timeError]);
    expect(typeErrors('00:00:00.1000-00:00')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('!0:00:00Z')).toEqual([timeError]);
    expect(typeErrors('00:00:00!Z')).toEqual([timeError]);
    expect(typeErrors('00:00:00Z!')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('00')).toEqual([timeError]);
    expect(typeErrors('00:00')).toEqual([timeError]);
    expect(typeErrors('00:00:00:00')).toEqual([timeError]);
});
it('mock time with format HH:mm:ss[.mmm]TZ', async () => {
    const mockType = createMockData<ISOtime>();
    const isType = createValidate<ISOtime>();
    const matchRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d{3})?[+-]([01]\d|2[0-3]):([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        // TODO pretty difficult to match ISO time format with regex
        // expect(item).toMatch(matchRegex);
    }
});
