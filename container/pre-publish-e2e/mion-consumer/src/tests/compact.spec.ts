/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient} from '@mionjs/client';
import {isRpcError, HeadersSubset} from '@mionjs/core';
import {TestServerApi} from '../server/server.ts';
import {describe, it, expect, beforeEach, afterEach} from 'vitest';


function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

const TEST_SERVER_PORT = 8086;
const baseURL = `http://localhost:${TEST_SERVER_PORT}`;

describe('Compact Serialization E2E', () => {
    type MyApi = TestServerApi;
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');

    let routes: ReturnType<typeof initClient<MyApi>>['routes'];
    let middleFns: ReturnType<typeof initClient<MyApi>>['middleFns'];

    beforeEach(() => {
        const client = initClient<MyApi>({baseURL});
        routes = client.routes;
        middleFns = client.middleFns;
        middleFns.auth(authHeaders).prefill();
    });

    afterEach(async () => {
        await middleFns.auth(authHeaders).removePrefill();
    });

    it('should serialize and deserialize string echo', async () => {
        const [result, error] = await routes.compact.echo('Hello Compact World!').call();
        expect(error).toBeUndefined();
        expect(result).toBe('Hello Compact World!');
    });

    it('should serialize and deserialize number addition', async () => {
        const [result, error] = await routes.compact.addNumbers(10, 25).call();
        expect(error).toBeUndefined();
        expect(result).toBe(35);
    });

    it('should serialize and deserialize object return', async () => {
        const [result, error] = await routes.compact.getSimpleUser('Alice', 28).call();
        expect(error).toBeUndefined();
        expect(result).toEqual({name: 'Alice', age: 28});
    });

    it('should handle optional parameters with value', async () => {
        const [result, error] = await routes.compact.greet('World', 'Hi').call();
        expect(error).toBeUndefined();
        expect(result).toBe('Hi, World!');
    });

    it('should handle optional parameters without value', async () => {
        const [result, error] = await routes.compact.greet('World').call();
        expect(error).toBeUndefined();
        expect(result).toBe('Hello, World!');
    });

    it('should handle nullable return (found)', async () => {
        const [result, error] = await routes.compact.findUser('user-123').call();
        expect(error).toBeUndefined();
        expect(result).toEqual({name: 'Found User', age: 30});
    });

    it('should handle nullable return (null)', async () => {
        const [result, error] = await routes.compact.findUser('not-found').call();
        expect(error).toBeUndefined();
        expect(result).toEqual(null);
    });

    it('should handle RpcError return type (success)', async () => {
        const [result, error] = await routes.compact.mayFail(false).call();
        expect(error).toBeUndefined();
        expect(result).toBe('Success!');
    });

    it('should handle RpcError return type (error)', async () => {
        const [result, error] = await routes.compact.mayFail(true).call();
        expect(result).toBeUndefined();
        expect(error).not.toBeUndefined();
        expect(isRpcError(error)).toBe(true);
        expect(error?.type).toBe('intentional-error');
    });

    it('carries a plain middleFn (no encoder of its own) on the compact wire', async () => {
        const [result, error, fatal, middleFnsResults] = await routes.compact.echo('test').call({
            middleFns: {
                auth: middleFns.auth(authHeaders),
                compactSession: middleFns.compact.session('valid-token'),
            },
        });

        expect(error).toBeUndefined();
        expect(fatal).toBeUndefined();
        expect(result).toBe('test');
        expect(middleFnsResults?.compactSession).toEqual({valid: true, userId: 'user-123'});
    });
});
