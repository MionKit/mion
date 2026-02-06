/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initMionRouter, resetRouter, getRouteExecutionChain} from './router';
import {dispatchBatchRoute} from './dispatch';
import {Routes} from './types/general';
import {
    StatusCodes,
    SerializerModes,
    serializeBinaryBody,
    serializeBatchBinaryRequest,
    deserializeBatchBinaryResponse,
    BatchBinaryRequestSerEntry,
} from '@mionkit/core';
import {route} from './lib/handlers';
import {headersFromRecord} from './lib/headers';

describe('Binary Batch Dispatch routes', () => {
    const sayHello = route((ctx, name: string): string => {
        return `Hello ${name}`;
    });

    const sumTwo = route((ctx, val: number): number => {
        return val + 2;
    });

    const processArray = route((ctx, items: number[]): number[] => {
        return items.map((x) => x * 2);
    });

    const routeFail = route((): void => {
        throw new Error('this is a generic error');
    });

    const routes = {sayHello, sumTwo, processArray, routeFail} satisfies Routes;

    beforeEach(() => resetRouter());

    /** Helper to create a binary request body for a single route */
    function createBinaryRouteBody(routePath: string, params: Record<string, any>): Uint8Array {
        const executionChain = getRouteExecutionChain(routePath)!.methods;
        const {buffer} = serializeBinaryBody(routePath, executionChain, params, false);
        return new Uint8Array(buffer);
    }

    describe('batch binary envelope roundtrip should', () => {
        it('serialize and deserialize a batch binary request/response', () => {
            // Create a simple batch binary request
            const entries: BatchBinaryRequestSerEntry[] = [
                {routeId: '/sayHello', body: new Uint8Array([1, 2, 3])},
                {routeId: '/sumTwo', body: new Uint8Array([4, 5, 6, 7])},
            ];

            const serialized = serializeBatchBinaryRequest(entries);
            expect(serialized).toBeInstanceOf(Uint8Array);
            expect(serialized.length).toBeGreaterThan(0);

            // Verify we can read the route count
            const view = new DataView(serialized.buffer, serialized.byteOffset, serialized.byteLength);
            expect(view.getUint32(0, true)).toBe(2); // 2 routes
        });

        it('roundtrip batch binary response with status codes', () => {
            const responseEntries = [
                {routeId: '/sayHello', statusCode: 200, body: new Uint8Array([10, 20])},
                {routeId: '/sumTwo', statusCode: 422, body: new Uint8Array([30, 40, 50])},
            ];

            // Import the serializer from core
            const {serializeBatchBinaryResponse} = require('@mionkit/core');
            const serialized = serializeBatchBinaryResponse(responseEntries);

            const deserialized = deserializeBatchBinaryResponse(serialized);
            expect(deserialized).toHaveLength(2);
            expect(deserialized[0].routeId).toBe('/sayHello');
            expect(deserialized[0].statusCode).toBe(200);
            expect(Array.from(deserialized[0].body)).toEqual([10, 20]);
            expect(deserialized[1].routeId).toBe('/sumTwo');
            expect(deserialized[1].statusCode).toBe(422);
            expect(Array.from(deserialized[1].body)).toEqual([30, 40, 50]);
        });

        it('handle empty bodies in batch binary envelope', () => {
            const entries: BatchBinaryRequestSerEntry[] = [{routeId: '/routeFail', body: new Uint8Array(0)}];

            const serialized = serializeBatchBinaryRequest(entries);
            expect(serialized).toBeInstanceOf(Uint8Array);

            // Verify route count
            const view = new DataView(serialized.buffer, serialized.byteOffset, serialized.byteLength);
            expect(view.getUint32(0, true)).toBe(1);
        });
    });

    describe('binary batch dispatch should', () => {
        it('dispatch multiple routes with binary format', async () => {
            await initMionRouter(routes, {serializer: 'binary'});

            // Create binary request bodies for each route
            const sayHelloBody = createBinaryRouteBody('/sayHello', {sayHello: ['World']});
            const sumTwoBody = createBinaryRouteBody('/sumTwo', {sumTwo: [3]});

            // Create batch binary request envelope
            const batchBinaryRequest = serializeBatchBinaryRequest([
                {routeId: '/sayHello', body: sayHelloBody},
                {routeId: '/sumTwo', body: sumTwoBody},
            ]);

            const response = await dispatchBatchRoute(
                batchBinaryRequest,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {},
                {},
                SerializerModes.binary
            );

            expect(response.statusCode).toBe(StatusCodes.OK);
            expect(response.bodyType).toBe(SerializerModes.binary);
            expect(response.rawBody).toBeInstanceOf(Uint8Array);

            // Deserialize the batch binary response
            const entries = deserializeBatchBinaryResponse(response.rawBody as Uint8Array);
            expect(entries).toHaveLength(2);
            expect(entries[0].routeId).toBe('/sayHello');
            expect(entries[0].statusCode).toBe(200);
            expect(entries[1].routeId).toBe('/sumTwo');
            expect(entries[1].statusCode).toBe(200);
        });

        it('dispatch a single route with binary format', async () => {
            await initMionRouter(routes, {serializer: 'binary'});

            const processBody = createBinaryRouteBody('/processArray', {processArray: [[1, 2, 3]]});

            const batchBinaryRequest = serializeBatchBinaryRequest([{routeId: '/processArray', body: processBody}]);

            const response = await dispatchBatchRoute(
                batchBinaryRequest,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {},
                {},
                SerializerModes.binary
            );

            expect(response.statusCode).toBe(StatusCodes.OK);
            const entries = deserializeBatchBinaryResponse(response.rawBody as Uint8Array);
            expect(entries).toHaveLength(1);
            expect(entries[0].routeId).toBe('/processArray');
            expect(entries[0].statusCode).toBe(200);
            // The body should be a valid binary response
            expect(entries[0].body.length).toBeGreaterThan(0);
        });

        it('isolate errors in binary batch - one route fails, others succeed', async () => {
            await initMionRouter(routes, {serializer: 'binary'});

            const sayHelloBody = createBinaryRouteBody('/sayHello', {sayHello: ['World']});
            // routeFail has no params, create an empty binary body
            const routeFailBody = createBinaryRouteBody('/routeFail', {});
            const sumTwoBody = createBinaryRouteBody('/sumTwo', {sumTwo: [5]});

            const batchBinaryRequest = serializeBatchBinaryRequest([
                {routeId: '/sayHello', body: sayHelloBody},
                {routeId: '/routeFail', body: routeFailBody},
                {routeId: '/sumTwo', body: sumTwoBody},
            ]);

            const response = await dispatchBatchRoute(
                batchBinaryRequest,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {},
                {},
                SerializerModes.binary
            );

            // Overall status should be 207 Multi-Status
            expect(response.statusCode).toBe(StatusCodes.MULTI_STATUS);

            const entries = deserializeBatchBinaryResponse(response.rawBody as Uint8Array);
            expect(entries).toHaveLength(3);

            // First route succeeds
            expect(entries[0].routeId).toBe('/sayHello');
            expect(entries[0].statusCode).toBe(200);

            // Second route fails but is isolated
            expect(entries[1].routeId).toBe('/routeFail');
            expect(entries[1].statusCode).toBe(StatusCodes.UNEXPECTED_ERROR);

            // Third route still succeeds
            expect(entries[2].routeId).toBe('/sumTwo');
            expect(entries[2].statusCode).toBe(200);
        });

        it('dispatch with 5 routes in binary format', async () => {
            await initMionRouter(routes, {serializer: 'binary'});

            const batchEntries: BatchBinaryRequestSerEntry[] = [];
            for (let i = 0; i < 5; i++) {
                const body = createBinaryRouteBody('/sumTwo', {sumTwo: [i]});
                batchEntries.push({routeId: '/sumTwo', body});
            }

            const batchBinaryRequest = serializeBatchBinaryRequest(batchEntries);

            const response = await dispatchBatchRoute(
                batchBinaryRequest,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {},
                {},
                SerializerModes.binary
            );

            expect(response.statusCode).toBe(StatusCodes.OK);
            const entries = deserializeBatchBinaryResponse(response.rawBody as Uint8Array);
            expect(entries).toHaveLength(5);
            for (let i = 0; i < 5; i++) {
                expect(entries[i].routeId).toBe('/sumTwo');
                expect(entries[i].statusCode).toBe(200);
            }
        });

        it('set correct content-type header for binary batch response', async () => {
            await initMionRouter(routes, {serializer: 'binary'});

            const sayHelloBody = createBinaryRouteBody('/sayHello', {sayHello: ['World']});
            const batchBinaryRequest = serializeBatchBinaryRequest([{routeId: '/sayHello', body: sayHelloBody}]);

            const response = await dispatchBatchRoute(
                batchBinaryRequest,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {},
                {},
                SerializerModes.binary
            );

            expect(response.headers.get('content-type')).toBe('application/octet-stream');
        });
    });

    describe('binary batch validation should', () => {
        it('reject malformed binary data', async () => {
            await initMionRouter(routes, {serializer: 'binary'});

            // Malformed binary data - too short to contain route count
            const malformedData = new Uint8Array([1, 2]);

            await expect(
                dispatchBatchRoute(
                    malformedData,
                    headersFromRecord({'content-type': 'application/octet-stream'}),
                    headersFromRecord({}),
                    {},
                    {},
                    SerializerModes.binary
                )
            ).rejects.toMatchObject({
                type: expect.stringContaining('batch'),
            });
        });
    });
});
