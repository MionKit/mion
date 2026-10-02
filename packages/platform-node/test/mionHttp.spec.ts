/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import {setNodeHttpOpts, resetNodeHttpOpts, startNodeServer} from '../src/mionHttp.ts';
import type {CallContext, Route} from '@mionjs/router';
import {HeadersSubset, MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';
import type {Server} from 'http';
import {createConnection} from 'net';

describe('node http router', () => {
  type SimpleUser = {name: string; surname: string};
  type DataPoint = {date: Date};
  type MySharedData = ReturnType<typeof getSharedData>;
  type Context = CallContext<MySharedData>;

  const myApp = {
    cloudLogs: {
      log: () => null,
      error: () => null,
    },
    db: {
      changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
    },
  };
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});

  const changeUserName: Route = mion.route((context: Context, user: SimpleUser): SimpleUser => {
    return myApp.db.changeUserName(user);
  });

  const getDate: Route = mion.route((context: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
  });

  const updateHeaders: Route = mion.route((context: Context): void => {
    context.response.headers.set('x-something', 'true');
    context.response.headers.set('server', 'my-server');
  });

  const badHeader: Route = mion.route((context: Context): HeadersSubset<'x-tag'> => {
    return new HeadersSubset({'x-tag': 'one\r\ntwo'});
  });

  const closeServer = (s: Server) => {
    return new Promise<void>((resolve, reject) => {
      s.close((err) => {
        if (err) reject();
        else resolve();
      });
    });
  };

  // Shared server for all tests
  let server: Server;
  const port = 8075;

  beforeAll(async () => {
    resetNodeHttpOpts();
    setNodeHttpOpts({port});
    server = await startNodeServer();
  });

  afterAll(async () => {
    if (server) await closeServer(server);
  });

  describe('with the default encoder', () => {
    beforeAll(async () => {
      resetRouter();
      mion.initRoutes({changeUserName, getDate, updateHeaders, badHeader});
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

    it('answers a HEAD request with the headers only, and keeps serving on the same connection', async () => {
      const head = 'HEAD /api/getDate HTTP/1.1\r\nHost: x\r\n\r\n';
      const post = 'POST /api/getDate HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\n\r\n{}';
      const dateBody = '{"getDate":{"date":"2022-04-22T00:17:00.000Z"}}';
      const wire = await new Promise<string>((resolve, reject) => {
        let data = '';
        const socket = createConnection({host: '127.0.0.1', port}, () => socket.write(head + post));
        socket.setEncoding('latin1');
        socket.on('data', (chunk) => {
          data += chunk;
          if (data.endsWith(dateBody)) {
            socket.destroy();
            resolve(data);
          }
        });
        socket.on('error', reject);
      });
      const split = wire.indexOf('\r\n\r\n');
      const headAnswer = wire.slice(0, split);
      const postAnswer = wire.slice(split + 4);
      expect(headAnswer).toMatch(/^HTTP\/1\.1 200/);
      expect(headAnswer).toMatch(/content-length: 47/i);
      // a leaked HEAD body would sit here, before the POST answer
      expect(postAnswer).toMatch(/^HTTP\/1\.1 200/);
      expect(postAnswer.endsWith(dateBody)).toBe(true);
    });

    it('fails the call instead of sending a returned header holding a line break', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/badHeader`, {method: 'POST', body: '{}'});
      const reply = (await response.json()) as Record<string, Record<string, PublicRpcError<string>>>;
      expect(response.status).toEqual(StatusCodes.UNEXPECTED_ERROR);
      expect(response.headers.get('x-tag')).toBeNull();
      expect(reply[MION_ROUTES.thrownErrors].badHeader.type).toEqual('unknown-error');
    });

    it('get an error when sending invalid parameters', async () => {
      const requestData = {getDate: ['NOT A DATE POINT']};
      const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
        method: 'POST',
        body: JSON.stringify(requestData),
      });
      const reply = await response.json();
      const headers = Object.fromEntries(response.headers.entries());

      const expectedError: PublicRpcError<'validation-error'> = {
        'mion@isΣrrθr': true,
        publicMessage: `Invalid params in 'getDate', validation failed.`,
        type: 'validation-error',
        errorData: {typeErrors: [{path: [0], expected: 'objectLiteral'}]},
        statusCode: StatusCodes.UNEXPECTED_ERROR,
      };
      expect(reply).toEqual({'@thrownErrors': {getDate: expectedError}});
      expect(headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(headers['content-length']).toEqual(expect.any(String));
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
      expect(headers['content-length']).toEqual('2');
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
      resetNodeHttpOpts();
      resetRouter();
      setNodeHttpOpts(httpOpts);
      mion.initRoutes({changeUserName, getDate, updateHeaders});
      const smallServer = await startNodeServer({port: smallPort});
      expect(smallServer.listening).toBe(true);

      // `changeUserName` takes a plain `SimpleUser` (unbounded strings), so it is the adapter's number
      // that applies; `getDate` derives its own limit from its types and would ignore a 1-byte adapter
      const requestData = {changeUserName: [{name: 'a', surname: 'b'}]};
      const response = await fetch(`http://127.0.0.1:${smallPort}/api/changeUserName`, {
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

      await closeServer(smallServer);

      // Restore router state for the shared server
      resetRouter();
      mion.initRoutes({changeUserName, getDate, updateHeaders});
    });
  });

  describe('with a router created in the block (default encoder)', () => {
    beforeAll(async () => {
      // Reset HTTP options to clear maxBodySize from previous test
      resetNodeHttpOpts();
      setNodeHttpOpts({port});
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

  // The router's globals reach the wire through the adapter's own default headers, with no middleware writing them.
  describe('with router global response headers', () => {
    const globalsPort = port + 200;
    let globalsServer: any;

    beforeAll(async () => {
      resetNodeHttpOpts();
      resetRouter();
      setNodeHttpOpts({port: globalsPort, defaultResponseHeaders: {'x-app-name': 'TheAdapter'}});
      const globalsRouter = createMionRouter({
        contextDataFactory: getSharedData,
        basePath: 'api/',
        globalResponseHeaders: {'x-team': 'mion', 'x-app-name': 'TheRouter'},
      });
      globalsRouter.initRoutes({changeUserName}, 'abc123');
      globalsServer = await startNodeServer({port: globalsPort});
    });

    afterAll(async () => {
      if (globalsServer) await closeServer(globalsServer);
    });

    it('rides every response, and the adapter still wins its own name', async () => {
      const response = await fetch(`http://127.0.0.1:${globalsPort}/api/changeUserName`, {
        method: 'POST',
        body: JSON.stringify({changeUserName: [{name: 'John', surname: 'Doe'}]}),
      });
      const headers = Object.fromEntries(response.headers.entries());
      expect(headers['x-team']).toEqual('mion');
      expect(headers['x-build-version']).toEqual('abc123');
      expect(headers['x-app-name']).toEqual('TheAdapter');
    });

    it('rides a not-found response too', async () => {
      const response = await fetch(`http://127.0.0.1:${globalsPort}/api/nope`, {method: 'POST', body: '{}'});
      const headers = Object.fromEntries(response.headers.entries());
      expect(response.status).toEqual(404);
      expect(headers['x-team']).toEqual('mion');
      expect(headers['x-build-version']).toEqual('abc123');
    });
  });
});
