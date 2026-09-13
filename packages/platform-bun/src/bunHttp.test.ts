/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {createMionRouter, resetRouter, addStartMiddleFns, addEndMiddleFns} from '@mionjs/router';
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
    mion.initRoutes({changeUserName, getDate, updateHeaders});
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
    mion.initRoutes({changeUserName, getDate, updateHeaders});
    const smallServer = await startBunServer();
    // `changeUserName` takes a plain `SimpleUser` (unbounded strings), so it is the adapter's number
    // that applies; `getDate` derives its own limit from its types and would ignore a 10-byte adapter
    const requestData = {changeUserName: [{name: 'a', surname: 'b'}]};
    const response = await fetch(`http://127.0.0.1:${smallPort}/api/changeUserName`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
    // Bun.serve refuses the body itself with maxRequestBodySize; when it hands the request over
    // anyway (the option was reported broken in oven-sh/bun#6031), the adapter's own read against
    // the route limit answers with the mion envelope. Either way the status is 413 and the next
    // request is served.
    expect(response.status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    const text = await response.text();
    if (response.headers.get('content-type')?.startsWith('application/json')) {
      const body = JSON.parse(text) as Record<string, any>;
      expect(body[MION_ROUTES.thrownErrors][MION_ROUTES.platformError].type).toBe('request-payload-too-large');
      expect(response.headers.get('x-rpc-error')).toBe('request-payload-too-large');
    }
    // a chunked body with no content-length is read against the route limit as it streams in
    const streamed = await fetch(`http://127.0.0.1:${smallPort}/api/changeUserName`, {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          const chunk = new TextEncoder().encode(JSON.stringify(requestData));
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    expect(streamed.status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    expect(streamed.headers.get('connection')).toBe('close');
    await streamed.text();
    // the refused stream's connection is closed by the server (`connection: close`); Bun's own fetch
    // client still reuses it once and gets a 400, so the liveness check opens a fresh connection
    const alive = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {method: 'POST', body: '{}', keepalive: false});
    expect(alive.status).toBe(200);

    void smallServer.stop(true);

    // Restore router state for the main server
    resetBunHttpOpts();
    mion.initRoutes({changeUserName, getDate, updateHeaders});
    setBunHttpOpts({port});
  });

  test('an unknown path answers 404 without reading the body, and the server keeps serving', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/nope`, {method: 'POST', body: '{not json'});
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    const body = (await response.json()) as Record<string, any>;
    expect(body[MION_ROUTES.thrownErrors][MION_ROUTES.notFound].type).toBe('route-not-found');
    expect(body[MION_ROUTES.thrownErrors]['mionDeserializeRequest']).toBeUndefined();
    const alive = await fetch(`http://127.0.0.1:${port}/api/getDate`, {method: 'POST', body: '{}'});
    expect(alive.status).toBe(200);
  });

  test('a declared content-length bounds what req.text() reads: trailing bytes never reach the body', async () => {
    // the reader trusts content-length and calls req.text(): bun must hand over exactly that many
    // bytes, so a body followed by junk on the same socket still parses as the body alone
    const json = JSON.stringify({getDate: [{date: '2022-04-10T02:13:00.000Z'}]});
    const head = `POST /api/getDate HTTP/1.1\r\nHost: x\r\nContent-Length: ${json.length}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n`;
    const {createConnection} = await import('node:net');
    const first = await new Promise<string>((resolve, reject) => {
      const socket = createConnection({host: '127.0.0.1', port}, () => socket.write(head + json + '<<<junk after the body>>>'));
      let data = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => (data += chunk));
      socket.on('error', reject);
      socket.on('close', () => resolve(data));
      setTimeout(() => socket.destroy(), 2000);
    });
    expect(first.slice(0, 400)).toContain('HTTP/1.1 200');
    expect(first).toContain('"date":"2022-04-10T02:13:00.000Z"');
  });

  test('get an ok response from a route with Date objects with a router created in the test (default encoder)', async () => {
    // Stop the main server
    void server.stop(true);

    // Start a new server with a router created here (default encoder)
    const testPort = 8081;
    resetBunHttpOpts();
    const jsonRouter = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
    jsonRouter.initRoutes({changeUserName, getDate});
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
    mion.initRoutes({changeUserName, getDate, updateHeaders});
    setBunHttpOpts({port});
    server = await startBunServer();
  });

  test('get an ok response from a route with complex objects with a router created in the test (default encoder)', async () => {
    // Stop the main server
    void server.stop(true);

    // Start a new server with a router created here (default encoder)
    const testPort = 8081;
    resetBunHttpOpts();
    const jsonRouter = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
    jsonRouter.initRoutes({changeUserName, getDate});
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
    mion.initRoutes({changeUserName, getDate, updateHeaders});
    setBunHttpOpts({port});
    server = await startBunServer();
  });
});

// A body this adapter refuses is still a request the chain sees: it runs the members that declare
// `alwaysRun` (an access log, a rate limiter) and nothing else. Bun.serve can also refuse the body
// natively before mion is called, and then there is no chain to run and no mion envelope either.
describe('bun: a refused body runs the alwaysRun middleFns', () => {
  type User = {name: string; surname: string};
  const seen: string[] = [];
  const refusedPort = 8085;
  let server: Server<any>;

  beforeAll(async () => {
    // the router is a once-per-process singleton: reset it before building this suite's own
    resetRouter();
    resetBunHttpOpts();
    const mion = createMionRouter({basePath: 'api/'});
    const echo = mion.route((ctx: CallContext, user: User): User => user);
    const plainStart = mion.rawMiddleFn((ctx: CallContext) => {
      seen.push(`start:${ctx.path}`);
    });
    const accessLog = mion.rawMiddleFn(
      (ctx: CallContext) => {
        seen.push(`log:${ctx.response.statusCode}`);
      },
      {alwaysRun: true}
    );
    addStartMiddleFns({plainStart});
    addEndMiddleFns({accessLog});
    mion.initRoutes({echo});
    setBunHttpOpts({port: refusedPort, maxBodySize: 64});
    server = await startBunServer();
  });

  afterAll(() => void server.stop());

  test('a body over the limit answers 413, and when mion answers it the alwaysRun middleFn saw it', async () => {
    seen.length = 0;
    const response = await fetch(`http://127.0.0.1:${refusedPort}/api/echo`, {
      method: 'POST',
      body: JSON.stringify({echo: [{name: 'x'.repeat(120), surname: 'y'}]}),
    });
    expect(response.status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    const text = await response.text();
    // Bun.serve refuses some bodies natively, before any mion code runs: only the answers that
    // carry the mion envelope came through the chain
    if (response.headers.get('content-type')?.startsWith('application/json')) {
      const errors = (JSON.parse(text) as Record<string, any>)[MION_ROUTES.thrownErrors];
      expect(errors[MION_ROUTES.platformError].type).toBe('request-payload-too-large');
      expect(errors['mionDeserializeRequest']).toBeUndefined();
      expect(seen).toEqual(['log:413']);
    }
  });

  test('a body inside the limit still runs the whole chain', async () => {
    seen.length = 0;
    const response = await fetch(`http://127.0.0.1:${refusedPort}/api/echo`, {
      method: 'POST',
      body: '{"echo":[{"name":"a","surname":"b"}]}',
    });
    expect(response.status).toBe(200);
    expect(seen).toEqual(['start:/api/echo', 'log:200']);
  });
});
