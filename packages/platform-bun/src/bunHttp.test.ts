/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {createMionRouter} from '@mionjs/router';
import {setBunHttpOpts, resetBunHttpOpts, startBunServer} from './bunHttp.ts';
import {CallContext} from '@mionjs/router';
import {MION_ROUTES, PublicRpcError, StatusCodes} from '@mionjs/core';
import {Server} from 'bun';

// Increase timeout for tests that involve type reflection (can be slow when running in parallel)
setDefaultTimeout(30_000);

describe('bun router should', () => {
  resetBunHttpOpts();
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

  const changeUserName = mion.route((context: Context, user: SimpleUser): SimpleUser => {
    return myApp.db.changeUserName(user);
  }); // satisfies Route

  const getDate = mion.route((context: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
  }); // satisfies Route

  const updateHeaders = mion.route((context: Context): void => {
    context.response.headers.set('x-something', 'true');
    context.response.headers.set('server', 'my-server');
  }); // satisfies Route

  let server: Server<any>;
  const port = 8079;

  beforeAll(async () => {
    await mion.initRoutes({changeUserName, getDate, updateHeaders});
    setBunHttpOpts({port});
    server = await startBunServer();
  });

  afterAll(() => {
    console.log('Stopping server');
    void server.stop();
  });

  test('get an ok response from a route', async () => {
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

  test('get an error when sending invalid parameters', async () => {
    const requestData = {getDate: ['NOT A DATE POINT']};
    const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
    const reply = (await response.json()) as Record<string, unknown>;
    const headers = Object.fromEntries(response.headers.entries());

    const expectedError: PublicRpcError<'serialization-error'> = {
      'mion@isΣrrθr': true,
      publicMessage: `Invalid params 'getDate', can not deserialize. Parameters might be of the wrong type.`,
      type: 'serialization-error',
      errorData: {deserializeError: expect.any(String)},
      statusCode: StatusCodes.UNEXPECTED_ERROR,
    };

    expect(reply[MION_ROUTES.thrownErrors]).toEqual({getDate: expectedError});
    expect(headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(headers['content-length']).toEqual(expect.any(String));
    expect(headers['server']).toEqual('@mionjs');
  });

  test('set response headers from route response', async () => {
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

  test('a body over maxBodySize is a 413, natively or from the router, and the server keeps serving', async () => {
    const smallPort = port + 1;
    const bunOpts = {
      port: smallPort,
      maxBodySize: 10,
      defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
    };
    resetBunHttpOpts();
    setBunHttpOpts(bunOpts);
    await mion.initRoutes({changeUserName, getDate, updateHeaders});
    const smallServer = await startBunServer();
    const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
    const response = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
    // Bun.serve refuses the body itself with maxRequestBodySize; when it hands the request over
    // anyway (the option was reported broken in oven-sh/bun#6031), the router's own limit answers
    // with the mion envelope. Either way the status is 413 and the next request is served.
    expect(response.status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    const text = await response.text();
    if (response.headers.get('content-type')?.startsWith('application/json')) {
      const body = JSON.parse(text) as Record<string, any>;
      expect(body[MION_ROUTES.thrownErrors]['mionDeserializeRequest'].type).toBe('request-payload-too-large');
      expect(response.headers.get('x-rpc-error')).toBe('request-payload-too-large');
    }
    const alive = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {method: 'POST', body: '{}'});
    expect(alive.status).toBe(200);

    void smallServer.stop(true);

    // Restore router state for the main server
    resetBunHttpOpts();
    await mion.initRoutes({changeUserName, getDate, updateHeaders});
    setBunHttpOpts({port});
  });

  test('get an ok response from a route with Date objects using serializer=json', async () => {
    // Stop the main server
    void server.stop(true);

    // Start a new server with serializer=json
    const testPort = 8081;
    resetBunHttpOpts();
    const jsonRouter = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'json'});
    await jsonRouter.initRoutes({changeUserName, getDate});
    setBunHttpOpts({port: testPort});
    const testServer = await startBunServer();

    const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
    const response = await fetch(`http://127.0.0.1:${testPort}/api/getDate`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });

    const reply = await response.json();
    const headers = Object.fromEntries(response.headers.entries());

    expect(reply).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
    expect(headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(headers['server']).toEqual('@mionjs');

    // Stop the test server
    void testServer.stop(true);

    // Restart the main server
    resetBunHttpOpts();
    await mion.initRoutes({changeUserName, getDate, updateHeaders});
    setBunHttpOpts({port});
    server = await startBunServer();
  });

  test('get an ok response from a route with complex objects using serializer=json', async () => {
    // Stop the main server
    void server.stop(true);

    // Start a new server with serializer=json
    const testPort = 8081;
    resetBunHttpOpts();
    const jsonRouter = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'json'});
    await jsonRouter.initRoutes({changeUserName, getDate});
    setBunHttpOpts({port: testPort});
    const testServer = await startBunServer();

    const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
    const response = await fetch(`http://127.0.0.1:${testPort}/api/changeUserName`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });

    const reply = await response.json();
    const headers = Object.fromEntries(response.headers.entries());

    expect(reply).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
    expect(headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(headers['server']).toEqual('@mionjs');

    // Stop the test server
    void testServer.stop(true);

    // Restart the main server
    resetBunHttpOpts();
    await mion.initRoutes({changeUserName, getDate, updateHeaders});
    setBunHttpOpts({port});
    server = await startBunServer();
  });
});
