/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createValidate, createGetValidationErrors, createMockData, TypeFormat} from '@mionjs/run-types';
import {RunTypeError} from '@mionjs/core';
import {FormatIP, FormatIPv4, FormatIPv4WithPort, FormatIPv6, FormatIPv6WithPort} from '../../StringFormats.ts';

it('should validate IPV4 values', async () => {
    const isType = createValidate<FormatIPv4>();
    // Valid cases
    expect(isType('192.168.0.1')).toBe(true);
    expect(isType('localHost')).toBe(true);
    expect(isType('127.0.0.1')).toBe(true);
    expect(isType('255.255.255.255')).toBe(true);
    // Invalid cases
    expect(isType('256.256.256.256')).toBe(false);
    expect(isType('192.168.0')).toBe(false);
    expect(isType('192.168.0.1:8080')).toBe(false);
    // Invalid version
    expect(isType('::1')).toBe(false);
    expect(isType('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(false);
});

it('should validate IPV4 values with port', async () => {
    const isType = createValidate<FormatIPv4WithPort>();
    // Valid cases
    expect(isType('192.168.0.1:80')).toBe(true);
    expect(isType('localHost:80')).toBe(true);
    expect(isType('127.0.0.1')).toBe(true);
    expect(isType('255.255.255.255:90')).toBe(true);
    // port too high
    expect(isType('192.168.0.1:80800')).toBe(false);
    // invalid port
    expect(isType('192.168.0.1:8080:8080')).toBe(false);
    expect(isType('192.168.0.1:80-80')).toBe(false);
});

it('should return IPV4 errors', async () => {
    const typeErrors = createGetValidationErrors<FormatIPv4>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'ip', formatPath: ['version'], val: 4}};
    // Valid cases
    expect(typeErrors('192.168.0.1')).toEqual([]);
    expect(typeErrors('localHost')).toEqual([]);
    expect(typeErrors('127.0.0.1')).toEqual([]);
    expect(typeErrors('255.255.255.255')).toEqual([]);
    // Invalid cases
    expect(typeErrors('256.256.256.256')).toEqual([err]);
    expect(typeErrors('192.168.0')).toEqual([err]);
    expect(typeErrors('192.168.0.1:8080')).toEqual([err]);
    // Invalid version
    expect(typeErrors('::1')).toEqual([err]);
    expect(typeErrors('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toEqual([err]);
});

it('should mock IPV4 values', async () => {
    const mockType = createMockData<FormatIPv4>();
    const isType = createValidate<FormatIPv4>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
    }
});

it('should validate IPV6 values', async () => {
    const isType = createValidate<FormatIPv6>();
    // Valid cases
    expect(isType('::1')).toBe(true);
    expect(isType('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    expect(isType('fe80::1ff:fe23:4567:890a')).toBe(true);
    expect(isType('0:0:0:0:0:0:0:1')).toBe(true);
    // Invalid cases
    expect(isType('2001:0db8:85a3:0000:0000:8a2e:0370:7334:1234')).toBe(false);
    expect(isType('2001:db8::85a3::8a2e:370:7334')).toBe(false);
    expect(isType('[2001:db8::85a3]:8080')).toBe(false);
});

it('should validate IPV6 values with port', async () => {
    const isType = createValidate<FormatIPv6WithPort>();
    // Valid cases
    expect(isType('[::1]:80')).toBe(true);
    expect(isType('[2001:0db8:85a3:0000:0000:8a2e:0370:7334]:3060')).toBe(true);
    expect(isType('[fe80::1ff:fe23:4567:890a]:3434')).toBe(true);
    expect(isType('[0:0:0:0:0:0:0:1]:40')).toBe(true);
    // port too high
    expect(isType('[fe80::1ff:fe23:4567:890a]:80800')).toBe(false);
    // invalid port
    expect(isType('[fe80::1ff:fe23:4567:890a]:8080:8080')).toBe(false);
    expect(isType('[fe80::1ff:fe23:4567:890a]:80-80')).toBe(false);
});

it('should return IPV6 errors', async () => {
    const typeErrors = createGetValidationErrors<FormatIPv6>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'ip', formatPath: ['version'], val: 6}};
    // Valid cases
    expect(typeErrors('::1')).toEqual([]);
    // Invalid cases
    expect(typeErrors('2001:0db8:85a3:0000:0000:8a2e:0370:7334:1234')).toEqual([err]);
    expect(typeErrors('2001:db8::85a3::8a2e:370:7334')).toEqual([err]);
    expect(typeErrors('[2001:db8::85a3]:8080')).toEqual([err]);
});

it('should mock IPV6 values', async () => {
    const mockType = createMockData<FormatIPv6>();
    const isType = createValidate<FormatIPv6>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
    }
});

it('should validate IP values', async () => {
    const isType = createValidate<FormatIP>();
    // Valid cases
    expect(isType('192.168.0.1')).toBe(true);
    expect(isType('::1')).toBe(true);
    expect(isType('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    // Invalid cases
    expect(isType('256.256.256.256')).toBe(false);
    expect(isType('2001:0db8:85a3:0000:0000:8a2e:0370:7334:1234')).toBe(false);
    expect(isType('192.168.0.1:8080')).toBe(false);
});

it('should return IP errors', async () => {
    const typeErrors = createGetValidationErrors<FormatIP>();
    const err: RunTypeError = {expected: 'string', path: [], format: {name: 'ip', formatPath: ['version'], val: 'any'}};
    // Valid cases
    expect(typeErrors('192.168.0.1')).toEqual([]);
    // Invalid cases
    expect(typeErrors('256.256.256.256')).toEqual([err]);
    expect(typeErrors('2001:0db8:85a3:0000:0000:8a2e:0370:7334:1234')).toEqual([err]);
    expect(typeErrors('192.168.0.1:8080')).toEqual([err]);
});

it('should mock IP values', async () => {
    const mockType = createMockData<FormatIP>();
    const isType = createValidate<FormatIP>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(isType(item)).toBe(true);
    }
});

it('should not allow localhost', async () => {
    // FormatIP is no longer generic; the same custom params are expressed
    // with a direct TypeFormat<'ip'> annotation
    const isType = createValidate<TypeFormat<string, 'ip', {version: 'any'; allowLocalHost: false}>>();
    // Valid cases
    expect(isType('192.168.0.1')).toBe(true);
    expect(isType('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    expect(isType('2001::7334')).toBe(true);
    // Invalid cases
    expect(isType('localHost')).toBe(false);
    expect(isType('127:0:0:1')).toBe(false);
    expect(isType('::1')).toBe(false);
    expect(isType('0:0:0:0:0:0:0:1')).toBe(false);
});
