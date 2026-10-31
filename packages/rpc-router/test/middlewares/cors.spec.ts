/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '../../src/router.ts';
import {dispatchRoute} from '../../src/dispatch.ts';
import {registerBatches} from '../../src/batches.ts';
import {headersFromRecord} from '../../src/lib/headers.ts';
import {mionCors, mionFetchMetadata} from '../../middlewares.ts';
import type {CallContext, MionResponse} from '../../src/types/context.ts';
import type {Routes} from '../../src/types/general.ts';
import {HeadersSubset, MION_BATCH_PATH, MION_ROUTES, StatusCodes} from '@mionjs/core';

const mion = createMionRouter();
const APP = 'https://app.example.com';

let ran: string[] = [];

const auth = mion.headersMiddleware(
  (ctx: CallContext, headers: HeadersSubset<'authorization', 'x-debug-node', {cors: {'x-debug-node': false}}>): void => {
    ran.push('auth');
  }
);
const listUsers = mion.query((): HeadersSubset<'x-total', 'x-node', {cors: {'x-node': false}}> => {
  ran.push('listUsers');
  return new HeadersSubset({'x-total': '2', 'x-node': 'n1'});
});
const saveUser = mion.mutation((ctx: CallContext, name: string): string => {
  ran.push('saveUser');
  return name;
});
const trace = mion.route((): HeadersSubset<'x-trace', never, {cors: false}> => new HeadersSubset({'x-trace': 't1'}));
const failing = mion.route((): string => {
  throw new Error('boom');
});

function send(
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: Record<string, unknown[]>
): Promise<MionResponse> {
  const reqHeaders = headersFromRecord({authorization: 'token', ...headers});
  const raw = body ? JSON.stringify(body) : '';
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : undefined;
  return dispatchRoute(path.split('?')[0], raw, reqHeaders, headersFromRecord({}), {}, {}, undefined, query, method);
}
const preflight = (path: string, origin = APP, extra: Record<string, string> = {}) =>
  send(path, 'OPTIONS', {origin, 'access-control-request-method': 'POST', ...extra});
const list = (value: string) => value.split(', ').sort();

describe('mionCors', () => {
  beforeEach(() => {
    ran = [];
    resetRouter();
  });

  describe('at the root', () => {
    beforeEach(() => {
      mion.initRoutes({
        cors: mionCors({origin: [APP], maxAge: 600, allowHeaders: ['X-Raw-In'], exposeHeaders: ['x-raw-out', 'x-node']}),
        mionFetchMetadata,
        auth,
        listUsers,
        saveUser,
        trace,
        failing,
      } satisfies Routes);
    });

    it('answers a preflight 200 with no error, before any other member runs', async () => {
      const response = await preflight('/saveUser');
      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(response.hasErrors).toBe(false);
      expect(response.endedEarly).toBe(true);
      expect(response.body).toEqual({});
      expect(ran).toEqual([]);
      const headers = response.headers;
      expect(headers.get('access-control-allow-origin')).toBe(APP);
      expect(headers.get('access-control-allow-methods')).toBe('POST');
      expect(headers.get('access-control-max-age')).toBe('600');
      expect(headers.get('vary')).toBe('Origin');
      expect(headers.get('access-control-allow-credentials')).toBeFalsy();
    });

    it('allows the request headers the chain declares plus the hand-written ones, never a cors: false one', async () => {
      const headers = (await preflight('/listUsers')).headers;
      expect(list(headers.get('access-control-allow-headers') as string)).toEqual(['authorization', 'content-type', 'x-raw-in']);
      expect(headers.get('access-control-allow-methods')).toBe('GET, POST');
    });

    it('exposes the response headers the route declares plus mion and hand-written ones, never a cors: false one', async () => {
      const response = await send('/listUsers', 'POST', {origin: APP}, {listUsers: []});
      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(ran).toEqual(['auth', 'listUsers']);
      expect(response.headers.get('access-control-allow-origin')).toBe(APP);
      // x-node is hand-written AND marked cors: false: the mark wins
      expect(list(response.headers.get('access-control-expose-headers') as string)).toEqual([
        'x-build-version',
        'x-raw-out',
        'x-rpc-error',
        'x-total',
      ]);
      expect(response.headers.get('x-node')).toBe('n1');
      const traced = await send('/trace', 'POST', {origin: APP}, {trace: []});
      expect(traced.headers.get('access-control-expose-headers')).not.toContain('x-trace');
    });

    it('adds its headers to an error answer too, so the client can read the error', async () => {
      const response = await send('/failing', 'POST', {origin: APP}, {failing: []});
      expect(response.hasErrors).toBe(true);
      expect(response.headers.get('access-control-allow-origin')).toBe(APP);
      expect(response.headers.get('access-control-expose-headers')).toContain('x-rpc-error');
    });

    it('sends no CORS headers to an origin it does not allow, and still answers the request', async () => {
      const response = await send('/saveUser', 'POST', {origin: 'https://evil.example'}, {saveUser: ['a']});
      expect(response.body.saveUser).toBe('a');
      expect(response.headers.get('access-control-allow-origin')).toBeFalsy();
      expect(response.headers.get('vary')).toBe('Origin');
      const refused = await preflight('/saveUser', 'https://evil.example');
      expect(refused.statusCode).toBe(StatusCodes.OK);
      expect(refused.headers.get('access-control-allow-origin')).toBeFalsy();
      expect(refused.headers.get('access-control-allow-methods')).toBeFalsy();
    });

    it('ends every OPTIONS, preflight or not, so none reaches a route', async () => {
      const response = await send('/saveUser', 'OPTIONS', {origin: APP}, {saveUser: ['a']});
      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(ran).toEqual([]);
      expect(response.headers.get('access-control-allow-methods')).toBeFalsy();
    });

    it('still refuses a method the route does not accept, with its CORS headers', async () => {
      const response = await send('/saveUser', 'GET', {origin: APP});
      expect(response.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
      expect(response.headers.get('access-control-allow-origin')).toBe(APP);
      expect(ran).toEqual([]);
    });

    it('derives a batch chain from all its members', async () => {
      registerBatches({both: {routes: ['listUsers', 'saveUser']}});
      const headers = (await preflight(`${MION_BATCH_PATH}?id=both`)).headers;
      expect(headers.get('access-control-allow-methods')).toBe('POST');
      expect(list(headers.get('access-control-allow-headers') as string)).toEqual(['authorization', 'content-type', 'x-raw-in']);
      const response = await send(`${MION_BATCH_PATH}?id=both`, 'POST', {origin: APP}, {listUsers: [], saveUser: ['b']});
      expect(response.headers.get('access-control-expose-headers')).toContain('x-total');
    });
  });

  describe('placement', () => {
    it('covers only the group it sits in; an API without it gets no CORS headers', async () => {
      mion.initRoutes({
        auth,
        open: {cors: mionCors({origin: APP}), listUsers},
        closed: {saveUser},
      } satisfies Routes);
      const inGroup = await send('/open/listUsers', 'POST', {origin: APP}, {listUsers: []});
      expect(inGroup.headers.get('access-control-allow-origin')).toBe(APP);
      const outside = await send('/closed/saveUser', 'POST', {origin: APP}, {'closed/saveUser': ['a']});
      expect(outside.headers.get('access-control-allow-origin')).toBeFalsy();
      expect(outside.headers.get('vary')).toBeFalsy();
      const optionsOutside = await preflight('/closed/saveUser');
      expect(optionsOutside.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
      expect(optionsOutside.body[MION_ROUTES.thrownErrors]?.[MION_ROUTES.platformError]?.type).toBe('method-not-allowed');
    });
  });

  describe('origin and credentials', () => {
    const allowed = async (origin: MionCorsOrigin, requestOrigin: string, credentials = false) => {
      resetRouter();
      mion.initRoutes({cors: mionCors({origin, credentials}), listUsers});
      return (await send('/listUsers', 'POST', {origin: requestOrigin}, {listUsers: []})).headers;
    };
    type MionCorsOrigin = Parameters<typeof mionCors>[0]['origin'];

    it('takes one origin, a list, a RegExp, a check or any', async () => {
      expect((await allowed(APP, APP)).get('access-control-allow-origin')).toBe(APP);
      expect((await allowed(APP, 'https://other.example')).get('access-control-allow-origin')).toBeFalsy();
      expect((await allowed(['https://a.example', APP], APP)).get('access-control-allow-origin')).toBe(APP);
      const pattern = /^https:\/\/[a-z]+\.example\.com$/g;
      for (let i = 0; i < 3; i++) expect((await allowed(pattern, APP)).get('access-control-allow-origin')).toBe(APP);
      expect((await allowed((origin) => origin.endsWith('.example.com'), APP)).get('access-control-allow-origin')).toBe(APP);
      expect((await allowed('*', 'https://any.where')).get('access-control-allow-origin')).toBe('https://any.where');
    });

    it('echoes the origin with credentials, never *', async () => {
      const headers = await allowed([APP], APP, true);
      expect(headers.get('access-control-allow-origin')).toBe(APP);
      expect(headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('refuses any origin together with credentials: every site could read answers sent with cookies', () => {
      expect(() => mionCors({origin: '*', credentials: true})).toThrow(
        'mionCors: `credentials` needs the allowed origins listed'
      );
    });

    it('refuses an origin option of the wrong kind', () => {
      expect(() => mionCors({origin: 42 as unknown as string})).toThrow('mionCors: `origin` must be');
    });
  });
});
