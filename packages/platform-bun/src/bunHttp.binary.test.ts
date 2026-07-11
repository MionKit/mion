/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {initRouter, registerRoutes, route, getRouteExecutionChain, resetRouter} from '@mionjs/router';
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

    const changeUserName = route((context: Context, user: SimpleUser): SimpleUser => {
        return {name: 'NewName', surname: user.surname};
    });

    const getDate = route((context: Context, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
    });

    let server: Server<any>;
    const port = 8090; // Use a unique port for binary tests

    beforeAll(async () => {
        // Reset everything first
        resetRouter();
        resetBunHttpOpts();

        // Initialize router with binary serialization
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'binary'});
        await registerRoutes({changeUserName, getDate});
        setBunHttpOpts({port});
        server = await startBunServer();
    });

    afterAll(() => {
        server.stop();
    });

    test('send binary request and receive binary response with Date objects', async () => {
        const executionChain = getRouteExecutionChain('/api/getDate')!.methods;

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
        const {buffer: requestBuffer} = serializeBinaryBody('/api/changeUserName', executionChain, requestBody, false);

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
        const {buffer: requestBuffer} = serializeBinaryBody('/api/getDate', executionChain, requestBody, false);

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
