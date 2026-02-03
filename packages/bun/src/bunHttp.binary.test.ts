/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {initRouter, registerRoutes, route, getRouteExecutionChain, resetRouter} from '@mionkit/router';
import {setBunHttpOpts, resetBunHttpOpts, startBunServer} from './bunHttp';
import {CallContext} from '@mionkit/router';
import {serializeBinaryBody, deserializeBinaryBody, MethodWithJitFns} from '@mionkit/core';
import {Server} from 'bun';

// Increase timeout for tests that involve type reflection (can be slow when running in parallel)
setDefaultTimeout(30_000);

describe('bun router binary serialization should', () => {
    type SimpleUser = {name: string; surname: string};
    type DataPoint = {date: Date};
    type MySharedData = ReturnType<typeof getSharedData>;
    type Context = CallContext<MySharedData>;

    const getSharedData = () => ({auth: {me: null as any}});

    const changeUserName = route((context: Context, user: SimpleUser): SimpleUser => {
        return {name: 'NewName', surname: user.surname};
    });

    const getDate = route((context: Context, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
    });

    /** Helper to build a methods map from an ExecutionChain */
    function buildMethodsMap(executionChain: MethodWithJitFns[]): Map<string, MethodWithJitFns> {
        const map = new Map<string, MethodWithJitFns>();
        for (const method of executionChain) map.set(method.id, method);
        return map;
    }

    let server: Server<any>;
    const port = 8090; // Use a unique port for binary tests

    beforeAll(async () => {
        // Reset everything first
        resetRouter();
        resetBunHttpOpts();

        // Initialize router with binary serialization
        await initRouter({contextDataFactory: getSharedData, prefix: 'api/', serializer: 'binary'});
        await registerRoutes({changeUserName, getDate});
        setBunHttpOpts({port});
        server = await startBunServer();
    });

    afterAll(() => {
        server.stop();
    });

    test('send binary request and receive binary response with Date objects', async () => {
        const executionChain = getRouteExecutionChain('/api/getDate')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize request body to binary
        const requestBody = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
        const {buffer: requestBuffer} = serializeBinaryBody('/api/getDate', executionChain, requestBody, false);

        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            headers: {'content-type': 'application/octet-stream'},
            body: Buffer.from(requestBuffer),
        });
        const headers = Object.fromEntries(response.headers.entries());
        const responseBuffer = await response.arrayBuffer();

        // Deserialize binary response
        const {body: responseBody} = deserializeBinaryBody('/api/getDate', methodsMap, responseBuffer, true);

        expect(responseBody.getDate).toBeDefined();
        expect(responseBody.getDate.date).toEqual(new Date('2022-04-22T00:17:00.000Z'));
        expect(headers['content-type']).toEqual('application/octet-stream');
        expect(headers['server']).toEqual('@mionkit');
    });

    test('send binary request and receive binary response with complex objects', async () => {
        const executionChain = getRouteExecutionChain('/api/changeUserName')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize request body to binary
        const requestBody = {changeUserName: [{name: 'John', surname: 'Doe'}]};
        const {buffer: requestBuffer} = serializeBinaryBody('/api/changeUserName', executionChain, requestBody, false);

        const response = await fetch(`http://127.0.0.1:${port}/api/changeUserName`, {
            method: 'POST',
            headers: {'content-type': 'application/octet-stream'},
            body: Buffer.from(requestBuffer),
        });
        const headers = Object.fromEntries(response.headers.entries());
        const responseBuffer = await response.arrayBuffer();

        // Deserialize binary response
        const {body: responseBody} = deserializeBinaryBody('/api/changeUserName', methodsMap, responseBuffer, true);

        expect(responseBody.changeUserName).toBeDefined();
        expect(responseBody.changeUserName.name).toEqual('NewName');
        expect(responseBody.changeUserName.surname).toEqual('Doe');
        expect(headers['content-type']).toEqual('application/octet-stream');
        expect(headers['server']).toEqual('@mionkit');
    });

    test('handle optional parameters in binary mode', async () => {
        const executionChain = getRouteExecutionChain('/api/getDate')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize request body with no parameters (optional)
        const requestBody = {getDate: []};
        const {buffer: requestBuffer} = serializeBinaryBody('/api/getDate', executionChain, requestBody, false);

        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            headers: {'content-type': 'application/octet-stream'},
            body: Buffer.from(requestBuffer),
        });
        const headers = Object.fromEntries(response.headers.entries());
        const responseBuffer = await response.arrayBuffer();

        // Deserialize binary response
        const {body: responseBody} = deserializeBinaryBody('/api/getDate', methodsMap, responseBuffer, true);

        expect(responseBody.getDate).toBeDefined();
        expect(responseBody.getDate.date).toEqual(new Date('2022-04-22T00:17:00.000Z'));
        expect(headers['content-type']).toEqual('application/octet-stream');
    });
});
