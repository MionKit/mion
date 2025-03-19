/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '../functions';
import {RunTypeError} from '../types';
import {DateTimeString} from './dateTime.runtype';

// ####### DateTime format ISO #######

type ISODateTime = DateTimeString<{date: {format: 'ISO'}; time: {format: 'ISO'}}>;

it('validate datetime with format ISO', async () => {
    const isType = await isTypeFn<ISODateTime>();
    // valid datetime
    expect(isType('2023-01-01T00:00:00Z')).toBe(true);
    expect(isType('0000-12-31T23:59:59Z')).toBe(true);
    expect(isType('2023-01-01T00:00:00+00:00')).toBe(true);
    expect(isType('2023-01-01T00:00:00-00:00')).toBe(true);
    // invalid datetime
    expect(isType('2023-13-01T00:00:00Z')).toBe(false);
    expect(isType('2023-01-32T00:00:00Z')).toBe(false);
    expect(isType('2023-01-01T24:00:00Z')).toBe(false);
    expect(isType('2023-01-01T00:60:00Z')).toBe(false);
    expect(isType('2023-01-01T00:00:60Z')).toBe(false);
    // invalid characters
    expect(isType('2023-01-01T00:00:00!Z')).toBe(false);
    // wrong length
    expect(isType('2023-01-01')).toBe(false);
    expect(isType('2023-01-01T00:00')).toBe(false);
});

it('get datetime errors for format ISO', async () => {
    const typeErrors = await typeErrorsFn<ISODateTime>();
    const dateError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['date', 'format'], val: 'ISO'},
    };
    const timeError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['time', 'format'], val: 'ISO'},
    };
    // valid datetime
    expect(typeErrors('2023-01-01T00:00:00Z')).toEqual([]);
    expect(typeErrors('0000-12-31T23:59:59Z')).toEqual([]);
    expect(typeErrors('2023-01-01T00:00:00+00:00')).toEqual([]);
    expect(typeErrors('2023-01-01T00:00:00-00:00')).toEqual([]);
    // invalid datetime
    expect(typeErrors('2023-13-01T00:00:00Z')).toEqual([dateError]);
    expect(typeErrors('2023-01-32T00:00:00Z')).toEqual([dateError]);
    expect(typeErrors('2023-01-01T24:00:00Z')).toEqual([timeError]);
    expect(typeErrors('2023-01-01T00:60:00Z')).toEqual([timeError]);
    expect(typeErrors('2023-01-01T00:00:60Z')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('2023-01-01T00:00:00!Z')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('2023-01-01')).toEqual([dateError, timeError]);
    expect(typeErrors('2023-01-01T00:00')).toEqual([timeError]);
});

it('mock datetime with format ISO', async () => {
    const mockType = mockTypeFn<ISODateTime>();
    const isType = await isTypeFn<ISODateTime>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
    }
});

// ####### DateTime format MM-DDTHH #######

type MMDDTHH = DateTimeString<{date: {format: 'MM-DD'}; time: {format: 'HH'}}>;

it('validate datetime with format MM-DDTHH', async () => {
    const isType = await isTypeFn<MMDDTHH>();
    // valid datetime
    expect(isType('01-01T00')).toBe(true);
    expect(isType('12-31T23')).toBe(true);
    // invalid datetime
    expect(isType('13-01T00')).toBe(false);
    expect(isType('00-01T00')).toBe(false);
    expect(isType('01-32T00')).toBe(false);
    expect(isType('01-01T24')).toBe(false);
    // invalid characters
    expect(isType('01-01T0!')).toBe(false);
    // wrong length
    expect(isType('01-01')).toBe(false);
    expect(isType('01-01T00:00')).toBe(false);
});

it('get datetime errors for format MM-DDTHH', async () => {
    const typeErrors = await typeErrorsFn<MMDDTHH>();
    const dateError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['date', 'format'], val: 'MM-DD'},
    };
    const timeError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['time', 'format'], val: 'HH'},
    };

    // valid datetime
    expect(typeErrors('01-01T00')).toEqual([]);
    expect(typeErrors('12-31T23')).toEqual([]);
    // invalid datetime
    expect(typeErrors('13-01T00')).toEqual([dateError]);
    expect(typeErrors('00-01T00')).toEqual([dateError]);
    expect(typeErrors('01-32T00')).toEqual([dateError]);
    expect(typeErrors('01-01T24')).toEqual([timeError]);
    // invalid characters
    expect(typeErrors('01-01T0!')).toEqual([timeError]);
    // wrong length
    expect(typeErrors('01-01')).toEqual([dateError, timeError]);
    expect(typeErrors('01-01T00:00')).toEqual([timeError]);
});

it('mock datetime with format MM-DDTHH', async () => {
    const mockType = mockTypeFn<MMDDTHH>();
    const isType = await isTypeFn<MMDDTHH>();
    const matchRegex = /^\d{2}-\d{2}T\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});
