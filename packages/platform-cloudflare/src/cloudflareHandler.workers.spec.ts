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

/** Creates a Miniflare instance with the test server bundle loaded as a service worker */
function createMiniflare(setupCode: string): Miniflare {
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
    describe('with serializer=stringifyJson (default)', () => {
        let mf: Miniflare;

        beforeAll(async () => {
            mf = createMiniflare('');
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

            const expectedError: PublicRpcError<'serialization-error'> = {
                'mion@isΣrrθr': true,
                publicMessage: `Invalid params 'getDate', can not deserialize. Parameters might be of the wrong type.`,
                type: 'serialization-error',
                errorData: {deserializeError: expect.any(String)},
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
            mf = createMiniflare(`{
                defaultResponseHeaders: {
                    'x-app-name': 'MyApp',
                    'x-instance-id': '3089',
                }
            }`);

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
            mf = createMiniflare(`{ basePath: '/api/mion' }`);
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

    describe('with serializer=json', () => {
        let mf: Miniflare;

        beforeAll(async () => {
            mf = createMiniflare(`{ serializer: 'json' }`);
        });

        afterAll(async () => {
            await mf?.dispose();
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
});
