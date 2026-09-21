/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';

/** Path to the pre-built cloudflare bundle (all deps inlined + AOT caches) */
const CLOUDFLARE_BUNDLE_PATH = resolve(__dirname, '../../test-server/build/test-server-cloudflare.js');

/** Serialized response from Miniflare */
interface WorkerResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

/** The options CloudflareTestServer.setup() accepts, mirroring CloudflareSetupOptions in the fixture.
 *  The fixture rejects an unknown key at runtime, so a drift between the two fails the setup instead of
 *  being ignored. */
interface CloudflareSetupOptions {
  basePath?: string;
  serializer?: 'mutate' | 'clone';
  defaultResponseHeaders?: Record<string, string>;
}

/** Builds the setup argument from a checked object: a hand written literal inside the worker script is
 *  never type checked, which is how a block once configured itself with an option that did not exist. */
function setupOptions(options: CloudflareSetupOptions = {}): string {
  return JSON.stringify(options);
}

/** Creates a Miniflare instance with the test server bundle loaded as a service worker */
function createMiniflare(setupCode: string, port?: number): Miniflare {
  const bundleCode = readFileSync(CLOUDFLARE_BUNDLE_PATH, 'utf-8');
  // Service worker format: the IIFE bundle sets up CloudflareTestServer on globalThis,
  // then we call setup (storing the promise) and register the fetch handler.
  const workerScript = `
        // Polyfill process for bundled code that checks typeof process
        globalThis.process = { env: {} };
        ${bundleCode}
        const __initPromise = CloudflareTestServer.setup(${setupCode});
        addEventListener('fetch', event => {
            event.respondWith(
                __initPromise.then(() => globalThis.handler.fetch(event.request))
            );
        });
    `;
  return new Miniflare({
    script: workerScript,
    compatibilityDate: '2024-01-01',
    ...(port === undefined ? {} : {port}),
  });
}

/** Calls the worker and returns serialized response data */
async function callHandler(mf: Miniflare, path: string, body: string, method = 'POST'): Promise<WorkerResponse> {
  const response = await mf.dispatchFetch(`http://localhost${path}`, {
    method,
    body,
    headers: {'content-type': 'application/json'},
  });
  const responseBody = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    status: response.status,
    body: responseBody,
    headers,
  };
}

describe('cloudflare handler (workerd runtime)', () => {
  describe('with the default clone serializer', () => {
    let mf: Miniflare;

    beforeAll(async () => {
      mf = createMiniflare(setupOptions());
    });

    afterAll(async () => {
      await mf?.dispose();
    });

    it('should get an ok response from a route', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const result = await callHandler(mf, '/api/getDate', JSON.stringify(requestData));
      const parsedResponse = JSON.parse(result.body);

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(result.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(result.headers['server']).toEqual('@mionjs');
    });

    it('should get an error when sending invalid parameters', async () => {
      const requestData = {getDate: ['NOT A DATE POINT']};
      const result = await callHandler(mf, '/api/getDate', JSON.stringify(requestData));
      const parsedResponse = JSON.parse(result.body);

      const expectedError: PublicRpcError<'validation-error'> = {
        'mion@isΣrrθr': true,
        publicMessage: `Invalid params in 'getDate', validation failed.`,
        type: 'validation-error',
        errorData: {typeErrors: [{path: [0], expected: 'objectLiteral'}]},
        statusCode: StatusCodes.UNEXPECTED_ERROR,
      };
      expect(parsedResponse[MION_ROUTES.thrownErrors]).toEqual({getDate: expectedError});
      expect(result.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(result.headers['server']).toEqual('@mionjs');
    });

    it('should set response headers from route response', async () => {
      const requestData = {};
      const result = await callHandler(mf, '/api/updateHeaders', JSON.stringify(requestData));
      const parsedResponse = JSON.parse(result.body);

      expect(parsedResponse).toEqual({});
      expect(result.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(result.headers['server']).toEqual('my-server');
      expect(result.headers['x-something']).toEqual('true');
    });

    it('should include default headers', async () => {
      await mf.dispose();
      mf = createMiniflare(setupOptions({defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'}}));

      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const result = await callHandler(mf, '/api/getDate', JSON.stringify(requestData));
      const parsedResponse = JSON.parse(result.body);

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(result.headers['x-app-name']).toEqual('MyApp');
      expect(result.headers['x-instance-id']).toEqual('3089');
      expect(result.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(result.headers['server']).toEqual('@mionjs');
    });
  });

  describe('with basePath stripping', () => {
    let mf: Miniflare;

    beforeAll(async () => {
      mf = createMiniflare(setupOptions({basePath: '/api/mion'}));
    });

    afterAll(async () => {
      await mf?.dispose();
    });

    it('should strip basePath and route correctly', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const result = await callHandler(mf, '/api/mion/api/getDate', JSON.stringify(requestData));
      const parsedResponse = JSON.parse(result.body);

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(result.status).toBe(200);
    });
  });

  describe('with the mutate serializer', () => {
    let mf: Miniflare;

    beforeAll(async () => {
      mf = createMiniflare(setupOptions({serializer: 'mutate'}));
    });

    afterAll(async () => {
      await mf?.dispose();
    });

    // Only `mutate` restores the params in place and keeps a key the type does not declare; every other
    // strategy rebuilds the declared shape. `getDate` hands its own argument back, so the extra key
    // reaching the wire proves the option applied.
    it('should keep an undeclared key the clone serializer would drop', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z'), extra: 'kept'}]};
      const result = await callHandler(mf, '/api/getDate', JSON.stringify(requestData));
      const parsedResponse = JSON.parse(result.body);

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z', extra: 'kept'}});
    });

    it('should get an ok response from a route with Date objects', async () => {
      const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
      const result = await callHandler(mf, '/api/getDate', JSON.stringify(requestData));
      const parsedResponse = JSON.parse(result.body);

      expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
      expect(result.headers['content-type']).toContain('application/json');
      expect(result.headers['server']).toEqual('@mionjs');
    });

    it('should get an ok response from a route with complex objects', async () => {
      const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
      const result = await callHandler(mf, '/api/changeUserName', JSON.stringify(requestData));
      const parsedResponse = JSON.parse(result.body);

      expect(parsedResponse).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
      expect(result.headers['content-type']).toContain('application/json');
      expect(result.headers['server']).toEqual('@mionjs');
    });
  });

  describe('setup options', () => {
    let mf: Miniflare;

    afterAll(async () => {
      await mf?.dispose();
    });

    it('should reject an option the fixture does not declare', async () => {
      mf = createMiniflare(`{encoder: 'direct'}`);
      const response = await mf.dispatchFetch('http://localhost/api/getDate', {method: 'POST', body: '{}'});

      expect(response.status).toBe(500);
      expect(await response.text()).toMatch(/unknown setup option\(s\) encoder/);
    });
  });
});

// The reader trusts a declared content-length and calls request.text(): workerd must hand over
// exactly that many bytes. Driven over a raw socket against Miniflare's own listener.
describe('cloudflare handler (workerd runtime): content-length bounds the body', () => {
  const port = 8571;
  let mf: Miniflare;

  beforeAll(async () => {
    mf = createMiniflare(setupOptions(), port);
    await mf.ready;
  });

  afterAll(async () => {
    await mf?.dispose();
  });

  it('trailing bytes after the declared length never reach the body', async () => {
    const {createConnection} = await import('node:net');
    const json = JSON.stringify({getDate: [{date: '2022-04-10T02:13:00.000Z'}]});
    const head = `POST /api/getDate HTTP/1.1\r\nHost: x\r\nContent-Length: ${json.length}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n`;
    const first = await new Promise<string>((resolve, reject) => {
      const socket = createConnection({host: '127.0.0.1', port}, () => socket.write(head + json + '<<<junk after the body>>>'));
      let data = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => (data += chunk));
      socket.on('error', reject);
      socket.on('close', () => resolve(data));
      setTimeout(() => socket.destroy(), 3000);
    });
    expect(first.slice(0, 400)).toContain('HTTP/1.1 200');
    expect(first).toContain('"date":"2022-04-10T02:13:00.000Z"');
  });
});
