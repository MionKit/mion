/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll} from 'vitest';
import {EdgeVM} from '@edge-runtime/vm';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionkit/core';

/** Path to the pre-built edge bundle (all deps inlined + AOT caches) */
const EDGE_BUNDLE_PATH = resolve(__dirname, '../../test-server/build/test-server-edge.js');

/** Serialized response from inside the EdgeVM (avoids cross-context issues) */
interface EdgeResponse {
    status: number;
    body: string;
    headers: Record<string, string>;
}

/** Creates an EdgeVM with the test server bundle loaded */
function createEdgeVM(): EdgeVM {
    const bundleCode = readFileSync(EDGE_BUNDLE_PATH, 'utf-8');
    return new EdgeVM({
        initialCode: bundleCode,
        // Vercel edge functions have access to process.env
        extend: (context) => {
            context.process = {env: {}};
            return context;
        },
    });
}

/**
 * Calls the handler inside the EdgeVM and returns serialized response data.
 * Everything (Request construction, handler execution, Response reading)
 * runs inside the edge runtime sandbox.
 */
async function callHandler(vm: EdgeVM, path: string, body: string, method = 'POST'): Promise<EdgeResponse> {
    return vm.evaluate(`
        (async () => {
            const req = new Request('http://localhost${path}', {
                method: '${method}',
                body: ${JSON.stringify(body)},
                headers: {'content-type': 'application/json'}
            });
            const res = await globalThis.handler.POST(req);
            return {
                status: res.status,
                body: await res.text(),
                headers: Object.fromEntries(res.headers.entries())
            };
        })()
    `);
}

describe('vercel handler (edge runtime)', () => {
    let vm: EdgeVM;

    describe('with serializer=stringifyJson (default)', () => {
        beforeAll(async () => {
            vm = createEdgeVM();
            await vm.evaluate('EdgeTestServer.setup()');
        });

        it('should get an ok response from a route', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
            const result = await callHandler(vm, '/api/getDate', JSON.stringify(requestData));
            const parsedResponse = JSON.parse(result.body);

            expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
            expect(result.headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(result.headers['server']).toEqual('@mionkit');
        });

        it('should get an error when sending invalid parameters', async () => {
            const requestData = {getDate: ['NOT A DATE POINT']};
            const result = await callHandler(vm, '/api/getDate', JSON.stringify(requestData));
            const parsedResponse = JSON.parse(result.body);

            const expectedError: PublicRpcError<'validation-error'> = {
                'mion@isΣrrθr': true,
                publicMessage: `Invalid params in 'getDate', validation failed.`,
                type: 'validation-error',
                errorData: {typeErrors: expect.any(Array)},
                statusCode: StatusCodes.UNEXPECTED_ERROR,
            };
            expect(parsedResponse[MION_ROUTES.thrownErrors]).toEqual({getDate: expectedError});
            expect(result.headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(result.headers['server']).toEqual('@mionkit');
        });

        it('should set response headers from route response', async () => {
            const requestData = {};
            const result = await callHandler(vm, '/api/updateHeaders', JSON.stringify(requestData));
            const parsedResponse = JSON.parse(result.body);

            expect(parsedResponse).toEqual({});
            expect(result.headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(result.headers['server']).toEqual('my-server');
            expect(result.headers['x-something']).toEqual('true');
        });

        it('should include default headers', async () => {
            // Re-setup with custom default headers
            vm = createEdgeVM();
            await vm.evaluate(`EdgeTestServer.setup({
                defaultResponseHeaders: {
                    'x-app-name': 'MyApp',
                    'x-instance-id': '3089',
                }
            })`);

            const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
            const result = await callHandler(vm, '/api/getDate', JSON.stringify(requestData));
            const parsedResponse = JSON.parse(result.body);

            expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
            expect(result.headers['x-app-name']).toEqual('MyApp');
            expect(result.headers['x-instance-id']).toEqual('3089');
            expect(result.headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(result.headers['server']).toEqual('@mionkit');
        });
    });

    describe('with basePath stripping', () => {
        beforeAll(async () => {
            vm = createEdgeVM();
            await vm.evaluate(`EdgeTestServer.setup({ basePath: '/api/mion' })`);
        });

        it('should strip basePath and route correctly', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
            const result = await callHandler(vm, '/api/mion/api/getDate', JSON.stringify(requestData));
            const parsedResponse = JSON.parse(result.body);

            expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
            expect(result.status).toBe(200);
        });
    });

    describe('with serializer=json', () => {
        beforeAll(async () => {
            vm = createEdgeVM();
            await vm.evaluate(`EdgeTestServer.setup({ serializer: 'json' })`);
        });

        it('should get an ok response from a route with Date objects', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
            const result = await callHandler(vm, '/api/getDate', JSON.stringify(requestData));
            const parsedResponse = JSON.parse(result.body);

            expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
            expect(result.headers['content-type']).toContain('application/json');
            expect(result.headers['server']).toEqual('@mionkit');
        });

        it('should get an ok response from a route with complex objects', async () => {
            const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
            const result = await callHandler(vm, '/api/changeUserName', JSON.stringify(requestData));
            const parsedResponse = JSON.parse(result.body);

            expect(parsedResponse).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
            expect(result.headers['content-type']).toContain('application/json');
            expect(result.headers['server']).toEqual('@mionkit');
        });
    });
});
