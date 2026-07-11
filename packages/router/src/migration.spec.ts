/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ts-runtypes migration acceptance spec: a basic route must register, validate its
// params and serialize its response using the precompiled @ts-runtypes functions
// injected at the route() call sites (no deepkit, no runtime JIT, no AOT caches).

import {describe, it, expect, beforeEach} from 'vitest';
import {registerRoutes, resetRouter, initRouter, getRouteExecutable} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {MionHeaders} from './types/context.ts';
import {headersFromRecord} from './lib/headers.ts';
import {middleFn, route} from './lib/handlers.ts';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('ts-runtypes migration: basic route', () => {
    interface User {
        name: string;
        surname: string;
        birth: Date;
    }

    const sayHello = route((ctx, user: User, times: number): string => {
        return `hello ${user.name} ${user.surname} x${times}`;
    });

    // stringifyJson serializer → response.rawBody carries the jit-stringified body
    const getSameUser = route(
        (ctx, user: User): User => {
            return user;
        },
        {serializer: 'stringifyJson'}
    );

    const asyncDouble = route(async (ctx, val: number): Promise<number> => {
        return val * 2;
    });

    const sideEffect = route((ctx): void => undefined);

    const totals = {calls: 0};
    const countCalls = middleFn((ctx): void => {
        totals.calls++;
    });

    const getDefaultRequest = (id: string, params?: unknown[]): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify({[id]: params}),
    });

    const dispatch = (id: string, params?: unknown[]) => {
        const request = getDefaultRequest(id, params);
        return dispatchRoute(`/${id}`, request.body, request.headers, headersFromRecord({}), request, {});
    };

    beforeEach(() => resetRouter());

    it('registers a route with reflection data derived from injected markers', async () => {
        await initRouter({skipClientRoutes: true});
        await registerRoutes({sayHello});
        const executable = getRouteExecutable('sayHello');
        expect(executable).toBeTruthy();
        expect(executable?.paramNames).toEqual(['user', 'times']);
        expect(executable?.hasReturnData).toBe(true);
        expect(executable?.isAsync).toBe(false);
        expect(typeof executable?.paramsJitFns.isType.fn).toBe('function');
        expect(typeof executable?.returnJitFns.stringifyJson.fn).toBe('function');
    });

    it('dispatches a route: validates params and returns serialized response', async () => {
        await initRouter({skipClientRoutes: true});
        await registerRoutes({sayHello});

        const response = await dispatch('sayHello', [{name: 'Leo', surname: 'Tungsten', birth: new Date(0)}, 2]);
        expect(response.hasErrors).toBeFalsy();
        expect(response.body.sayHello).toEqual('hello Leo Tungsten x2');
    });

    it('revives Date params from the JSON body and serializes Date returns', async () => {
        await initRouter({skipClientRoutes: true});
        await registerRoutes({getSameUser});

        const birthIso = '1990-05-04T00:00:00.000Z';
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({getSameUser: [{name: 'Ann', surname: 'Beta', birth: birthIso}]}),
        };
        const response = await dispatchRoute('/getSameUser', request.body, request.headers, headersFromRecord({}), request, {});
        expect(response.hasErrors).toBeFalsy();
        // response.body values are already serialized (stringifyJson mode → rawBody string)
        expect(response.rawBody).toContain(birthIso);
        const parsed = JSON.parse(response.rawBody as string);
        expect(parsed.getSameUser).toEqual({name: 'Ann', surname: 'Beta', birth: birthIso});
    });

    it('rejects invalid params with a validation error', async () => {
        await initRouter({skipClientRoutes: true});
        await registerRoutes({sayHello});

        const response = await dispatch('sayHello', [{name: 42, surname: 'Tungsten', birth: new Date(0)}, 2]);
        expect(response.hasErrors).toBe(true);
        const bodyErrors = Object.values(response.body).filter(Boolean);
        expect(JSON.stringify(bodyErrors)).toContain('validation');
    });

    it('rejects wrong param arity', async () => {
        await initRouter({skipClientRoutes: true});
        await registerRoutes({sayHello});
        const response = await dispatch('sayHello', []);
        expect(response.hasErrors).toBe(true);
    });

    it('supports async handlers', async () => {
        await initRouter({skipClientRoutes: true});
        await registerRoutes({asyncDouble});
        expect(getRouteExecutable('asyncDouble')?.isAsync).toBe(true);
        const response = await dispatch('asyncDouble', [21]);
        expect(response.hasErrors).toBeFalsy();
        expect(response.body.asyncDouble).toEqual(42);
    });

    it('handles void routes (no return data)', async () => {
        await initRouter({skipClientRoutes: true});
        await registerRoutes({sideEffect});
        expect(getRouteExecutable('sideEffect')?.hasReturnData).toBe(false);
        const response = await dispatch('sideEffect', []);
        expect(response.hasErrors).toBeFalsy();
        expect(response.body.sideEffect).toBeUndefined();
    });

    it('runs middleFns in the chain', async () => {
        await initRouter({skipClientRoutes: true});
        totals.calls = 0;
        await registerRoutes({countCalls, sayHello});
        const response = await dispatch('sayHello', [{name: 'Leo', surname: 'T', birth: new Date(0)}, 1]);
        expect(response.hasErrors).toBeFalsy();
        expect(totals.calls).toBe(1);
    });
});
