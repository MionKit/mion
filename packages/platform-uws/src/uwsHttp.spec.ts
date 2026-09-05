/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import {setUwsHttpOpts, resetUwsHttpOpts, startUwsServer, type UwsServer} from './uwsHttp.ts';
import type {CallContext, Route} from '@mionjs/router';
import {StatusCodes, type PublicRpcError} from '@mionjs/core';

describe('uws http router', () => {
  type SimpleUser = {name: string; surname: string};
  type DataPoint = {date: Date};
  type MySharedData = ReturnType<typeof getSharedData>;
  type Context = CallContext<MySharedData>;

  const myApp = {
    db: {
      changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
    },
  };
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});

  const changeUserNameHandler = (context: Context, user: SimpleUser): SimpleUser => {
    return myApp.db.changeUserName(user);
  };
  const changeUserName: Route = mion.route(changeUserNameHandler);

  const getDateHandler = (context: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
  };
  const getDate: Route = mion.route(getDateHandler);

  const updateHeadersHandler = (context: Context): void => {
    context.response.headers.set('x-something', 'true');
    context.response.headers.set('server', 'my-server');
  };

  const slowDateHandler = async (context: Context): Promise<DataPoint> => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {date: new Date('2022-04-22T00:17:00.000Z')};
  };

  // The same routes with a `direct` return (each member writes its own JSON string: the stringifyJson framing); the
  // default `mutate` return hands the platform a value to stringify (the json framing).
  const directRoutes = {
    changeUserName: mion.route(changeUserNameHandler, {serializer: {return: 'direct'}}),
    getDate: mion.route(getDateHandler, {serializer: {return: 'direct'}}),
    updateHeaders: mion.route(updateHeadersHandler, {serializer: {return: 'direct'}}),
    slowDate: mion.route(slowDateHandler, {serializer: {return: 'direct'}}),
  };

  // Shared server for all tests
  let server: UwsServer;
  const port = 8091;

  beforeAll(async () => {
    resetUwsHttpOpts();
    setUwsHttpOpts({port});
    server = await startUwsServer();
  });

  afterAll(() => {
    if (server) server.close();
  });

  describe('with a direct return (the stringifyJson framing)', () => {
    beforeAll(async () => {
      resetRouter();
      mion.initRoutes(directRoutes);
    });

    it('get an ok response from a route', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
      const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
        method: 'POST',
        body: JSON.stringify(requestData),
      });
      const reply = await response.json();
      const headers = Object.fromEntries(response.headers.entries());

      expect(reply).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['content-length']).toEqual('47');
      expect(headers['server']).toEqual('@mionjs');
    });

    it('get an error when sending invalid parameters', async () => {
      const requestData = {getDate: ['NOT A DATE POINT']};
      const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
        method: 'POST',
        body: JSON.stringify(requestData),
      });
      const reply = await response.json();
      const headers = Object.fromEntries(response.headers.entries());

      const expectedError: PublicRpcError<'serialization-error'> = {
        'mion@isΣrrθr': true,
        publicMessage: `Invalid params 'getDate', can not deserialize. Parameters might be of the wrong type.`,
        type: 'serialization-error',
        errorData: {deserializeError: expect.any(String)},
        statusCode: StatusCodes.UNEXPECTED_ERROR,
      };
      expect(reply).toEqual({'@thrownErrors': {getDate: expectedError}});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['server']).toEqual('@mionjs');
    });

    it('set response headers from route response', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/updateHeaders`, {
        method: 'POST',
        body: '{}',
      });
      const reply = await response.json();
      const headers = Object.fromEntries(response.headers.entries());

      expect(reply).toEqual({});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['server']).toEqual('my-server');
      expect(headers['x-something']).toEqual('true');
    });

    it('get an error when body size is too large, get default headers', async () => {
      const smallPort = port + 100;
      const httpOpts = {
        port: smallPort,
        maxBodySize: 1,
        defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
      };
      resetUwsHttpOpts();
      resetRouter();
      setUwsHttpOpts(httpOpts);
      mion.initRoutes(directRoutes);
      const smallServer = await startUwsServer({port: smallPort});

      const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
      const response = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {
        method: 'POST',
        body: JSON.stringify(requestData),
      });
      const headers = Object.fromEntries(response.headers.entries());
      const reply = await response.json();

      const expectedError: PublicRpcError<'request-payload-too-large'> = {
        'mion@isΣrrθr': true,
        publicMessage: `Payload Too Large`,
        type: 'request-payload-too-large',
        statusCode: StatusCodes.PAYLOAD_TOO_LARGE,
      };
      expect(response.status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
      expect(headers['x-rpc-error']).toBe('request-payload-too-large');
      expect(reply).toEqual({'@thrownErrors': {'mion@platformError': expectedError}});
      expect(headers['x-app-name']).toEqual('MyApp');
      expect(headers['x-instance-id']).toEqual('3089');
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['content-length']).toEqual('152');
      expect(headers['server']).toEqual('@mionjs');

      smallServer.close();

      // Restore router + http state for the shared server
      resetUwsHttpOpts();
      setUwsHttpOpts({port});
      resetRouter();
      mion.initRoutes(directRoutes);
    });

    it('survives a client aborting mid-request and keeps serving', async () => {
      // The abort lands while slowDate is still awaiting, so the reply path runs on an aborted
      // response — without the onAborted guard uWS would crash the process here.
      const aborter = new AbortController();
      const doomed = fetch(`http://127.0.0.1:${port}/api/slowDate`, {
        method: 'POST',
        body: '{}',
        signal: aborter.signal,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      aborter.abort();
      await expect(doomed).rejects.toThrow();

      // give the aborted dispatch time to finish its reply-on-aborted path
      await new Promise((resolve) => setTimeout(resolve, 150));
      const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {method: 'POST', body: '{}'});
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
    });

    it('round-trips bodies on both sides of the single-read boundary (copy vs zero-copy path)', async () => {
      // Bodies <= 512 KiB may arrive in one socket read (copied); bigger ones are multi-read and
      // ride collectBody's ownership-transferred buffer with no copy. Cover both, plus the
      // detachment tripwire staying silent, with a dedicated server whose cap allows them.
      const bigPort = port + 101;
      resetUwsHttpOpts();
      resetRouter();
      setUwsHttpOpts({port: bigPort, maxBodySize: 4_000_000});
      const countTags: Route = mion.route((context: Context, tags: string[]): number => tags.length);
      mion.initRoutes({countTags});
      const bigServer = await startUwsServer({port: bigPort});

      const post = async (tagCount: number) => {
        const body = JSON.stringify({countTags: [Array.from({length: tagCount}, (_, i) => `tag-number-${i}-padding-padding`)]});
        const response = await fetch(`http://127.0.0.1:${bigPort}/api/countTags`, {method: 'POST', body});
        return {size: Buffer.byteLength(body), reply: await response.json()};
      };

      const small = await post(3000); // well under 512 KiB -> copy path
      expect(small.size).toBeLessThan(524288);
      expect(small.reply).toEqual({countTags: 3000});

      const big = await post(40000); // > 1 MiB -> multi-read, zero-copy path
      expect(big.size).toBeGreaterThan(1048576);
      expect(big.reply).toEqual({countTags: 40000});

      bigServer.close();
      resetUwsHttpOpts();
      setUwsHttpOpts({port});
      resetRouter();
      mion.initRoutes(directRoutes);
    });

    it('accepts a base64url GET query body', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
      const encoded = Buffer.from(JSON.stringify(requestData), 'utf8').toString('base64url');
      const response = await fetch(`http://127.0.0.1:${port}/api/getDate?data=${encoded}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
    });
  });

  describe('with the default mutate return (the json framing)', () => {
    beforeAll(async () => {
      resetUwsHttpOpts();
      setUwsHttpOpts({port});
      resetRouter();
      const jsonRouter = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
      jsonRouter.initRoutes({changeUserName, getDate});
    });

    it('get an ok response from a route with Date objects (body type O)', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
      const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
        method: 'POST',
        body: JSON.stringify(requestData),
      });
      const reply = await response.json();
      const headers = Object.fromEntries(response.headers.entries());

      expect(reply).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['content-length']).toEqual('47');
      expect(headers['server']).toEqual('@mionjs');
    });

    it('get an ok response from a route with complex objects (body type O)', async () => {
      const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
      const response = await fetch(`http://127.0.0.1:${port}/api/changeUserName`, {
        method: 'POST',
        body: JSON.stringify(requestData),
      });
      const reply = await response.json();
      const headers = Object.fromEntries(response.headers.entries());

      expect(reply).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['server']).toEqual('@mionjs');
    });
  });

  describe('middleware mode is not supported on this platform', () => {
    it('setUwsHttpOpts refuses asMiddleware with a clear error', () => {
      expect(() => setUwsHttpOpts({asMiddleware: true} as any)).toThrow(/does not support middleware mode/);
    });
  });
});
