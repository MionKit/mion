/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {FetchResponseHeaders, UnusedHeadersPool, newFetchResponseHeaders} from '../../src/lib/responseHeaders.ts';
import {recordResponseHeaders} from '../../src/lib/headers.ts';
import {createMionRouter, getResponseDefaults, resetRouter} from '../../src/router.ts';
import {JSON_CONTENT_TYPE} from '../../src/constants.ts';
import type {Routes} from '../../src/types/general.ts';

const DEFAULTS = {server: 'mionjs', 'x-team': 'mion', 'content-type': JSON_CONTENT_TYPE};

describe('the unused flag', () => {
  it('stays true after the defaults are filled in, and any write turns it off', () => {
    for (const write of ['set', 'append', 'delete'] as const) {
      for (const headers of [new FetchResponseHeaders(DEFAULTS), recordResponseHeaders(DEFAULTS)]) {
        expect(headers.unused).toBe(true);
        expect(headers.get('x-team')).toBe('mion');
        if (write === 'delete') headers.delete('x-team');
        else headers[write]('x-custom', 'yes');
        expect(headers.unused).toBe(false);
      }
    }
  });

  it('is not turned off by reads', () => {
    const headers = new FetchResponseHeaders(DEFAULTS);
    headers.get('server');
    headers.has('x-team');
    expect([...headers.entries()].length).toBe(3);
    expect(headers.unused).toBe(true);
  });

  it('never leaves the defaults written into a record store', () => {
    const defaults = {...DEFAULTS};
    recordResponseHeaders(defaults).set('x-team', 'other');
    expect(defaults['x-team']).toBe('mion');
  });
});

describe('FetchResponseHeaders', () => {
  it('writes content-type only when written to or when it is not the JSON one', () => {
    const unused = new FetchResponseHeaders(DEFAULTS);
    unused.setContentType(JSON_CONTENT_TYPE);
    expect(unused.unused).toBe(true);

    const written = new FetchResponseHeaders(DEFAULTS);
    written.set('content-type', 'text/html');
    written.setContentType(JSON_CONTENT_TYPE);
    expect(written.get('content-type')).toBe(JSON_CONTENT_TYPE);

    const other = new FetchResponseHeaders(DEFAULTS);
    other.setContentType('text/plain');
    expect(other.get('content-type')).toBe('text/plain');
    expect(other.unused).toBe(false);
  });

  it('keeps two appended set-cookie values apart, and throws on a CR or LF like Headers', () => {
    const headers = new FetchResponseHeaders(DEFAULTS);
    headers.append('set-cookie', 'a=1');
    headers.append('set-cookie', 'b=2');
    expect(headers.native.getSetCookie()).toEqual(['a=1', 'b=2']);
    expect(() => headers.set('x-bad', 'one\r\ntwo')).toThrow(TypeError);
  });
});

describe('UnusedHeadersPool', () => {
  beforeEach(() => resetRouter());

  it('gives an unused one back to the next request, and never a used one', () => {
    const pool = new UnusedHeadersPool(newFetchResponseHeaders);
    const first = pool.take();
    pool.giveBack(first);
    expect(pool.take()).toBe(first);

    first.set('x-custom', 'yes');
    pool.giveBack(first);
    expect(pool.take()).not.toBe(first);
  });

  it('keeps no more than its cap', () => {
    const pool = new UnusedHeadersPool(newFetchResponseHeaders, 2);
    const taken = [pool.take(), pool.take(), pool.take()];
    taken.forEach((headers) => pool.giveBack(headers));
    expect(pool.take()).toBe(taken[1]);
    expect(pool.take()).toBe(taken[0]);
    expect(taken).not.toContain(pool.take());
  });

  it('drops what it holds once the router starts with other headers', () => {
    const pool = new UnusedHeadersPool(newFetchResponseHeaders);
    const old = pool.take();
    pool.giveBack(old);
    const mion = createMionRouter({apiVersionCheck: false, responseHeaders: {'x-team': 'mion'}});
    mion.initRoutes({ping: mion.route((): string => 'pong')} satisfies Routes);
    const fresh = pool.take();
    expect(fresh).not.toBe(old);
    expect(fresh.get('x-team')).toBe('mion');
    expect(getResponseDefaults()['x-team']).toBe('mion');
  });
});
