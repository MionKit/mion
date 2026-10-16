/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {LazyResponseHeaders, fetchResponseHeaders, fetchReplyHeaders} from '../../src/lib/responseHeaders.ts';
import {headersFromRecord} from '../../src/lib/headers.ts';
import {createMionRouter, getResponseDefaults, resetRouter} from '../../src/router.ts';
import {JSON_CONTENT_TYPE} from '../../src/constants.ts';
import type {Routes} from '../../src/types/general.ts';

const DEFAULTS = Object.freeze({'x-team': 'mion'});

function recordHeaders(defaults: Readonly<Record<string, string>>) {
  return headersFromRecord({...defaults}, true);
}

describe('LazyResponseHeaders', () => {
  it('builds no store until a write, and reads the defaults in any case', () => {
    const createStore = vi.fn(recordHeaders);
    const headers = new LazyResponseHeaders(DEFAULTS, createStore);
    expect(headers.get('X-Team')).toBe('mion');
    expect(headers.has('x-team')).toBe(true);
    expect([...headers.entries()]).toEqual([['x-team', 'mion']]);
    expect(headers.written).toBeUndefined();
    expect(createStore).not.toHaveBeenCalled();
  });

  it('creates the store on the first write, seeded with the defaults', () => {
    const headers = new LazyResponseHeaders(DEFAULTS, recordHeaders);
    headers.set('x-custom', 'yes');
    expect(headers.written).toBeDefined();
    expect(headers.get('x-custom')).toBe('yes');
    expect(headers.get('x-team')).toBe('mion');
  });

  it('never writes into the shared defaults, so a later request starts clean', () => {
    const first = new LazyResponseHeaders(DEFAULTS, recordHeaders);
    first.delete('x-team');
    first.set('x-custom', 'yes');
    const second = new LazyResponseHeaders(DEFAULTS, recordHeaders);
    expect(second.get('x-team')).toBe('mion');
    expect(second.get('x-custom')).toBeUndefined();
    expect(DEFAULTS).toEqual({'x-team': 'mion'});
  });

  it('builds nothing to delete a name the defaults do not hold', () => {
    const headers = new LazyResponseHeaders(DEFAULTS, recordHeaders);
    headers.delete('x-other');
    expect(headers.written).toBeUndefined();
    headers.delete('x-team');
    expect(headers.has('x-team')).toBe(false);
  });

  it('appends after a default', () => {
    const headers = new LazyResponseHeaders(DEFAULTS, recordHeaders);
    headers.append('x-team', 'router');
    expect(headers.get('x-team')).toBe('mion, router');
  });
});

describe('fetchReplyHeaders', () => {
  it('answers an untouched reply with no defaults from one shared instance', () => {
    const first = fetchReplyHeaders(fetchResponseHeaders(Object.freeze({})), JSON_CONTENT_TYPE);
    const second = fetchReplyHeaders(fetchResponseHeaders(Object.freeze({})), JSON_CONTENT_TYPE);
    expect(first).toBe(second);
    expect([...first.entries()]).toEqual([
      ['content-type', JSON_CONTENT_TYPE],
      ['server', 'mionjs'],
    ]);
  });

  it('keeps the shared instance clean: Response copies the headers it is given', () => {
    const shared = fetchReplyHeaders(fetchResponseHeaders(Object.freeze({})), JSON_CONTENT_TYPE);
    new Response('{}', {headers: shared}).headers.set('x-leak', 'yes');
    expect(shared.has('x-leak')).toBe(false);
  });

  it('sends the defaults, a written header and content-type last', () => {
    const headers = fetchResponseHeaders(DEFAULTS);
    headers.set('content-type', 'text/html');
    headers.set('x-custom', 'yes');
    const reply = fetchReplyHeaders(headers, JSON_CONTENT_TYPE);
    expect(reply.get('content-type')).toBe(JSON_CONTENT_TYPE);
    expect(reply.get('x-team')).toBe('mion');
    expect(reply.get('x-custom')).toBe('yes');
    expect(reply.get('server')).toBe('mionjs');
  });

  it('lets a server default replace mionjs', () => {
    const reply = fetchReplyHeaders(fetchResponseHeaders(Object.freeze({server: 'mine'})), JSON_CONTENT_TYPE);
    expect(reply.get('server')).toBe('mine');
  });

  it('keeps two appended set-cookie values apart, and throws on a CR or LF like Headers', () => {
    const headers = fetchResponseHeaders(Object.freeze({}));
    headers.append('set-cookie', 'a=1');
    headers.append('set-cookie', 'b=2');
    expect(fetchReplyHeaders(headers, JSON_CONTENT_TYPE).getSetCookie()).toEqual(['a=1', 'b=2']);
    expect(() => fetchResponseHeaders(Object.freeze({})).set('x-bad', 'one\r\ntwo')).toThrow(TypeError);
  });
});

describe('getResponseDefaults', () => {
  beforeEach(() => resetRouter());

  it('lowercases every name, so the adapter wins a clash in any case', () => {
    const mion = createMionRouter({globalResponseHeaders: {'X-App': 'router', 'X-Team': 'mion'}, apiVersionCheck: false});
    mion.initRoutes({ping: mion.route((): string => 'pong')} satisfies Routes);
    expect({...getResponseDefaults({'x-app': 'adapter'})}).toEqual({'x-app': 'adapter', 'x-team': 'mion'});
  });

  it('holds no server header: each adapter writes it at reply time', () => {
    const mion = createMionRouter({apiVersionCheck: false});
    mion.initRoutes({ping: mion.route((): string => 'pong')} satisfies Routes);
    expect({...getResponseDefaults({})}).toEqual({});
  });
});
