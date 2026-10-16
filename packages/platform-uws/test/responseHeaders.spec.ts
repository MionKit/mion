/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Response headers are built only on the first write: every write source must still reach the wire, and none may leak.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {HeadersSubset} from '@mionjs/core';
import {resetUwsHttpOpts, setUwsHttpOpts, startUwsServer, type UwsServer} from '../src/uwsHttp.ts';

describe('uws response headers', () => {
  const port = 8104;
  let server: UwsServer;
  const call = async (route: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/${route}`, {method: 'POST', body: JSON.stringify({[route]: []})});
    await response.text();
    return response;
  };

  beforeAll(async () => {
    resetUwsHttpOpts();
    resetRouter();
    const mion = createMionRouter({apiVersionCheck: false});
    mion.initRoutes({
      ping: mion.route((): string => 'pong'),
      setHeader: mion.route((ctx: CallContext): string => {
        ctx.response.headers.set('x-custom', 'yes');
        return 'ok';
      }),
      setContentType: mion.route((ctx: CallContext): string => {
        ctx.response.headers.set('content-type', 'text/html');
        return 'ok';
      }),
      setServer: mion.route((ctx: CallContext): string => {
        ctx.response.headers.set('server', 'my-server');
        return 'ok';
      }),
      cookies: mion.route((ctx: CallContext): string => {
        ctx.response.headers.append('set-cookie', 'a=1');
        ctx.response.headers.append('set-cookie', 'b=2');
        return 'ok';
      }),
      tagged: mion.route((): HeadersSubset<'x-tag'> => new HeadersSubset({'x-tag': 'one'})),
      fails: mion.route((): string => {
        throw new Error('boom');
      }),
      dropTeam: mion.route((ctx: CallContext): string => {
        ctx.response.headers.delete('x-team');
        return 'ok';
      }),
    });
    server = await startUwsServer({port});
  });

  afterAll(() => {
    if (server) server.close();
  });

  describe('with no default headers', () => {
    it('an untouched reply carries server and content-type', async () => {
      const response = await call('ping');
      expect(response.headers.get('server')).toEqual('mionjs');
      expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
    });

    it('a header a handler sets reaches the wire, and never the next request', async () => {
      expect((await call('setHeader')).headers.get('x-custom')).toEqual('yes');
      expect((await call('ping')).headers.get('x-custom')).toBeNull();
    });

    it('a returned HeadersSubset reaches the wire', async () => {
      expect((await call('tagged')).headers.get('x-tag')).toEqual('one');
    });

    it('a failed request carries x-rpc-error', async () => {
      const response = await call('fails');
      expect(response.headers.get('x-rpc-error')).toBeTruthy();
      expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
    });

    it('a handler can replace server but never content-type', async () => {
      expect((await call('setServer')).headers.get('server')).toEqual('my-server');
      expect((await call('setContentType')).headers.get('content-type')).toEqual('application/json; charset=utf-8');
    });
  });

  describe('with default headers', () => {
    beforeAll(() => setUwsHttpOpts({defaultResponseHeaders: {'X-Team': 'mion', server: 'mine'}}));
    afterAll(() => setUwsHttpOpts({defaultResponseHeaders: {}}));

    it('an untouched reply carries the defaults, and a server default replaces mionjs', async () => {
      const response = await call('ping');
      expect(response.headers.get('x-team')).toEqual('mion');
      expect(response.headers.get('server')).toEqual('mine');
    });

    it('a handler deleting a default drops it from that reply only', async () => {
      expect((await call('dropTeam')).headers.get('x-team')).toBeNull();
      expect((await call('ping')).headers.get('x-team')).toEqual('mion');
    });

    it('a write keeps the defaults beside it', async () => {
      const response = await call('setHeader');
      expect(response.headers.get('x-custom')).toEqual('yes');
      expect(response.headers.get('x-team')).toEqual('mion');
    });
  });
});
