/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {initRouter, registerRoutes, route, getRouteExecutionChain, resetRouter} from '@mionkit/router';
import {setBunHttpOpts, resetBunHttpOpts, startBunServer} from './bunHttp';
import {CallContext} from '@mionkit/router';
import {
    StatusCodes,
    BatchResponse,
    BATCH_ROUTE_PATH,
    serializeBinaryBody,
    initBatchSerializer,
    writeBatchEntry,
    initBatchDeserializer,
    readNextBatchEntry,
} from '@mionkit/core';
import {Server} from 'bun';

// Increase timeout for tests that involve type reflection (can be slow when running in parallel)
setDefaultTimeout(30_000);

describe('bun router batch routes should', () => {
    type SimpleUser = {name: string; surname: string};
    type MySharedData = ReturnType<typeof getSharedData>;
    type Context = CallContext<MySharedData>;

    const getSharedData = () => ({auth: {me: null as any}});

    const changeUserName = route((context: Context, user: SimpleUser): SimpleUser => {
        return {name: 'NewName', surname: user.surname};
    });

    const sayHello = route((context: Context, name: string): string => {
        return `Hello ${name}`;
    });

    const sumTwo = route((context: Context, val: number): number => {
        return val + 2;
    });

    const routeFail = route((): void => {
        throw new Error('this is a generic error');
    });

    let server: Server<any>;
    const port = 8095;

    beforeAll(async () => {
        resetRouter();
        resetBunHttpOpts();
        await initRouter({contextDataFactory: getSharedData, prefix: 'api/'});
        await registerRoutes({changeUserName, sayHello, sumTwo, routeFail});
        setBunHttpOpts({port});
        server = await startBunServer();
    });

    afterAll(() => {
        server.stop();
    });

    test('dispatch JSON batch request with multiple routes', async () => {
        const batchBody = {
            routeIds: ['/api/sayHello', '/api/sumTwo'],
            bodies: [{sayHello: ['World']}, {sumTwo: [3]}],
        };

        const response = await fetch(`http://127.0.0.1:${port}${BATCH_ROUTE_PATH}`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(batchBody),
        });

        const reply = (await response.json()) as BatchResponse;
        expect(response.status).toBe(StatusCodes.OK);
        expect(reply.routeIds).toEqual(['/api/sayHello', '/api/sumTwo']);
        expect(reply.statuses).toEqual([200, 200]);
        expect(reply.bodies[0]).toEqual({sayHello: 'Hello World'});
        expect(reply.bodies[1]).toEqual({sumTwo: 5});
    });

    test('handle mixed success/error in JSON batch', async () => {
        const batchBody = {
            routeIds: ['/api/sayHello', '/api/routeFail', '/api/sumTwo'],
            bodies: [{sayHello: ['World']}, {routeFail: []}, {sumTwo: [5]}],
        };

        const response = await fetch(`http://127.0.0.1:${port}${BATCH_ROUTE_PATH}`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(batchBody),
        });

        const reply = (await response.json()) as BatchResponse;
        expect(response.status).toBe(StatusCodes.MULTI_STATUS);
        expect(reply.routeIds).toEqual(['/api/sayHello', '/api/routeFail', '/api/sumTwo']);

        // First route succeeds
        expect(reply.statuses[0]).toBe(200);
        expect(reply.bodies[0]).toEqual({sayHello: 'Hello World'});

        // Second route fails
        expect(reply.statuses[1]).toBe(StatusCodes.UNEXPECTED_ERROR);

        // Third route still succeeds
        expect(reply.statuses[2]).toBe(200);
        expect(reply.bodies[2]).toEqual({sumTwo: 7});
    });

    test('return correct response format for JSON batch', async () => {
        const batchBody = {
            routeIds: ['/api/sayHello'],
            bodies: [{sayHello: ['World']}],
        };

        const response = await fetch(`http://127.0.0.1:${port}${BATCH_ROUTE_PATH}`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(batchBody),
        });

        const headers = Object.fromEntries(response.headers.entries());
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['server']).toEqual('@mionkit');

        const reply = (await response.json()) as BatchResponse;
        expect(reply).toHaveProperty('routeIds');
        expect(reply).toHaveProperty('statuses');
        expect(reply).toHaveProperty('bodies');
    });
});

describe('bun router binary batch routes should', () => {
    type MySharedData = ReturnType<typeof getSharedData>;
    type Context = CallContext<MySharedData>;

    const getSharedData = () => ({auth: {me: null as any}});

    const sayHello = route((context: Context, name: string): string => {
        return `Hello ${name}`;
    });

    const sumTwo = route((context: Context, val: number): number => {
        return val + 2;
    });

    const routeFail = route((): void => {
        throw new Error('this is a generic error');
    });

    let server: Server<any>;
    const port = 8096;

    beforeAll(async () => {
        resetRouter();
        resetBunHttpOpts();
        await initRouter({contextDataFactory: getSharedData, prefix: 'api/', serializer: 'binary'});
        await registerRoutes({sayHello, sumTwo, routeFail});
        setBunHttpOpts({port});
        server = await startBunServer();
    });

    afterAll(() => {
        server.stop();
    });

    test('dispatch binary batch request with multiple routes', async () => {
        const sayHelloChain = getRouteExecutionChain('/api/sayHello')!.methods;
        const sumTwoChain = getRouteExecutionChain('/api/sumTwo')!.methods;

        const {buffer: sayHelloBuffer} = serializeBinaryBody('/api/sayHello', sayHelloChain, {sayHello: ['World']}, false);
        const {buffer: sumTwoBuffer} = serializeBinaryBody('/api/sumTwo', sumTwoChain, {sumTwo: [3]}, false);

        const routeIds = ['/api/sayHello', '/api/sumTwo'];
        const batchSerializer = initBatchSerializer(routeIds, false);
        writeBatchEntry(batchSerializer, '/api/sayHello', new Uint8Array(sayHelloBuffer));
        writeBatchEntry(batchSerializer, '/api/sumTwo', new Uint8Array(sumTwoBuffer));
        const batchBinaryRequest = batchSerializer.getBufferView();

        const response = await fetch(`http://127.0.0.1:${port}${BATCH_ROUTE_PATH}`, {
            method: 'POST',
            headers: {'content-type': 'application/octet-stream'},
            body: Buffer.from(batchBinaryRequest),
        });

        expect(response.status).toBe(StatusCodes.OK);
        const headers = Object.fromEntries(response.headers.entries());
        expect(headers['content-type']).toEqual('application/octet-stream');

        const responseBuffer = await response.arrayBuffer();
        const {deserializer: respDes, routeCount} = initBatchDeserializer(responseBuffer, true);
        expect(routeCount).toBe(2);
        const entry0 = readNextBatchEntry(respDes, true);
        expect(entry0.routeId).toBe('/api/sayHello');
        expect(entry0.statusCode).toBe(200);
        const entry1 = readNextBatchEntry(respDes, true);
        expect(entry1.routeId).toBe('/api/sumTwo');
        expect(entry1.statusCode).toBe(200);
    });

    test('handle mixed success/error in binary batch', async () => {
        const sayHelloChain = getRouteExecutionChain('/api/sayHello')!.methods;
        const routeFailChain = getRouteExecutionChain('/api/routeFail')!.methods;
        const sumTwoChain = getRouteExecutionChain('/api/sumTwo')!.methods;

        const {buffer: sayHelloBuffer} = serializeBinaryBody('/api/sayHello', sayHelloChain, {sayHello: ['World']}, false);
        const {buffer: routeFailBuffer} = serializeBinaryBody('/api/routeFail', routeFailChain, {}, false);
        const {buffer: sumTwoBuffer} = serializeBinaryBody('/api/sumTwo', sumTwoChain, {sumTwo: [5]}, false);

        const routeIds2 = ['/api/sayHello', '/api/routeFail', '/api/sumTwo'];
        const batchSerializer2 = initBatchSerializer(routeIds2, false);
        writeBatchEntry(batchSerializer2, '/api/sayHello', new Uint8Array(sayHelloBuffer));
        writeBatchEntry(batchSerializer2, '/api/routeFail', new Uint8Array(routeFailBuffer));
        writeBatchEntry(batchSerializer2, '/api/sumTwo', new Uint8Array(sumTwoBuffer));
        const batchBinaryRequest = batchSerializer2.getBufferView();

        const response = await fetch(`http://127.0.0.1:${port}${BATCH_ROUTE_PATH}`, {
            method: 'POST',
            headers: {'content-type': 'application/octet-stream'},
            body: Buffer.from(batchBinaryRequest),
        });

        expect(response.status).toBe(StatusCodes.MULTI_STATUS);

        const responseBuffer = await response.arrayBuffer();
        const {deserializer: respDes2, routeCount: rc2} = initBatchDeserializer(responseBuffer, true);
        expect(rc2).toBe(3);

        const e0 = readNextBatchEntry(respDes2, true);
        expect(e0.routeId).toBe('/api/sayHello');
        expect(e0.statusCode).toBe(200);

        const e1 = readNextBatchEntry(respDes2, true);
        expect(e1.routeId).toBe('/api/routeFail');
        expect(e1.statusCode).toBe(StatusCodes.UNEXPECTED_ERROR);

        const e2 = readNextBatchEntry(respDes2, true);
        expect(e2.routeId).toBe('/api/sumTwo');
        expect(e2.statusCode).toBe(200);
    });
});
