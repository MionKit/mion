/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, getRouteExecutable, resetRouter} from '../src/router.ts';
import {registerBatches} from '../src/batches.ts';
import {MION_BATCH_PATH, MION_ROUTES, StatusCodes} from '@mionjs/core';
import {dispatchRoute} from '../src/dispatch.ts';
import {createCallContext} from '../src/callContext.ts';
import type {CallContext} from '../src/types/context.ts';
import {headersFromRecord} from '../src/lib/headers.ts';

const mion = createMionRouter();

const dispatch = (path: string, body: Record<string, any[]>, method?: string) =>
  dispatchRoute(path, JSON.stringify(body), headersFromRecord({}), headersFromRecord({}), {}, {}, undefined, undefined, method);

describe('request.method', () => {
  const routes = {
    readMethod: mion.query((ctx: CallContext): string => ctx.request.method),
  };

  beforeEach(() => {
    resetRouter();
    mion.initRoutes(routes);
  });

  it('is POST when the caller names none', async () => {
    expect((await dispatch('/readMethod', {})).body.readMethod).toBe('POST');
    expect(createCallContext('/readMethod', undefined, {}, headersFromRecord({}), headersFromRecord({})).request.method).toBe(
      'POST'
    );
  });

  it('is the method the caller passes', async () => {
    expect((await dispatch('/readMethod', {}, 'GET')).body.readMethod).toBe('GET');
  });
});

describe('httpMethods', () => {
  let ran: string[] = [];
  const routes = {
    always: mion.middleware(
      (ctx: CallContext): void => {
        ran.push(`always:${ctx.response.statusCode}`);
      },
      {alwaysRun: true}
    ),
    read: mion.route((): string => {
      ran.push('read');
      return 'read';
    }),
    find: mion.query((): string => {
      ran.push('find');
      return 'find';
    }),
    save: mion.mutation((): string => {
      ran.push('save');
      return 'save';
    }),
    getOnly: mion.query((): string => 'get', {httpMethods: ['GET']}),
    withQuery: mion.query((): string => 'query', {httpMethods: ['QUERY', 'POST']}),
  };

  beforeEach(() => {
    resetRouter();
    ran = [];
    mion.initRoutes(routes);
  });

  it('defaults a route and a query to GET and POST, a mutation to POST', async () => {
    for (const path of ['/read', '/find']) {
      for (const method of ['GET', 'POST']) expect((await dispatch(path, {}, method)).statusCode).toBe(StatusCodes.OK);
    }
    expect((await dispatch('/save', {}, 'POST')).statusCode).toBe(StatusCodes.OK);
    expect(ran.filter((step) => !step.startsWith('always'))).toEqual(['read', 'read', 'find', 'find', 'save']);
  });

  it('refuses a mutation over GET with a 405 and an Allow header, and still runs the alwaysRun members', async () => {
    const response = await dispatch('/save', {}, 'GET');
    expect(response.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('x-rpc-error')).toBe('method-not-allowed');
    expect(response.body[MION_ROUTES.thrownErrors]?.[MION_ROUTES.platformError]).toMatchObject({
      type: 'method-not-allowed',
      errorData: {allowed: ['POST']},
    });
    expect(ran).toEqual(['always:405']);
  });

  it('refuses OPTIONS on a chain without the CORS middleware, and any method it does not know', async () => {
    for (const method of ['OPTIONS', 'PUT', 'DELETE', 'HEAD', 'get', 'constructor', '__proto__']) {
      const response = await dispatch('/read', {}, method);
      expect(response.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
      expect(response.headers.get('allow')).toBe('GET, POST');
    }
    expect(ran.every((step) => step === 'always:405')).toBe(true);
  });

  it('accepts only the methods a route names', async () => {
    expect((await dispatch('/getOnly', {}, 'GET')).statusCode).toBe(StatusCodes.OK);
    expect((await dispatch('/getOnly', {}, 'POST')).statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
    expect((await dispatch('/withQuery', {}, 'QUERY')).statusCode).toBe(StatusCodes.OK);
    expect((await dispatch('/withQuery', {}, 'GET')).headers.get('allow')).toBe('POST, QUERY');
  });

  it('answers 404 on an unknown path whatever the method', async () => {
    for (const method of ['GET', 'OPTIONS', 'PUT', 'constructor'])
      expect((await dispatch('/nope', {}, method)).statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  it('publishes the resolved methods in the metadata', () => {
    expect(getRouteExecutable('read')?.options.httpMethods).toEqual(['GET', 'POST']);
    expect(getRouteExecutable('save')?.options.httpMethods).toEqual(['POST']);
    expect(getRouteExecutable('getOnly')?.options.httpMethods).toEqual(['GET']);
  });

  it('refuses an empty or unknown list when the routes register', () => {
    resetRouter();
    const empty = mion.query((): string => '', {httpMethods: []});
    expect(() => mion.initRoutes({empty})).toThrow(`Route 'empty': httpMethods must be a non-empty list`);
    resetRouter();
    const unknown = mion.query((): string => '', {httpMethods: ['PUT' as 'GET']});
    expect(() => mion.initRoutes({unknown})).toThrow(`Route 'unknown': httpMethods must be a non-empty list`);
  });
});

describe('httpMethods on a batch', () => {
  beforeEach(() => {
    resetRouter();
    mion.initRoutes({find: mion.query((): string => 'find')});
    registerBatches({one: {routes: ['find']}});
  });

  it('accepts only POST', async () => {
    const send = (method: string) =>
      dispatchRoute(MION_BATCH_PATH, '{}', headersFromRecord({}), headersFromRecord({}), {}, {}, undefined, 'id=one', method);
    expect((await send('POST')).statusCode).toBe(StatusCodes.OK);
    const refused = await send('GET');
    expect(refused.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
    expect(refused.headers.get('allow')).toBe('POST');
  });
});
