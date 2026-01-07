/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Routes} from '../types/general';
import {registerRoutes, initRouter} from '../router';
import {dispatchRoute} from '../dispatch';
import {route, headersHook, hook, rawHook} from './handlers';
import {MionHeaders} from '../types/context';
import {headersFromRecord} from './headers';
import {HandlerType, HeadersSubset} from '@mionkit/core';

describe('route & hooks init functions', () => {
    type RawRequest = {
        headers: MionHeaders;
        body: string;
    };

    const routes = {
        auth: headersHook(
            (ctx, h: HeadersSubset<'Authorization'>): HeadersSubset<'x-user-id'> => new HeadersSubset({'x-user-id': 'user-1234'})
        ),
        timestamp: hook((ctx, time: number): string => `time: ${time}`),
        nothing: rawHook((ctx, req: unknown, resp: unknown): void => undefined),
        print: route((ctx, name: string): string => `name: ${name}`),
    } satisfies Routes;

    it('should initialize a header hook object', () => {
        expect(routes.auth).toEqual({
            type: HandlerType.headerHook,
            handler: expect.any(Function),
        });
    });

    it('should initialize a hook object', () => {
        expect(routes.timestamp).toEqual({
            type: HandlerType.hook,
            handler: expect.any(Function),
        });
    });

    it('should initialize a rawHook object', () => {
        expect(routes.nothing).toEqual({
            type: HandlerType.rawHook,
            handler: expect.any(Function),
        });
    });

    it('should initialize a route object', () => {
        expect(routes.print).toEqual({
            type: HandlerType.route,
            handler: expect.any(Function),
        });
    });

    it('should be able to still use reflection an validate param', async () => {
        initRouter();
        registerRoutes(routes);

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
        expect(wrongResponse.body['@thrownErrors']?.auth).toEqual(expect.objectContaining({type: 'headers-validation-error'}));
        expect(wrongResponse.headers.get('Authorization')).toEqual(undefined);
    });
});
