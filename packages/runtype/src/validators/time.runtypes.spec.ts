/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '../functions';
import {TimeString} from './time.runtypes';

// ####### Time format HH:mm:ss #######

type HHmmss = TimeString<{format: 'HH:mm:ss'}>;

it('validate time with format HH:mm:ss', async () => {
    const isType = await isTypeFn<HHmmss>();
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
    const typeErrors = await typeErrorsFn<HHmmss>();
    const timeError = {expected: 'string', path: [], info: {format: 'time', typeName: 'HHmmss'}};
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
    const mockType = mockTypeFn<HHmmss>();
    const isType = await isTypeFn<HHmmss>();
    const matchRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format HH:mm ######

type HHmm = TimeString<{format: 'HH:mm'}>;

it('validate time with format HH:mm', async () => {
    const isType = await isTypeFn<HHmm>();
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
    const typeErrors = await typeErrorsFn<HHmm>();
    const timeError = {expected: 'string', path: [], info: {format: 'time', typeName: 'HHmm'}};
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
    const mockType = mockTypeFn<HHmm>();
    const isType = await isTypeFn<HHmm>();
    const matchRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format mm:ss ########

type mmss = TimeString<{format: 'mm:ss'}>;

it('validate time with format mm:ss', async () => {
    const isType = await isTypeFn<mmss>();
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
    const typeErrors = await typeErrorsFn<mmss>();
    const timeError = {expected: 'string', path: [], info: {format: 'time', typeName: 'mmss'}};
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
    const mockType = mockTypeFn<mmss>();
    const isType = await isTypeFn<mmss>();
    const matchRegex = /^([0-5]\d):([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format HH ########

type HH = TimeString<{format: 'HH'}>;

it('validate time with format HH', async () => {
    const isType = await isTypeFn<HH>();
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
    const typeErrors = await typeErrorsFn<HH>();
    const timeError = {expected: 'string', path: [], info: {format: 'time', typeName: 'HH'}};
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
    const mockType = mockTypeFn<HH>();
    const isType = await isTypeFn<HH>();
    const matchRegex = /^([01]\d|2[0-3])$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format mm ########

type mm = TimeString<{format: 'mm'}>;

it('validate time with format mm', async () => {
    const isType = await isTypeFn<mm>();
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
    const typeErrors = await typeErrorsFn<mm>();
    const timeError = {expected: 'string', path: [], info: {format: 'time', typeName: 'mm'}};
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
    const mockType = mockTypeFn<mm>();
    const isType = await isTypeFn<mm>();
    const matchRegex = /^([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format ss ########

type ss = TimeString<{format: 'ss'}>;

it('validate time with format ss', async () => {
    const isType = await isTypeFn<ss>();
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
    const typeErrors = await typeErrorsFn<ss>();
    const timeError = {expected: 'string', path: [], info: {format: 'time', typeName: 'ss'}};
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
    const mockType = mockTypeFn<ss>();
    const isType = await isTypeFn<ss>();
    const matchRegex = /^([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        expect(item).toMatch(matchRegex);
    }
});

// ####### Time format HH:mm:ss[.mmm]TZ ########

// must include timezone but milliseconds are optional
type ISOtime = TimeString<{format: 'ISO'}>; // same as StringTime<{format: 'HH:mm:ss[.mmm]TZ'}>

it('validate time with format HH:mm:ss[.mmm]TZ', async () => {
    // must include timezone but milliseconds are optiona
    const isType = await isTypeFn<ISOtime>();
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
    const typeErrors = await typeErrorsFn<ISOtime>();
    const timeError = {expected: 'string', path: [], info: {format: 'time', typeName: 'ISOtime'}};
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
    const mockType = mockTypeFn<ISOtime>();
    const isType = await isTypeFn<ISOtime>();
    const matchRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d{3})?[+-]([01]\d|2[0-3]):([0-5]\d)$/;
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
        // TODO pretty difficult to match ISO time format with regex
        // expect(item).toMatch(matchRegex);
    }
});
