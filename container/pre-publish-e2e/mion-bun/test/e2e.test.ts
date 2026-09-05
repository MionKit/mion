/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {afterAll, beforeAll, describe, expect, setDefaultTimeout, test} from 'bun:test';
import type {Server} from 'bun';
import {initClient} from '@mionjs/client';
import {isRpcError} from '@mionjs/core';
import {setBunHttpOpts, startBunServer} from '@mionjs/platform-bun';
// a value import: loading the routes file creates the router and initializes the routes
import '../src/routes.ts';
import type {BunServerApi} from '../src/routes.ts';

// The resolver spawns a process per program scan; give it room on a cold container.
setDefaultTimeout(60_000);

// Fixed, like the node consumer's 8086: this only ever runs inside the e2e
// container, where the port namespace is the lane's own.
const port = 8087;
const baseURL = `http://127.0.0.1:${port}`;

// @mionjs/client keeps its method metadata in Web Storage. bun has no localStorage,
// and the client's own fallback would quietly cover for that — define one so the
// real branch runs (mirrors the node consumer's memoryStorage stub).
class MemoryStorage implements Storage {
    private readonly entries = new Map<string, string>();
    get length(): number {
        return this.entries.size;
    }
    key(index: number): string | null {
        return [...this.entries.keys()][index] ?? null;
    }
    getItem(key: string): string | null {
        return this.entries.has(key) ? (this.entries.get(key) as string) : null;
    }
    setItem(key: string, value: string): void {
        this.entries.set(key, String(value));
    }
    removeItem(key: string): void {
        this.entries.delete(key);
    }
    clear(): void {
        this.entries.clear();
    }
}

let server: Server<any>;

describe('published mion packages under bun', () => {
    beforeAll(async () => {
        globalThis.localStorage = new MemoryStorage();
        globalThis.sessionStorage = new MemoryStorage();
        setBunHttpOpts({port});
        server = await startBunServer();
    });

    afterAll(() => {
        void server?.stop();
    });

    // Raw fetch first: no client package in the way, so a pass here means the Bun
    // runtime loader really injected the reflection the router needs. Without it
    // the routes file's mion.initRoutes would have thrown before the server ever listened.
    test('serves a route over plain fetch', async () => {
        const response = await fetch(`${baseURL}/sayHello`, {
            method: 'POST',
            body: JSON.stringify({sayHello: [{name: 'Ada', age: 36}]}),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({sayHello: 'Hello Ada'});
    });

    // Validation is the half that only works when the types were compiled in.
    test('rejects params of the wrong shape', async () => {
        const response = await fetch(`${baseURL}/calculateAge`, {
            method: 'POST',
            body: JSON.stringify({calculateAge: ['not a number']}),
        });
        const reply = (await response.json()) as Record<string, unknown>;
        expect(JSON.stringify(reply)).toContain('calculateAge');
        expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('round-trips JSON through the packaged client', async () => {
        const client = initClient<BunServerApi>({baseURL});
        const [greeting, error] = await client.routes.sayHello({name: 'Grace', age: 45}).call();
        expect(error).toBeUndefined();
        expect(greeting).toBe('Hello Grace');
    });

    test('surfaces a typed RpcError through the packaged client', async () => {
        const client = initClient<BunServerApi>({baseURL});
        const [result, error] = await client.routes.mayFail(true).call();
        expect(result).toBeUndefined();
        expect(isRpcError(error)).toBe(true);
        expect(error?.type).toBe('intentional-error');
    });

    test('round-trips the binary serializer through the packaged client', async () => {
        const client = initClient<BunServerApi>({baseURL});
        const [echoed, echoError] = await client.routes.binary.echo('Hello Binary Bun!').call();
        expect(echoError).toBeUndefined();
        expect(echoed).toBe('Hello Binary Bun!');

        const [user, userError] = await client.routes.binary.getSimpleUser('Alan', 41).call();
        expect(userError).toBeUndefined();
        expect(user).toEqual({name: 'Alan', age: 41});
    });
});
