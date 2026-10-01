/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {RpcError} from '@mionjs/core';
import type {RemoteApi} from '@mionjs/router';
import {
  addThrownError,
  deleteResponseValue,
  getResponseValue,
  hasResponseValue,
  setResponseValue,
} from '../../src/lib/clientResponse.ts';
import type {ClientResponse} from '../../src/types.ts';

describe('client response', () => {
  it('reads, writes and deletes by id, one group per segment', () => {
    const response: ClientResponse<RemoteApi> = {};
    expect(setResponseValue(response, 'products/list', [1, 2])).toBe(true);
    expect(setResponseValue(response, 'products/pagination', {total: 9})).toBe(true);
    expect(response).toEqual({products: {list: [1, 2], pagination: {total: 9}}});
    expect(getResponseValue(response, 'products/list')).toEqual([1, 2]);
    expect(hasResponseValue(response, 'products/missing')).toBe(false);
    expect(getResponseValue(response, 'x/y')).toBeUndefined();
  });

  it('drops the groups a delete leaves empty, and keeps the rest', () => {
    const response: ClientResponse<RemoteApi> = {};
    setResponseValue(response, 'a/b/c', 1);
    setResponseValue(response, 'a/d', 2);
    deleteResponseValue(response, 'a/b/c');
    expect(response).toEqual({a: {d: 2}});
    deleteResponseValue(response, 'a/d');
    expect(response).toEqual({});
    deleteResponseValue(response, 'x/y');
  });

  it('never walks into a value that is not a group', () => {
    const response: ClientResponse<RemoteApi> = {};
    setResponseValue(response, 'a', 'text');
    setResponseValue(response, 'n', null);
    expect(setResponseValue(response, 'a/b', 1)).toBe(false);
    expect(setResponseValue(response, 'n/b', 1)).toBe(false);
    expect(hasResponseValue(response, 'a/length')).toBe(false);
    expect(response).toEqual({a: 'text', n: null});
  });

  it('refuses a __proto__ segment and the top-level thrown list, so nothing reaches the prototype', () => {
    const response: ClientResponse<RemoteApi> = {};
    expect(setResponseValue(response, '__proto__/polluted', 1)).toBe(false);
    expect(setResponseValue(response, 'a/__proto__', 1)).toBe(false);
    expect(setResponseValue(response, '@thrownErrors', 1)).toBe(false);
    expect(({} as any).polluted).toBeUndefined();
    expect(response).toEqual({});
  });

  it('keeps routes named like inherited members as plain entries', () => {
    const response: ClientResponse<RemoteApi> = {};
    expect(setResponseValue(response, 'constructor/prototype', 1)).toBe(true);
    expect(getResponseValue(response, 'constructor/prototype')).toBe(1);
    expect(getResponseValue(response, 'toString')).toBeUndefined();
    expect(({} as any).prototype).toBeUndefined();
  });

  it('keeps every thrown error, in order, even when the list was replaced', () => {
    const response: ClientResponse<RemoteApi> = {};
    const first = new RpcError({type: 'first', publicMessage: 'first'});
    const second = new RpcError({type: 'second', publicMessage: 'second'});
    addThrownError(response, first);
    addThrownError(response, second);
    expect(response['@thrownErrors']).toEqual([first, second]);
    (response as Record<string, unknown>)['@thrownErrors'] = {not: 'a list'};
    addThrownError(response, first);
    expect(response['@thrownErrors']).toEqual([first]);
  });
});
