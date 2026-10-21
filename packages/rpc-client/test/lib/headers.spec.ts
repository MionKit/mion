/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach} from 'vitest';
import {HeadersSubset, type MethodWithOptsAndJitFns} from '@mionjs/core';
import {headersToRecord, reconstructHeadersSubsetFromResponse} from '../../src/lib/headers.ts';
import {resetBundledMethods, setBundledMethod} from '../../src/lib/methods.ts';

// `fetchOptions.headers` is typed `HeadersInit`, so a caller may legitimately pass
// a Headers instance or an array of pairs. Both used to be spread straight into the
// outgoing headers object: a Headers instance has no own enumerable properties, so
// every header vanished, and an array of pairs spread as numeric indices.
describe('headersToRecord', () => {
  it('keeps a plain record as-is', () => {
    expect(headersToRecord({'x-api-key': 'abc', accept: 'application/json'})).toEqual({
      'x-api-key': 'abc',
      accept: 'application/json',
    });
  });

  it('reads the entries of a Headers instance instead of dropping them', () => {
    const headers = new Headers();
    headers.set('x-api-key', 'abc');
    expect(headersToRecord(headers)).toEqual({'x-api-key': 'abc'});
  });

  it('reads an array of name/value pairs instead of spreading indices', () => {
    expect(headersToRecord([['x-api-key', 'abc']])).toEqual({'x-api-key': 'abc'});
  });

  it('reads any other iterable of pairs, such as a Map', () => {
    expect(headersToRecord(new Map([['x-api-key', 'abc']]) as unknown as HeadersInit)).toEqual({'x-api-key': 'abc'});
  });

  it('treats a missing headers init as no headers', () => {
    expect(headersToRecord(undefined)).toEqual({});
  });

  it('copies the record instead of aliasing it', () => {
    const original = {'x-api-key': 'abc'};
    const copy = headersToRecord(original);
    copy['x-api-key'] = 'changed';
    expect(original['x-api-key']).toBe('abc');
  });
});

describe('HeadersSubset on the client', () => {
  afterEach(() => resetBundledMethods());

  it('checks request headers when the subset is built', () => {
    expect(() => new HeadersSubset<'Authorization'>({Authorization: 1 as unknown as string})).toThrow(
      'Invalid headers, validation failed.'
    );
    expect(new HeadersSubset<'Authorization'>({Authorization: 'token'}).headers).toEqual({Authorization: 'token'});
  });

  it('rebuilds response headers without a check, leaving it to the response validation', () => {
    const method = {id: 'tagged', hasReturnData: true, headersReturn: {headerNames: ['X-Tag'], jitHash: ''}};
    setBundledMethod('tagged', method as unknown as MethodWithOptsAndJitFns);
    const rebuilt = reconstructHeadersSubsetFromResponse('tagged', new Headers({'X-Tag': 'a'}));
    expect(rebuilt instanceof HeadersSubset).toBe(true);
    expect(rebuilt?.headers).toEqual({'X-Tag': 'a'});
  });
});
