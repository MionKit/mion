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
    initBatchSerializer,
    writeBatchEntry,
    finalizeBatchEntry,
    initBatchDeserializer,
    readNextBatchEntry,
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

    /** Helper to create a batch binary request using the incremental API */
    function createBatchBinaryRequest(entries: {routeId: string; body: Uint8Array}[]): Uint8Array {
        const routeIds = entries.map((e) => e.routeId);
        const serializer = initBatchSerializer(routeIds, false);
        for (const entry of entries) {
            writeBatchEntry(serializer, entry.routeId, entry.body);
        }
        return serializer.getBufferView();
    }

    /** Helper to deserialize a batch binary response using the incremental API */
    function deserializeBatchResponse(buffer: Uint8Array): {routeId: string; statusCode: number; body: Uint8Array}[] {
        const {deserializer, routeCount} = initBatchDeserializer(buffer, true);
        const entries: {routeId: string; statusCode: number; body: Uint8Array}[] = [];
        for (let i = 0; i < routeCount; i++) {
            const entry = readNextBatchEntry(deserializer, true);
            entries.push({routeId: entry.routeId, statusCode: entry.statusCode!, body: entry.body!});
        }
        return entries;
    }

    describe('batch binary envelope roundtrip should', () => {
        it('serialize and deserialize a batch binary request/response', () => {
            // Create a simple batch binary request
            const serialized = createBatchBinaryRequest([
                {routeId: '/sayHello', body: new Uint8Array([1, 2, 3])},
                {routeId: '/sumTwo', body: new Uint8Array([4, 5, 6, 7])},
            ]);

            expect(serialized).toBeInstanceOf(Uint8Array);
            expect(serialized.length).toBeGreaterThan(0);

            // Verify we can read the route count
            const view = new DataView(serialized.buffer, serialized.byteOffset, serialized.byteLength);
            expect(view.getUint32(0, true)).toBe(2); // 2 routes
        });

        it('roundtrip batch binary response with status codes', () => {
            const routeIds = ['/sayHello', '/sumTwo'];
            const serializer = initBatchSerializer(routeIds, true);

            // Write first route entry
            const h1 = writeBatchEntry(serializer, '/sayHello', undefined);
            // Write body bytes directly
            const body1 = new Uint8Array([10, 20]);
            const uint8View1 = new Uint8Array(serializer.view.buffer, 0, serializer.view.byteLength);
            uint8View1.set(body1, serializer.index);
            serializer.index += body1.length;
            finalizeBatchEntry(serializer, 200, h1.statusIndex!, h1.bodyLengthIndex!, h1.bodyStartIndex!);

            // Write second route entry
            const h2 = writeBatchEntry(serializer, '/sumTwo', undefined);
            const body2 = new Uint8Array([30, 40, 50]);
            const uint8View2 = new Uint8Array(serializer.view.buffer, 0, serializer.view.byteLength);
            uint8View2.set(body2, serializer.index);
            serializer.index += body2.length;
            finalizeBatchEntry(serializer, 422, h2.statusIndex!, h2.bodyLengthIndex!, h2.bodyStartIndex!);

            const serialized = serializer.getBufferView();

            const deserialized = deserializeBatchResponse(serialized);
            expect(deserialized).toHaveLength(2);
            expect(deserialized[0].routeId).toBe('/sayHello');
            expect(deserialized[0].statusCode).toBe(200);
            expect(Array.from(deserialized[0].body)).toEqual([10, 20]);
            expect(deserialized[1].routeId).toBe('/sumTwo');
            expect(deserialized[1].statusCode).toBe(422);
            expect(Array.from(deserialized[1].body)).toEqual([30, 40, 50]);
        });

        it('handle empty bodies in batch binary envelope', () => {
            const serialized = createBatchBinaryRequest([{routeId: '/routeFail', body: new Uint8Array(0)}]);

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
            const batchBinaryRequest = createBatchBinaryRequest([
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
            const entries = deserializeBatchResponse(response.rawBody as Uint8Array);
            expect(entries).toHaveLength(2);
            expect(entries[0].routeId).toBe('/sayHello');
            expect(entries[0].statusCode).toBe(200);
            expect(entries[1].routeId).toBe('/sumTwo');
            expect(entries[1].statusCode).toBe(200);
        });

        it('dispatch a single route with binary format', async () => {
            await initMionRouter(routes, {serializer: 'binary'});

            const processBody = createBinaryRouteBody('/processArray', {processArray: [[1, 2, 3]]});

            const batchBinaryRequest = createBatchBinaryRequest([{routeId: '/processArray', body: processBody}]);

            const response = await dispatchBatchRoute(
                batchBinaryRequest,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {},
                {},
                SerializerModes.binary
            );

            expect(response.statusCode).toBe(StatusCodes.OK);
            const entries = deserializeBatchResponse(response.rawBody as Uint8Array);
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

            const batchBinaryRequest = createBatchBinaryRequest([
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

            const entries = deserializeBatchResponse(response.rawBody as Uint8Array);
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

            const batchEntries: {routeId: string; body: Uint8Array}[] = [];
            for (let i = 0; i < 5; i++) {
                const body = createBinaryRouteBody('/sumTwo', {sumTwo: [i]});
                batchEntries.push({routeId: '/sumTwo', body});
            }

            const batchBinaryRequest = createBatchBinaryRequest(batchEntries);

            const response = await dispatchBatchRoute(
                batchBinaryRequest,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {},
                {},
                SerializerModes.binary
            );

            expect(response.statusCode).toBe(StatusCodes.OK);
            const entries = deserializeBatchResponse(response.rawBody as Uint8Array);
            expect(entries).toHaveLength(5);
            for (let i = 0; i < 5; i++) {
                expect(entries[i].routeId).toBe('/sumTwo');
                expect(entries[i].statusCode).toBe(200);
            }
        });

        it('set correct content-type header for binary batch response', async () => {
            await initMionRouter(routes, {serializer: 'binary'});

            const sayHelloBody = createBinaryRouteBody('/sayHello', {sayHello: ['World']});
            const batchBinaryRequest = createBatchBinaryRequest([{routeId: '/sayHello', body: sayHelloBody}]);

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
