/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types/src/runTimeFunctions';
import {RunTypeError} from '@mionkit/core/src/types';
import {DateFormat} from './date.runtype';

// ####### Date format YYYY-MM-DD #######

type YYYYMMDD = DateFormat<{format: 'YYYY-MM-DD'}>; // same as StringDate<{format: 'ISO'}>;

it('validate date with format YYYY-MM-DD', async () => {
    const isType = await isTypeFn<YYYYMMDD>();
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
    const typeErrors = await typeErrorsFn<YYYYMMDD>();
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
    const mockType = await mockTypeFn<YYYYMMDD>();
    const isType = await isTypeFn<YYYYMMDD>();
    const matchRegex = /^\d{4}-\d{2}-\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format DD-MM-YYYY #######

type DDMMYYYY = DateFormat<{format: 'DD-MM-YYYY'}>;

it('validate date with format DD-MM-YYYY', async () => {
    const isType = await isTypeFn<DDMMYYYY>();
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
    const typeErrors = await typeErrorsFn<DDMMYYYY>();
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
    const mockType = await mockTypeFn<DDMMYYYY>();
    const isType = await isTypeFn<DDMMYYYY>();
    const matchRegex = /^\d{2}-\d{2}-\d{4}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format MM-DD-YYYY #######

type MMDDYYYY = DateFormat<{format: 'MM-DD-YYYY'}>;

it('validate date with format MM-DD-YYYY', async () => {
    const isType = await isTypeFn<MMDDYYYY>();
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
    const typeErrors = await typeErrorsFn<MMDDYYYY>();
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
    const mockType = await mockTypeFn<MMDDYYYY>();
    const isType = await isTypeFn<MMDDYYYY>();
    const matchRegex = /^\d{2}-\d{2}-\d{4}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format YYYY-MM #######

type YYYYMM = DateFormat<{format: 'YYYY-MM'}>;

it('validate date with format YYYY-MM', async () => {
    const isType = await isTypeFn<YYYYMM>();
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
    const typeErrors = await typeErrorsFn<YYYYMM>();
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
    const mockType = await mockTypeFn<YYYYMM>();
    const isType = await isTypeFn<YYYYMM>();
    const matchRegex = /^\d{4}-\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format MM-DD #######

type MMDD = DateFormat<{format: 'MM-DD'}>;

it('validate date with format MM-DD', async () => {
    const isType = await isTypeFn<MMDD>();
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
    const typeErrors = await typeErrorsFn<MMDD>();
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
    const mockType = await mockTypeFn<MMDD>();
    const isType = await isTypeFn<MMDD>();
    const matchRegex = /^\d{2}-\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Date format DD-MM #######

type DDMM = DateFormat<{format: 'DD-MM'}>;

it('validate date with format DD-MM', async () => {
    const isType = await isTypeFn<DDMM>();
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
    const typeErrors = await typeErrorsFn<DDMM>();
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
    const mockType = await mockTypeFn<DDMM>();
    const isType = await isTypeFn<DDMM>();
    const matchRegex = /^\d{2}-\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});
