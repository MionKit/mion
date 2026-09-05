/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {createMionRouter, getRouteExecutionChain, resetRouter} from '@mionjs/router';
import {setBunHttpOpts, resetBunHttpOpts, startBunServer} from './bunHttp.ts';
import {CallContext} from '@mionjs/router';
import {serializeBinaryBody, deserializeBinaryBody} from '@mionjs/core';
import {Server} from 'bun';

// Increase timeout for tests that involve type reflection (can be slow when running in parallel)
setDefaultTimeout(30_000);

describe('bun router binary serialization should', () => {
  type SimpleUser = {name: string; surname: string};
  type DataPoint = {date: Date};
  type MySharedData = ReturnType<typeof getSharedData>;
  type Context = CallContext<MySharedData>;

  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'binary'});

  const changeUserName = mion.route((context: Context, user: SimpleUser): SimpleUser => {
    return {name: 'NewName', surname: user.surname};
  });

  const getDate = mion.route((context: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
  });

  let server: Server<any>;
  const port = 8090; // Use a unique port for binary tests

  beforeAll(async () => {
    // Reset everything first
    resetRouter();
    resetBunHttpOpts();

    // Initialize router with binary serialization
    await mion.initRoutes({changeUserName, getDate});
    setBunHttpOpts({port});
    server = await startBunServer();
  });

  afterAll(() => {
    void server.stop();
  });

  test('send binary request and receive binary response with Date objects', async () => {
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

  test('send binary request and receive binary response with complex objects', async () => {
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

  test('handle optional parameters in binary mode', async () => {
    const executionChain = getRouteExecutionChain('/api/getDate')!.methods;

    // Serialize request body with no parameters (optional)
    const requestBody = {getDate: []};
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

// The pooled binary strategy on this platform releases the response buffer as soon as the Response
// is constructed. That is only sound because Bun copies the bytes out synchronously — if it ever
// started aliasing the caller's memory, a pooled buffer could be overwritten by the next request
// while the response was still in flight, silently corrupting payloads. Prove it rather than
// trusting a comment; if this fails, platform-bun must stop pooling.
describe('bun Response copy semantics (buffer pooling depends on this)', () => {
  test('copies a Uint8Array body synchronously', async () => {
    const buffer = new ArrayBuffer(16);
    const view = new Uint8Array(buffer, 0, 8);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);

    const response = new Response(view);
    // simulate the pool handing this very buffer to the next request
    view.fill(0xff);

    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
