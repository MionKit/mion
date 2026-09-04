/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {initRouter, registerRoutes, route, resetRouter, getRouteExecutionChain} from '@mionjs/router';
import {setNodeHttpOpts, resetNodeHttpOpts, startNodeServer} from './mionHttp.ts';
import type {CallContext, Route} from '@mionjs/router';
import {StatusCodes, type PublicRpcError, serializeBinaryBody, deserializeBinaryBody, getBufferPoolStats} from '@mionjs/core';
import type {Server} from 'http';

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

  const changeUserName: Route = route((context: Context, user: SimpleUser): SimpleUser => {
    return myApp.db.changeUserName(user);
  });

  const getDate: Route = route((context: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
  });

  const updateHeaders: Route = route((context: Context): void => {
    context.response.headers.set('x-something', 'true');
    context.response.headers.set('server', 'my-server');
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

  describe('with serializer=stringifyJson (default)', () => {
    beforeAll(async () => {
      resetRouter();
      await initRouter({contextDataFactory: getSharedData, basePath: 'api/'});
      await registerRoutes({changeUserName, getDate, updateHeaders});
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
      const routerOpts = {
        contextDataFactory: getSharedData,
        prefix: 'api/',
      };
      const httpOpts = {
        port: smallPort,
        maxBodySize: 1,
        defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
      };
      resetNodeHttpOpts();
      resetRouter();
      setNodeHttpOpts(httpOpts);
      void initRouter(routerOpts);
      void registerRoutes({changeUserName, getDate, updateHeaders});
      const smallServer = await startNodeServer({port: smallPort});
      expect(smallServer.listening).toBe(true);

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

      await closeServer(smallServer);

      // Restore router state for the shared server
      resetRouter();
      await initRouter({contextDataFactory: getSharedData, basePath: 'api/'});
      await registerRoutes({changeUserName, getDate, updateHeaders});
    });
  });

  describe('with serializer=json', () => {
    beforeAll(async () => {
      // Reset HTTP options to clear maxBodySize from previous test
      resetNodeHttpOpts();
      setNodeHttpOpts({port});
      resetRouter();
      await initRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'json'});
      await registerRoutes({changeUserName, getDate});
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

  describe('with serialize=binary', () => {
    beforeAll(async () => {
      resetNodeHttpOpts();
      setNodeHttpOpts({port});
      resetRouter();
      await initRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'binary'});
      await registerRoutes({changeUserName, getDate});
    });

    // End-to-end proof of the buffer-pool release lifetime. The response buffer is handed to
    // node as a VIEW and only returned to the pool on 'finish'/'close', once the socket is done
    // with it. If that release were mistimed, a buffer would be reused while still in flight and
    // payloads would corrupt under load — so drive real concurrent requests and check both that
    // reuse actually happens and that every response is still byte-correct.
    it('reuses pooled binary buffers across requests without corrupting responses', async () => {
      const executionChain = getRouteExecutionChain('/api/getDate')!.methods;
      const date = new Date('2022-04-22T00:17:00.000Z');
      const requestBuffer = serializeBinaryBody(
        '/api/getDate',
        executionChain,
        {getDate: [{date}]},
        false
      ).serializer.getBuffer();

      const call = async () => {
        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
          method: 'POST',
          headers: {'content-type': 'application/octet-stream'},
          body: Buffer.from(requestBuffer),
        });
        const {body} = deserializeBinaryBody('/api/getDate', await response.arrayBuffer(), true);
        return body.getDate.date;
      };

      // warm the route past the pool threshold, then hammer it concurrently
      for (let i = 0; i < 10; i++) expect(await call()).toEqual(date);
      const concurrent = await Promise.all(Array.from({length: 25}, () => call()));
      concurrent.forEach((got) => expect(got).toEqual(date));

      // and the pool was genuinely in play, not silently disabled
      expect(getBufferPoolStats().hits).toBeGreaterThan(0);
    });

    it('should send binary request and receive binary response with Date objects', async () => {
      const executionChain = getRouteExecutionChain('/api/getDate')!.methods;

      // Serialize request body to binary
      const requestBody = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
      const requestBuffer = serializeBinaryBody('/api/getDate', executionChain, requestBody, false).serializer.getBuffer();

      const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
        method: 'POST',
        headers: {'content-type': 'application/octet-stream'},
        body: Buffer.from(requestBuffer),
      });
      const headers = Object.fromEntries(response.headers.entries());
      const responseBuffer = await response.arrayBuffer();

      // Deserialize binary response - uses routesCache to look up method JIT functions
      const {body: responseBody} = deserializeBinaryBody('/api/getDate', responseBuffer, true);

      expect(responseBody.getDate).toBeDefined();
      expect(responseBody.getDate.date).toEqual(new Date('2022-04-22T00:17:00.000Z'));
      expect(headers['content-type']).toEqual('application/octet-stream');
      expect(headers['server']).toEqual('@mionjs');
    });

    it('should send binary request and receive binary response with complex objects', async () => {
      const executionChain = getRouteExecutionChain('/api/changeUserName')!.methods;

      // Serialize request body to binary
      const requestBody = {changeUserName: [{name: 'John', surname: 'Doe'}]};
      const requestBuffer = serializeBinaryBody('/api/changeUserName', executionChain, requestBody, false).serializer.getBuffer();

      const response = await fetch(`http://127.0.0.1:${port}/api/changeUserName`, {
        method: 'POST',
        headers: {'content-type': 'application/octet-stream'},
        body: Buffer.from(requestBuffer),
      });
      const headers = Object.fromEntries(response.headers.entries());
      const responseBuffer = await response.arrayBuffer();

      // Deserialize binary response - uses routesCache to look up method JIT functions
      const {body: responseBody} = deserializeBinaryBody('/api/changeUserName', responseBuffer, true);

      expect(responseBody.changeUserName).toBeDefined();
      expect(responseBody.changeUserName.name).toEqual('NewName');
      expect(responseBody.changeUserName.surname).toEqual('Doe');
      expect(headers['content-type']).toEqual('application/octet-stream');
      expect(headers['server']).toEqual('@mionjs');
    });

    it('should handle optional parameters in binary mode', async () => {
      const executionChain = getRouteExecutionChain('/api/getDate')!.methods;

      // Serialize request body with no params (optional dataPoint)
      const requestBody = {getDate: [undefined]};
      const requestBuffer = serializeBinaryBody('/api/getDate', executionChain, requestBody, false).serializer.getBuffer();

      const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
        method: 'POST',
        headers: {'content-type': 'application/octet-stream'},
        body: Buffer.from(requestBuffer),
      });
      const headers = Object.fromEntries(response.headers.entries());
      const responseBuffer = await response.arrayBuffer();

      // Deserialize binary response - uses routesCache to look up method JIT functions
      const {body: responseBody} = deserializeBinaryBody('/api/getDate', responseBuffer, true);

      expect(responseBody.getDate).toBeDefined();
      expect(responseBody.getDate.date).toEqual(new Date('2022-04-22T00:17:00.000Z'));
      expect(headers['content-type']).toEqual('application/octet-stream');
    });
  });
});
