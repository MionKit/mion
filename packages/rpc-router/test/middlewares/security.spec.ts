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
import {getDefaultHeaders, headersFromRecord} from '../../src/lib/headers.ts';
import {toHttpMethod} from '../../src/lib/httpMethod.ts';
import {mionSecurity, mionFetchMetadata} from '../../middlewares.ts';
import type {CallContext, MionHeaders, MionResponse} from '../../src/types/context.ts';
import type {MionSecurityOptions, Routes} from '../../src/types/general.ts';
import {HeadersSubset, MION_BATCH_PATH, StatusCodes} from '@mionjs/core';

const mion = createMionRouter();
const APP = 'https://app.example.com';
const EVIL = 'https://evil.example';
const JSON_TYPE = {'content-type': 'application/json'};

let ran: string[] = [];

const auth = mion.headersMiddleware((ctx: CallContext, headers: HeadersSubset<'authorization', 'x-debug-node'>): void => {
  ran.push('auth');
});
const listUsers = mion.query((): HeadersSubset<'x-total', 'x-node'> => {
  ran.push('listUsers');
  return new HeadersSubset({'x-total': '2', 'x-node': 'n1'});
});
const saveUser = mion.mutation((ctx: CallContext, name: string): string => {
  ran.push('saveUser');
  return name;
});
const wipe = mion.mutation((): string => {
  ran.push('wipe');
  return 'gone';
});
const ping = mion.route((): string => {
  ran.push('ping');
  return 'pong';
});
const trace = mion.route((): HeadersSubset<'x-trace'> => new HeadersSubset({'x-trace': 't1'}));
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
  return dispatchRoute(
    path.split('?')[0],
    raw,
    reqHeaders,
    headersFromRecord({}),
    {},
    {},
    undefined,
    query,
    toHttpMethod(method)
  );
}
/** A JSON POST, what the mion client sends */
const post = (path: string, body: Record<string, unknown[]>, headers: Record<string, string> = {}) =>
  send(path, 'POST', {...JSON_TYPE, ...headers}, body);
const preflight = (path: string, origin = APP) => send(path, 'OPTIONS', {origin, 'access-control-request-method': 'POST'});
const list = (value: string) => value.split(', ').sort();
/** A returned error is declared, so it sits at the middleware's own key, as the `[index, value]` union envelope */
const refusal = (response: MionResponse) => {
  const slot = response.body.mionSecurity;
  return Array.isArray(slot) ? slot[1] : slot;
};

function init(options: MionSecurityOptions, routes: Routes = {auth, listUsers, saveUser, wipe, ping, trace, failing}) {
  resetRouter();
  mion.initRoutes({mionSecurity: mionSecurity(options), mionFetchMetadata, ...routes} satisfies Routes);
}

describe('mionSecurity', () => {
  beforeEach(() => {
    ran = [];
  });

  describe('CORS', () => {
    beforeEach(() =>
      init({
        origins: [APP],
        cors: {
          maxAge: 600,
          allowHeaders: ['X-Raw-In'],
          exposeHeaders: ['x-raw-out', 'x-node'],
          excludeHeaders: ['X-Debug-Node', 'x-node', 'x-trace'],
        },
      })
    );

    it('answers a preflight 200 with no error, before any other member runs', async () => {
      const response = await preflight('/saveUser');
      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(response.hasErrors).toBe(false);
      expect(response.stopped).toBe(true);
      expect(response.body).toEqual({});
      expect(ran).toEqual([]);
      const headers = response.headers;
      expect(headers.get('access-control-allow-origin')).toBe(APP);
      expect(headers.get('access-control-allow-methods')).toBe('POST');
      expect(headers.get('access-control-max-age')).toBe('600');
      expect(headers.get('vary')).toBe('Origin');
      expect(headers.get('access-control-allow-credentials')).toBeFalsy();
    });

    it('allows the request headers the chain declares plus the hand-written ones, never an excluded one', async () => {
      const headers = (await preflight('/listUsers')).headers;
      expect(list(headers.get('access-control-allow-headers') as string)).toEqual(['authorization', 'content-type', 'x-raw-in']);
      expect(headers.get('access-control-allow-methods')).toBe('GET, POST');
    });

    it('exposes the response headers the route declares plus mion and hand-written ones, never an excluded one', async () => {
      const response = await post('/listUsers', {listUsers: []}, {origin: APP});
      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(ran).toEqual(['auth', 'listUsers']);
      expect(response.headers.get('access-control-allow-origin')).toBe(APP);
      // x-node is hand-written AND excluded: the exclusion wins
      expect(list(response.headers.get('access-control-expose-headers') as string)).toEqual([
        'x-build-version',
        'x-raw-out',
        'x-rpc-error',
        'x-total',
      ]);
      expect(response.headers.get('x-node')).toBe('n1');
      const traced = await post('/trace', {trace: []}, {origin: APP});
      expect(traced.headers.get('access-control-expose-headers')).not.toContain('x-trace');
    });

    it('adds its headers to an error answer too, so the client can read the error', async () => {
      const response = await post('/failing', {failing: []}, {origin: APP});
      expect(response.hasErrors).toBe(true);
      expect(response.headers.get('access-control-allow-origin')).toBe(APP);
      expect(response.headers.get('access-control-expose-headers')).toContain('x-rpc-error');
    });

    it('adds its headers to its own refusals too', async () => {
      const refused = await send('/saveUser', 'GET', {origin: APP});
      expect(refused.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
      expect(refused.headers.get('access-control-allow-origin')).toBe(APP);
      expect(refused.headers.get('access-control-expose-headers')).toContain('x-rpc-error');
      const form = await send('/saveUser', 'POST', {origin: APP, 'content-type': 'text/plain'}, {saveUser: ['a']});
      expect(form.statusCode).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
      expect(form.headers.get('access-control-allow-origin')).toBe(APP);
    });

    it('ends an OPTIONS that is not a preflight with only the origin headers', async () => {
      const response = await send('/saveUser', 'OPTIONS', {origin: APP}, {saveUser: ['a']});
      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(ran).toEqual([]);
      expect(response.headers.get('access-control-allow-origin')).toBe(APP);
      expect(response.headers.get('access-control-allow-methods')).toBeFalsy();
    });

    it('sends no CORS headers to an origin it does not trust; a preflight from it still ends, with no headers', async () => {
      const response = await send('/listUsers', 'GET', {origin: EVIL});
      expect(ran).toContain('listUsers');
      expect(response.headers.get('access-control-allow-origin')).toBeFalsy();
      expect(response.headers.get('vary')).toBe('Origin');
      const refused = await preflight('/saveUser', EVIL);
      expect(refused.statusCode).toBe(StatusCodes.OK);
      expect(refused.headers.get('access-control-allow-origin')).toBeFalsy();
      expect(refused.headers.get('access-control-allow-methods')).toBeFalsy();
    });

    it('derives a batch chain from all its members', async () => {
      registerBatches({both: {routes: ['listUsers', 'saveUser']}});
      const headers = (await preflight(`${MION_BATCH_PATH}?id=both`)).headers;
      expect(headers.get('access-control-allow-methods')).toBe('POST');
      expect(list(headers.get('access-control-allow-headers') as string)).toEqual(['authorization', 'content-type', 'x-raw-in']);
      const response = await post(`${MION_BATCH_PATH}?id=both`, {listUsers: [], saveUser: ['b']}, {origin: APP});
      expect(response.headers.get('access-control-expose-headers')).toContain('x-total');
    });

    it('takes a list, any, or a lookup, and never trusts the null origin', async () => {
      const allowed = async (origins: MionSecurityOptions['origins'], origin: string) => {
        init({origins, cors: {}});
        return (await post('/listUsers', {listUsers: []}, {origin})).headers.get('access-control-allow-origin');
      };
      expect(await allowed([APP], APP)).toBe(APP);
      expect(await allowed([APP], EVIL)).toBeFalsy();
      expect(await allowed(['https://a.example', APP], APP)).toBe(APP);
      expect(await allowed((ctx, origin) => origin.endsWith('.example.com'), APP)).toBe(APP);
      expect(await allowed(async (ctx, origin) => origin === APP, APP)).toBe(APP);
      expect(await allowed(async (ctx, origin) => origin === APP, EVIL)).toBeFalsy();
      expect(await allowed('*', 'https://any.where')).toBe('https://any.where');
      expect(await allowed('*', 'null')).toBeFalsy();
      expect(await allowed(() => true, 'null')).toBeFalsy();
    });

    it('asks a lookup with the call context, and only when its answer can change anything', async () => {
      const asked: string[] = [];
      const lookup = async (ctx: CallContext, origin: string) => {
        asked.push(`${ctx.path} ${origin}`);
        return origin === APP;
      };
      // without CORS, only a request from another site can need it
      init({origins: lookup});
      await post('/saveUser', {saveUser: ['a']}, {'sec-fetch-site': 'same-origin', origin: APP});
      await send('/listUsers', 'GET', {'sec-fetch-site': 'cross-site', origin: EVIL});
      await post('/saveUser', {saveUser: ['a']});
      await post('/saveUser', {saveUser: ['a']}, {'sec-fetch-site': 'cross-site', origin: 'null'});
      // a preflight ends anyway, and a request that already failed is refused by nothing
      await send('/saveUser', 'OPTIONS', {'sec-fetch-site': 'cross-site', origin: EVIL});
      const failedHeaders = headersFromRecord({'sec-fetch-site': 'cross-site', origin: EVIL, 'content-type': 'text/plain'});
      await dispatchRoute('/saveUser', '{not json', failedHeaders, headersFromRecord({}), {}, {});
      expect(asked).toEqual([]);
      ran = [];
      const refused = await post('/saveUser', {saveUser: ['a']}, {'sec-fetch-site': 'cross-site', origin: EVIL});
      expect(refusal(refused)?.type).toBe('cross-origin-request-refused');
      await post('/saveUser', {saveUser: ['a']}, {'sec-fetch-site': 'cross-site', origin: APP});
      // the refused call never reached the route, the trusted one did
      expect(ran.filter((step) => step === 'saveUser')).toEqual(['saveUser']);
      expect(asked).toEqual([`/saveUser ${EVIL}`, `/saveUser ${APP}`]);
      // with CORS, every request from an origin needs the answer
      init({origins: lookup, cors: {}});
      asked.length = 0;
      await send('/listUsers', 'GET', {origin: APP});
      expect(asked).toEqual([`/listUsers ${APP}`]);
    });

    it('echoes the origin with credentials, never *', async () => {
      init({origins: [APP], cors: {credentials: true}});
      const headers = (await post('/listUsers', {listUsers: []}, {origin: APP})).headers;
      expect(headers.get('access-control-allow-origin')).toBe(APP);
      expect(headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('refuses options that cannot work when it is created', () => {
      // every site could read answers sent with the user's cookies
      expect(() => mionSecurity({origins: '*', cors: {credentials: true}})).toThrow(
        '`cors.credentials` needs the allowed origins'
      );
      expect(() => mionSecurity({cors: {}})).toThrow('`cors` needs the `origins`');
    });
  });

  describe('CSRF: method by intent', () => {
    beforeEach(() => init({}));

    it('accepts GET, HEAD and POST on a query, and only POST on a mutation, a plain route and a batch', async () => {
      for (const method of ['GET', 'HEAD']) expect((await send('/listUsers', method)).statusCode).toBe(StatusCodes.OK);
      expect((await post('/listUsers', {listUsers: []})).statusCode).toBe(StatusCodes.OK);
      expect((await post('/saveUser', {saveUser: ['a']})).body.saveUser).toBe('a');
      expect((await post('/ping', {ping: []})).body.ping).toBe('pong');
      registerBatches({both: {routes: ['listUsers', 'saveUser']}});
      expect((await post(`${MION_BATCH_PATH}?id=both`, {listUsers: [], saveUser: ['b']})).statusCode).toBe(StatusCodes.OK);
      expect((await send(`${MION_BATCH_PATH}?id=both`, 'GET')).statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
    });

    it('refuses a mutation over GET (a link or an image on another site) with a 405 and an Allow header', async () => {
      for (const path of ['/saveUser', '/ping']) {
        const response = await send(path, 'GET');
        expect(response.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
        expect(response.headers.get('allow')).toBe('POST');
        expect(refusal(response)?.type).toBe('method-not-allowed');
      }
      expect(ran).toEqual([]);
    });

    it('refuses any method the intent does not name', async () => {
      for (const method of ['PUT', 'DELETE', 'get', 'OST', 'constructor']) {
        const response = await send('/listUsers', method);
        expect(response.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
        expect(response.headers.get('allow')).toBe('GET, HEAD, POST');
      }
      expect(ran).toEqual([]);
    });

    it('ends every OPTIONS without CORS too, so a preflight never runs a route', async () => {
      const response = await send('/saveUser', 'OPTIONS', {}, {saveUser: ['a']});
      expect(response.statusCode).toBe(StatusCodes.OK);
      expect(response.stopped).toBe(true);
      expect(ran).toEqual([]);
    });
  });

  describe('CSRF: cross-origin requests', () => {
    beforeEach(() => init({origins: [APP]}));

    const runs = async (headers: Record<string, string>) => {
      ran = [];
      const response = await post('/saveUser', {saveUser: ['a']}, headers);
      if (!ran.includes('saveUser'))
        expect(refusal(response)).toMatchObject({type: 'cross-origin-request-refused', statusCode: 403});
      return ran.includes('saveUser');
    };

    it('lets a same-origin request and one the user typed through, and refuses one another site sent', async () => {
      expect(await runs({'sec-fetch-site': 'same-origin', origin: APP})).toBe(true);
      expect(await runs({'sec-fetch-site': 'none'})).toBe(true);
      expect(await runs({'sec-fetch-site': 'cross-site', origin: EVIL})).toBe(false);
      expect(await runs({'sec-fetch-site': 'same-site', origin: 'https://other.example.com'})).toBe(false);
    });

    it('lets a trusted origin through from another site', async () => {
      expect(await runs({'sec-fetch-site': 'cross-site', origin: APP})).toBe(true);
      expect(await runs({'sec-fetch-site': 'cross-site', origin: 'null'})).toBe(false);
    });

    it('falls back to Origin against Host without Sec-Fetch-Site, and lets a caller with neither through', async () => {
      expect(await runs({origin: 'https://api.example.com', host: 'api.example.com'})).toBe(true);
      expect(await runs({origin: EVIL, host: 'api.example.com'})).toBe(false);
      expect(await runs({origin: 'null', host: 'api.example.com'})).toBe(false);
      expect(await runs({origin: 'not a url', host: 'api.example.com'})).toBe(false);
      expect(await runs({origin: APP, host: 'api.example.com'})).toBe(true);
      // a server, a script or curl: no browser, so no user's cookie to abuse
      expect(await runs({})).toBe(true);
    });

    it('never checks a GET or HEAD: it reads, and CORS keeps the answer from another site', async () => {
      const response = await send('/listUsers', 'GET', {'sec-fetch-site': 'cross-site', origin: EVIL});
      expect(response.statusCode).toBe(StatusCodes.OK);
    });
  });

  describe('CSRF: JSON bodies only', () => {
    beforeEach(() => init({}));

    it('refuses a body that is not JSON, or has no type, with a 415', async () => {
      const types = [
        'text/plain',
        'Text/Plain; charset=UTF-8',
        'application/x-www-form-urlencoded',
        'multipart/form-data; boundary=x',
        'text/json',
        'application/octet-stream',
        'application/jsonx',
      ];
      for (const type of [...types, undefined]) {
        const headers: Record<string, string> = type ? {'content-type': type} : {};
        const response = await send('/saveUser', 'POST', headers, type ? {saveUser: ['a']} : undefined);
        expect(response.statusCode).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
        expect(refusal(response)?.type).toBe('unsupported-media-type');
      }
      expect(ran).toEqual([]);
    });

    it('lets JSON through, whatever its case and parameters', async () => {
      for (const type of ['application/json', 'application/json; charset=utf-8', 'APPLICATION/JSON', ' application/json ;x=1'])
        expect((await send('/saveUser', 'POST', {'content-type': type}, {saveUser: ['a']})).statusCode).toBe(StatusCodes.OK);
    });
  });

  describe('switching checks off', () => {
    it('runs each check only when it is on, and none with csrf: false', async () => {
      const crossSite = {'sec-fetch-site': 'cross-site', origin: EVIL};
      init({csrf: {crossOrigin: false, methodByIntent: false}});
      expect((await send('/wipe', 'GET')).body.wipe).toBe('gone');
      expect((await post('/saveUser', {saveUser: ['a']}, crossSite)).statusCode).toBe(StatusCodes.OK);
      // the JSON check stays: mion reads no other body
      expect((await send('/saveUser', 'PUT', {'content-type': 'text/plain'}, {saveUser: ['a']})).statusCode).toBe(
        StatusCodes.UNSUPPORTED_MEDIA_TYPE
      );
      init({csrf: false});
      const form = {...crossSite, 'content-type': 'text/plain'};
      expect((await send('/saveUser', 'POST', form, {saveUser: ['a']})).statusCode).toBe(StatusCodes.OK);
      // OPTIONS still ends: it is a preflight, not a CSRF check
      expect((await send('/saveUser', 'OPTIONS')).stopped).toBe(true);
    });

    it('keeps a check on when its option is left undefined', async () => {
      init({csrf: {crossOrigin: undefined, methodByIntent: undefined}});
      const crossSite = {'sec-fetch-site': 'cross-site', origin: EVIL};
      expect((await post('/saveUser', {saveUser: ['a']}, crossSite)).statusCode).toBe(StatusCodes.FORBIDDEN);
      expect((await send('/saveUser', 'GET')).statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
      expect((await send('/saveUser', 'POST', {'content-type': 'text/plain'}, {saveUser: ['a']})).statusCode).toBe(
        StatusCodes.UNSUPPORTED_MEDIA_TYPE
      );
    });

    it('does not refuse a request that already failed', async () => {
      init({});
      const reqHeaders = headersFromRecord({'content-type': 'text/plain'});
      const failed = await dispatchRoute('/saveUser', '{not json', reqHeaders, headersFromRecord({}), {}, {});
      expect(failed.statusCode).toBe(StatusCodes.UNEXPECTED_ERROR);
      expect(refusal(failed)).toBeUndefined();
    });
  });

  describe('hardening headers', () => {
    const dispatchWith = (respHeaders: MionHeaders) =>
      dispatchRoute('/ping', JSON.stringify({ping: []}), headersFromRecord(JSON_TYPE), respHeaders, {}, {});

    it('sends nosniff and removes the default server name, on success and on a refusal', async () => {
      init({});
      const ok = await dispatchWith(getDefaultHeaders());
      expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
      expect(ok.headers.get('server')).toBeFalsy();
      const refused = await send('/wipe', 'GET');
      expect(refused.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
      expect(refused.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('keeps a server name the app set', async () => {
      init({});
      const response = await dispatchWith(headersFromRecord({server: 'my-api'}));
      expect(response.headers.get('server')).toBe('my-api');
    });
  });

  describe('placement', () => {
    it('covers only the group it sits in; an API without it runs a mutation over GET', async () => {
      resetRouter();
      mion.initRoutes({
        auth,
        open: {mionSecurity: mionSecurity({origins: [APP], cors: {}}), listUsers},
        closed: {wipe},
      } satisfies Routes);
      const inGroup = await post('/open/listUsers', {'open/listUsers': []}, {origin: APP});
      expect(inGroup.headers.get('access-control-allow-origin')).toBe(APP);
      expect((await send('/open/listUsers', 'PUT')).statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
      const outside = await send('/closed/wipe', 'GET', {origin: APP});
      expect(outside.headers.get('access-control-allow-origin')).toBeFalsy();
      expect(outside.headers.get('vary')).toBeFalsy();
      expect(outside.statusCode).toBe(StatusCodes.OK);
      expect(ran).toContain('wipe');
    });
  });
});
