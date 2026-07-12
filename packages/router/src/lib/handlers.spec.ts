/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {Routes} from '../types/general.ts';
import {registerRoutes, initRouter} from '../router.ts';
import {dispatchRoute} from '../dispatch.ts';
import {route, headersFn, middleFn, rawMiddleFn, query, mutation} from './handlers.ts';
import {MionHeaders} from '../types/context.ts';
import {headersFromRecord} from './headers.ts';
import {HandlerType, HeadersSubset} from '@mionjs/core';

describe('route & middleFns init functions', () => {
    type RawRequest = {
        headers: MionHeaders;
        body: string;
    };

    const routes = {
        auth: headersFn(
            (ctx, h: HeadersSubset<'Authorization'>): HeadersSubset<'x-user-id'> => new HeadersSubset({'x-user-id': 'user-1234'})
        ),
        timestamp: middleFn((ctx, time: number): string => `time: ${time}`),
        nothing: rawMiddleFn((ctx, req: unknown, resp: unknown): void => undefined),
        print: route((ctx, name: string): string => `name: ${name}`),
    } satisfies Routes;

    it('should initialize a Headers MiddleFn object', () => {
        expect(routes.auth).toEqual({
            type: HandlerType.headersMiddleFn,
            handler: expect.any(Function),
        });
    });

    // Since the ts-runtypes migration, factory defs also carry the build-time-injected
    // type functions payload (rtFns): compiled fn tuples per side + the two type id handles.
    const expectedRtFns = {
        paramsFns: expect.any(Array),
        returnFns: expect.any(Array),
        paramsId: expect.anything(),
        returnId: expect.anything(),
    };

    it('should initialize a middleFn object', () => {
        expect(routes.timestamp).toEqual({
            type: HandlerType.middleFn,
            handler: expect.any(Function),
            rtFns: expectedRtFns,
        });
    });

    it('should initialize a rawMiddleFn object', () => {
        expect(routes.nothing).toEqual({
            type: HandlerType.rawMiddleFn,
            handler: expect.any(Function),
        });
    });

    it('should initialize a route object', () => {
        expect(routes.print).toEqual({
            type: HandlerType.route,
            handler: expect.any(Function),
            rtFns: expectedRtFns,
        });
    });

    it('should initialize a query object with isMutation: false', () => {
        const q = query((ctx, id: number): string => `id: ${id}`);
        expect(q).toEqual({
            type: HandlerType.route,
            handler: expect.any(Function),
            options: {isMutation: false},
            rtFns: expectedRtFns,
        });
    });

    it('should initialize a mutation object with isMutation: true', () => {
        const m = mutation((ctx, name: string): string => `name: ${name}`);
        expect(m).toEqual({
            type: HandlerType.route,
            handler: expect.any(Function),
            options: {isMutation: true},
            rtFns: expectedRtFns,
        });
    });

    it('route() should not set isMutation (undefined)', () => {
        const r = route((ctx, name: string): string => `name: ${name}`);
        expect(r.options).toBeUndefined();
    });

    it('should be able to still use reflection an validate param', async () => {
        await initRouter();
        await registerRoutes(routes);

        // send all correct parameters
        const request: RawRequest = {
            headers: headersFromRecord({Authorization: 'Bearer 123'}),
            body: JSON.stringify({
                timestamp: [123],
                print: ['John'],
            }),
        };

        const response = await dispatchRoute('/print', request.body, request.headers, headersFromRecord({}), request, {});
        expect(response.body).toEqual({timestamp: 'time: 123', print: 'name: John'});
        expect(response.headers.get('x-user-id')).toEqual('user-1234');

        // send all incorrect parameters and all of them should fail
        const wrongRequest: RawRequest = {
            headers: headersFromRecord({Authorization: null as any}),
            body: JSON.stringify({
                timestamp: ['hello'],
                print: [123],
            }),
        };

        const wrongResponse = await dispatchRoute(
            '/print',
            wrongRequest.body,
            wrongRequest.headers,
            headersFromRecord({}),
            wrongRequest,
            {}
        );
        expect(wrongResponse.body['@thrownErrors']?.auth).toEqual(expect.objectContaining({type: 'validation-error'}));
        expect(wrongResponse.headers.get('Authorization')).toEqual(undefined);
    });
});
