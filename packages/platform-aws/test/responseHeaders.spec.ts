/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Response headers are built only on the first write: every write source must still reach the wire, and none may leak.

import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest';
import {createMionRouter, resetRouter, UnusedHeadersPool} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {HeadersSubset} from '@mionjs/core';
import {awsLambdaHandler, resetAwsLambdaOpts} from '../src/awsLambda.ts';

describe('aws response headers', () => {
  // the router starts again for each set of response headers; a running server keeps serving it
  const initApp = (responseHeaders: Record<string, string>) => {
    resetRouter();
    const mion = createMionRouter({apiVersionCheck: false, responseHeaders});
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
  };

  // the result's header record read through Headers, so every adapter's test reads the same way
  const call = async (route: string) => {
    const event = {body: JSON.stringify({[route]: []}), headers: {}, path: `/${route}`, httpMethod: 'POST'} as any;
    const result = await awsLambdaHandler(event, {} as any);
    return {status: result.statusCode, headers: new Headers(result.headers as Record<string, string>)};
  };

  beforeAll(() => {
    resetAwsLambdaOpts();
    initApp({});
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

    it('a handler sees server before any write, and deleting it sends none', async () => {
      expect((await call('readServer')).headers.get('x-had-server')).toEqual('true');
      expect((await call('dropServer')).headers.get('server')).toBeNull();
    });

    it('a handler can replace server but never content-type', async () => {
      expect((await call('setServer')).headers.get('server')).toEqual('my-server');
      expect((await call('setContentType')).headers.get('content-type')).toEqual('application/json; charset=utf-8');
    });

    it('gives unused headers back to the pool, never written ones', async () => {
      // the flag is read when given back: the next request takes the same object and may write to it
      const given: boolean[] = [];
      const giveBack = vi
        .spyOn(UnusedHeadersPool.prototype, 'giveBack')
        .mockImplementation((headers) => void given.push(headers.unused));
      await call('ping');
      await call('setHeader');
      expect(given).toEqual([true, false]);
      giveBack.mockRestore();
    });
  });

  describe('with the responseHeaders option', () => {
    beforeAll(() => initApp({'X-Team': 'mion', server: 'mine'}));
    afterAll(() => initApp({}));

    it('an untouched reply carries them, and a server header replaces mionjs', async () => {
      const response = await call('ping');
      expect(response.headers.get('x-team')).toEqual('mion');
      expect(response.headers.get('server')).toEqual('mine');
    });

    it('a handler deleting a default drops it from that reply only', async () => {
      expect((await call('dropTeam')).headers.get('x-team')).toBeNull();
      expect((await call('ping')).headers.get('x-team')).toEqual('mion');
    });

    it('an error reply and a not-found reply carry them too', async () => {
      expect((await call('fails')).headers.get('x-team')).toEqual('mion');
      const notFound = await call('nope');
      expect(notFound.status).toEqual(404);
      expect(notFound.headers.get('x-team')).toEqual('mion');
    });

    it('a write keeps the defaults beside it', async () => {
      const response = await call('setHeader');
      expect(response.headers.get('x-custom')).toEqual('yes');
      expect(response.headers.get('x-team')).toEqual('mion');
    });
  });
});
