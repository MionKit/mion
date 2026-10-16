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
import {Server} from 'http';
import {getTestServer} from '@google-cloud/functions-framework/testing';
import * as functions from '@google-cloud/functions-framework';
import {googleCFHandler, resetGoogleCFOpts, setGoogleCFOpts} from '../src/googleCF.ts';

describe('google cloud response headers', () => {
  const port = 8105;
  let server: Server;
  const call = async (route: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/${route}`, {method: 'POST', body: JSON.stringify({[route]: []})});
    await response.text();
    return response;
  };

  beforeAll(async () => {
    resetGoogleCFOpts();
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
      dropServer: mion.route((ctx: CallContext): string => {
        ctx.response.headers.delete('server');
        return 'ok';
      }),
      readServer: mion.route((ctx: CallContext): string => {
        ctx.response.headers.set('x-had-server', String(ctx.response.headers.has('server')));
        return 'ok';
      }),
    });
    functions.http('ResponseHeadersTests', googleCFHandler);
    server = getTestServer('ResponseHeadersTests');
    await new Promise<void>((done) => server.listen(port, () => done()));
  });

  afterAll(async () => new Promise<void>((done) => server.close(() => done())));

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

    it('a handler sees server before any write, and deleting it sends none', async () => {
      expect((await call('readServer')).headers.get('x-had-server')).toEqual('true');
      expect((await call('dropServer')).headers.get('server')).toBeNull();
    });

    it('a handler can replace server but never content-type', async () => {
      expect((await call('setServer')).headers.get('server')).toEqual('my-server');
      expect((await call('setContentType')).headers.get('content-type')).toEqual('application/json; charset=utf-8');
    });

    it('two appended set-cookie values stay two lines', async () => {
      expect((await call('cookies')).headers.getSetCookie()).toEqual(['a=1', 'b=2']);
    });
  });

  describe('with default headers', () => {
    beforeAll(() => setGoogleCFOpts({defaultResponseHeaders: {'X-Team': 'mion', server: 'mine'}}));
    afterAll(() => setGoogleCFOpts({defaultResponseHeaders: {}}));

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
