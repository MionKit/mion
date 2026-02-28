/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createIsTypeFn, createMockTypeFn, createTypeErrorsFn} from '@mionkit/run-types';
import {RunTypeError} from '@mionkit/core';
import {FormatStringDate} from './date.runtype';

// ####### Date format YYYY-MM-DD #######

type YYYYMMDD = FormatStringDate<{format: 'YYYY-MM-DD'}>; // same as StringDate<{format: 'ISO'}>;

it('validate date with format YYYY-MM-DD', async () => {
    const isType = await createIsTypeFn<YYYYMMDD>();
    // valid date
    expect(isType('2023-01-01')).toBe(true);
    expect(isType('0000-12-31')).toBe(true);
    // invalid date
    expect(isType('2023-13-01')).toBe(false);
    expect(isType('2023-00-01')).toBe(false);
    expect(isType('2023-01-32')).toBe(false);
    // invalid characters
    expect(isType('2023-01-0!')).toBe(false);
    // wrong length
    expect(isType('2023-01')).toBe(false);
    expect(isType('2023-01-01-01')).toBe(false);
    // invalid leap year
    expect(isType('1900-02-29')).toBe(false);
    expect(isType('2000-02-29')).toBe(true);
    // invalid february
    expect(isType('2023-02-30')).toBe(false);
    // invalid month with 31 days
    expect(isType('2023-04-31')).toBe(false);
    expect(isType('2023-06-31')).toBe(false);
    expect(isType('2023-09-31')).toBe(false);
    expect(isType('2023-11-31')).toBe(false);
    // valid month with 31 days
    expect(isType('2023-01-31')).toBe(true);
    expect(isType('2023-03-31')).toBe(true);
});
it('get date errors for format YYYY-MM-DD', async () => {
    const typeErrors = await createTypeErrorsFn<YYYYMMDD>();
    const dateError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'date', formatPath: ['format'], val: 'YYYY-MM-DD'},
    };
    // valid date
    expect(typeErrors('2023-01-01')).toEqual([]);
    expect(typeErrors('0000-12-31')).toEqual([]);
    // invalid date
    expect(typeErrors('2023-13-01')).toEqual([dateError]);
    expect(typeErrors('2023-00-01')).toEqual([dateError]);
    expect(typeErrors('2023-01-32')).toEqual([dateError]);
    // invalid characters
    expect(typeErrors('2023-01-0!')).toEqual([dateError]);
    // wrong length
    expect(typeErrors('2023-01')).toEqual([dateError]);
    expect(typeErrors('2023-01-01-01')).toEqual([dateError]);
});
it('mock date with format YYYY-MM-DD', async () => {
    const mockType = await createMockTypeFn<YYYYMMDD>();
    const isType = await createIsTypeFn<YYYYMMDD>();
    const matchRegex = /^\d{4}-\d{2}-\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format DD-MM-YYYY #######

type DDMMYYYY = FormatStringDate<{format: 'DD-MM-YYYY'}>;

it('validate date with format DD-MM-YYYY', async () => {
    const isType = await createIsTypeFn<DDMMYYYY>();
    // valid date
    expect(isType('01-01-2023')).toBe(true);
    expect(isType('31-12-0000')).toBe(true);
    // invalid date
    expect(isType('01-13-2023')).toBe(false);
    expect(isType('01-00-2023')).toBe(false);
    expect(isType('32-01-2023')).toBe(false);
    // invalid characters
    expect(isType('01-0!-2023')).toBe(false);
    // wrong length
    expect(isType('01-2023')).toBe(false);
    expect(isType('01-01-2023-01')).toBe(false);
});
it('get date errors for format DD-MM-YYYY', async () => {
    const typeErrors = await createTypeErrorsFn<DDMMYYYY>();
    const dateError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'date', formatPath: ['format'], val: 'DD-MM-YYYY'},
    };
    // valid date
    expect(typeErrors('01-01-2023')).toEqual([]);
    expect(typeErrors('31-12-0000')).toEqual([]);
    // invalid date
    expect(typeErrors('01-13-2023')).toEqual([dateError]);
    expect(typeErrors('01-00-2023')).toEqual([dateError]);
    expect(typeErrors('32-01-2023')).toEqual([dateError]);
    // invalid characters
    expect(typeErrors('01-0!-2023')).toEqual([dateError]);
    // wrong length
    expect(typeErrors('01-2023')).toEqual([dateError]);
    expect(typeErrors('01-01-2023-01')).toEqual([dateError]);
});
it('mock date with format DD-MM-YYYY', async () => {
    const mockType = await createMockTypeFn<DDMMYYYY>();
    const isType = await createIsTypeFn<DDMMYYYY>();
    const matchRegex = /^\d{2}-\d{2}-\d{4}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format MM-DD-YYYY #######

type MMDDYYYY = FormatStringDate<{format: 'MM-DD-YYYY'}>;

it('validate date with format MM-DD-YYYY', async () => {
    const isType = await createIsTypeFn<MMDDYYYY>();
    // valid date
    expect(isType('01-01-2023')).toBe(true);
    expect(isType('12-31-0000')).toBe(true);
    // invalid date
    expect(isType('13-01-2023')).toBe(false);
    expect(isType('00-01-2023')).toBe(false);
    expect(isType('01-32-2023')).toBe(false);
    // invalid characters
    expect(isType('01-0!-2023')).toBe(false);
    // wrong length
    expect(isType('01-2023')).toBe(false);
    expect(isType('01-01-2023-01')).toBe(false);
});
it('get date errors for format MM-DD-YYYY', async () => {
    const typeErrors = await createTypeErrorsFn<MMDDYYYY>();
    const dateError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'date', formatPath: ['format'], val: 'MM-DD-YYYY'},
    };
    // valid date
    expect(typeErrors('01-01-2023')).toEqual([]);
    expect(typeErrors('12-31-0000')).toEqual([]);
    // invalid date
    expect(typeErrors('13-01-2023')).toEqual([dateError]);
    expect(typeErrors('00-01-2023')).toEqual([dateError]);
    expect(typeErrors('01-32-2023')).toEqual([dateError]);
    // invalid characters
    expect(typeErrors('01-0!-2023')).toEqual([dateError]);
    // wrong length
    expect(typeErrors('01-2023')).toEqual([dateError]);
    expect(typeErrors('01-01-2023-01')).toEqual([dateError]);
});
it('mock date with format MM-DD-YYYY', async () => {
    const mockType = await createMockTypeFn<MMDDYYYY>();
    const isType = await createIsTypeFn<MMDDYYYY>();
    const matchRegex = /^\d{2}-\d{2}-\d{4}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format YYYY-MM #######

type YYYYMM = FormatStringDate<{format: 'YYYY-MM'}>;

it('validate date with format YYYY-MM', async () => {
    const isType = await createIsTypeFn<YYYYMM>();
    // valid date
    expect(isType('2023-01')).toBe(true);
    expect(isType('0000-12')).toBe(true);
    // invalid date
    expect(isType('2023-13')).toBe(false);
    expect(isType('2023-00')).toBe(false);
    // invalid characters
    expect(isType('2023-01-0!')).toBe(false);
    // wrong length
    expect(isType('2023')).toBe(false);
    expect(isType('2023-01-01')).toBe(false);
});
it('get date errors for format YYYY-MM', async () => {
    const typeErrors = await createTypeErrorsFn<YYYYMM>();
    const dateError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'date', formatPath: ['format'], val: 'YYYY-MM'},
    };
    // valid date
    expect(typeErrors('2023-01')).toEqual([]);
    expect(typeErrors('0000-12')).toEqual([]);
    // invalid date
    expect(typeErrors('2023-13')).toEqual([dateError]);
    expect(typeErrors('2023-00')).toEqual([dateError]);
    // invalid characters
    expect(typeErrors('2023-01-0!')).toEqual([dateError]);
    // wrong length
    expect(typeErrors('2023')).toEqual([dateError]);
    expect(typeErrors('2023-01-01')).toEqual([dateError]);
});
it('mock date with format YYYY-MM', async () => {
    const mockType = await createMockTypeFn<YYYYMM>();
    const isType = await createIsTypeFn<YYYYMM>();
    const matchRegex = /^\d{4}-\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format MM-DD #######

type MMDD = FormatStringDate<{format: 'MM-DD'}>;

it('validate date with format MM-DD', async () => {
    const isType = await createIsTypeFn<MMDD>();
    // valid date
    expect(isType('01-01')).toBe(true);
    expect(isType('12-31')).toBe(true);
    // invalid date
    expect(isType('13-01')).toBe(false);
    expect(isType('00-01')).toBe(false);
    expect(isType('01-32')).toBe(false);
    // invalid characters
    expect(isType('01-0!')).toBe(false);
    // wrong length
    expect(isType('01')).toBe(false);
    expect(isType('01-01-01')).toBe(false);
});
it('get date errors for format MM-DD', async () => {
    const typeErrors = await createTypeErrorsFn<MMDD>();
    const dateError: RunTypeError = {expected: 'string', path: [], format: {name: 'date', formatPath: ['format'], val: 'MM-DD'}};
    // valid date
    expect(typeErrors('01-01')).toEqual([]);
    expect(typeErrors('12-31')).toEqual([]);
    // invalid date
    expect(typeErrors('13-01')).toEqual([dateError]);
    expect(typeErrors('00-01')).toEqual([dateError]);
    expect(typeErrors('01-32')).toEqual([dateError]);
    // invalid characters
    expect(typeErrors('01-0!')).toEqual([dateError]);
    // wrong length
    expect(typeErrors('01')).toEqual([dateError]);
    expect(typeErrors('01-01-01')).toEqual([dateError]);
});
it('mock date with format MM-DD', async () => {
    const mockType = await createMockTypeFn<MMDD>();
    const isType = await createIsTypeFn<MMDD>();
    const matchRegex = /^\d{2}-\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format DD-MM #######

type DDMM = FormatStringDate<{format: 'DD-MM'}>;

it('validate date with format DD-MM', async () => {
    const isType = await createIsTypeFn<DDMM>();
    // valid date
    expect(isType('01-01')).toBe(true);
    expect(isType('31-12')).toBe(true);
    // invalid date
    expect(isType('01-13')).toBe(false);
    expect(isType('01-00')).toBe(false);
    expect(isType('32-01')).toBe(false);
    // invalid characters
    expect(isType('01-0!')).toBe(false);
    // wrong length
    expect(isType('01')).toBe(false);
    expect(isType('01-01-01')).toBe(false);
});
it('get date errors for format DD-MM', async () => {
    const typeErrors = await createTypeErrorsFn<DDMM>();
    const dateError: RunTypeError = {expected: 'string', path: [], format: {name: 'date', formatPath: ['format'], val: 'DD-MM'}};
    // valid date
    expect(typeErrors('01-01')).toEqual([]);
    expect(typeErrors('31-12')).toEqual([]);
    // invalid date
    expect(typeErrors('01-13')).toEqual([dateError]);
    expect(typeErrors('01-00')).toEqual([dateError]);
    expect(typeErrors('32-01')).toEqual([dateError]);
    // invalid characters
    expect(typeErrors('01-0!')).toEqual([dateError]);
    // wrong length
    expect(typeErrors('01')).toEqual([dateError]);
    expect(typeErrors('01-01-01')).toEqual([dateError]);
});
it('mock date with format DD-MM', async () => {
    const mockType = await createMockTypeFn<DDMM>();
    const isType = await createIsTypeFn<DDMM>();
    const matchRegex = /^\d{2}-\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});
