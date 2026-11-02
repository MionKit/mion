import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {dirname, resolve} from 'path';
import {Miniflare} from 'miniflare';
import {runEdgeBatch} from '../src/client.ts';

// The Worker `vite build` made from the published packages, booted on workerd with no `nodejs_compat` and no
// `process` polyfill: what a user deploying with the documented config gets.
const WORKER_PATH = resolve(__dirname, '../dist/worker.js');

let mf: Miniflare;
let baseURL: string;

beforeAll(async () => {
    mf = new Miniflare({
        modules: true,
        scriptPath: WORKER_PATH,
        // otherwise miniflare names the module relative to cwd and workerd refuses to boot
        modulesRoot: dirname(WORKER_PATH),
        compatibilityDate: '2024-11-12',
    });
    baseURL = (await mf.ready).origin;
});

afterAll(async () => {
    await mf?.dispose();
});

async function post(path: string, body: unknown): Promise<Record<string, any>> {
    const response = await fetch(`${baseURL}${path}`, {method: 'POST', body: JSON.stringify(body)});
    return (await response.json()) as Record<string, any>;
}

describe('a Worker built from the published packages runs on workerd', () => {
    it('answers a route', async () => {
        expect(await post('/sayHello', {sayHello: ['Worker']})).toEqual({sayHello: 'Hello Worker!'});
    });

    it('answers a batch compiled from the client code', async () => {
        expect(await runEdgeBatch(baseURL)).toEqual({sum: 7, greeting: 'Hello Edge!', errors: [undefined, undefined]});
    });

    it('answers a validation error', async () => {
        const body = await post('/saveUser', {saveUser: [{name: 'Ann', age: 'old'}]});
        expect(body['@thrownErrors'].saveUser).toMatchObject({type: 'validation-error'});
    });
});
