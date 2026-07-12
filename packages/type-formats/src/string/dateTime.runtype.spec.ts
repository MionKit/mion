/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createValidate, createGetValidationErrors, createMockData} from '@mionjs/run-types';
import {RunTypeError} from '@mionjs/core';
import {FormatStringDateTime} from '../../StringFormats.ts';

// ####### DateTime format ISO #######

type ISODateTime = FormatStringDateTime<{date: {format: 'ISO'}; time: {format: 'ISO'}}>;

it('validate datetime with format ISO', async () => {
    const isType = createValidate<ISODateTime>();
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
    const typeErrors = createGetValidationErrors<ISODateTime>();
    // new emitter semantics: formatPath points at the failing part ('date'|'time'|'splitChar') and val is the splitChar (the dateTime layout key)
    const dateError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['date'], val: 'T'},
    };
    const timeError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['time'], val: 'T'},
    };
    const splitCharError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['splitChar'], val: 'T'},
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
    // missing splitChar - new emitter short-circuits: only the splitChar error, no date/time errors
    expect(typeErrors('2023-01-01')).toEqual([splitCharError]);
    // wrong length
    expect(typeErrors('2023-01-01T00:00')).toEqual([timeError]);
});

it('mock datetime with format ISO', async () => {
    const mockType = createMockData<ISODateTime>();
    const isType = createValidate<ISODateTime>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
    }
});

// ####### DateTime format MM-DDTHH #######

type MMDDTHH = FormatStringDateTime<{date: {format: 'MM-DD'}; time: {format: 'HH'}}>;

it('validate datetime with format MM-DDTHH', async () => {
    const isType = createValidate<MMDDTHH>();
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
    const typeErrors = createGetValidationErrors<MMDDTHH>();
    // new emitter semantics: formatPath points at the failing part ('date'|'time'|'splitChar') and val is the splitChar (the dateTime layout key)
    const dateError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['date'], val: 'T'},
    };
    const timeError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['time'], val: 'T'},
    };
    const splitCharError: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'dateTime', formatPath: ['splitChar'], val: 'T'},
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
    // missing splitChar - new emitter short-circuits: only the splitChar error, no date/time errors
    expect(typeErrors('01-01')).toEqual([splitCharError]);
    expect(typeErrors('01-01T00:00')).toEqual([timeError]);
});

it('mock datetime with format MM-DDTHH', async () => {
    const mockType = createMockData<MMDDTHH>();
    const isType = createValidate<MMDDTHH>();
    const matchRegex = /^\d{2}-\d{2}T\d{2}$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});
