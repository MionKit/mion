/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Routes} from './types/general';
import {registerRoutes, initRouter} from './router';
import {dispatchRoute} from './dispatch';
import {route, headersHook, hook, rawHook} from './initFunctions';
import {MionHeaders} from './types/context';
import {headersFromRecord} from './headers';
import {ProcedureType} from './types/procedures';

describe('route & hooks init functions', () => {
    type RawRequest = {
        headers: MionHeaders;
        body: string;
    };

    const routes = {
        auth: headersHook('Authorization', (ctx, auth: string): string => `auth: ${auth}`),
        timestamp: hook((ctx, time: number): string => `time: ${time}`),
        nothing: rawHook((ctx, req, resp): void => undefined),
        print: route((ctx, name: string): string => `name: ${name}`),
    } satisfies Routes;

    it('should initialize a header hook object', () => {
        expect(routes.auth).toEqual({
            type: ProcedureType.headerHook,
            headerName: 'Authorization',
            handler: expect.any(Function),
            options: {
                runOnError: false,
                useValidation: true,
                useSerialization: true,
                description: undefined,
            },
        });
    });

    it('should initialize a hook object', () => {
        expect(routes.timestamp).toEqual({
            type: ProcedureType.hook,
            handler: expect.any(Function),
            options: {
                runOnError: false,
                useValidation: true,
                useSerialization: true,
                description: undefined,
            },
        });
    });

    it('should initialize a rawHook object', () => {
        expect(routes.nothing).toEqual({
            type: ProcedureType.rawHook,
            handler: expect.any(Function),
            options: {
                runOnError: false,
                canReturnData: false,
                useValidation: false,
                useSerialization: false,
                description: undefined,
            },
        });
    });

    it('should initialize a route object', () => {
        expect(routes.print).toEqual({
            type: ProcedureType.route,
            handler: expect.any(Function),
            options: {
                runOnError: false,
                canReturnData: true,
                useValidation: true,
                useSerialization: true,
                description: undefined,
            },
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
        expect(response.headers.get('Authorization')).toEqual('auth: Bearer 123');

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
        expect(wrongResponse.body.auth).toEqual(expect.objectContaining({name: 'Validation Error', statusCode: 400}));
        expect(wrongResponse.headers.get('Authorization')).toEqual(undefined);
    });
});
