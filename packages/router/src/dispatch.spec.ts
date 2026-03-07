/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {registerRoutes, resetRouter, initRouter} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {CallContext, MionHeaders} from './types/context.ts';
import {Routes} from './types/general.ts';
import {HeadersSubset, RpcError, MION_ROUTES, StatusCodes} from '@mionjs/core';
import {headersFn, middleFn, route} from './lib/handlers.ts';
import {headersFromRecord} from './lib/headers.ts';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('Dispatch routes', () => {
    type SimpleUser = {
        name: string;
        surname: string;
    };
    type DataPoint = {
        date: Date;
    };
    const myApp = {
        cloudLogs: {
            log: (): null => null,
            error: (): null => null,
        },
        db: {
            changeUserName: (user: SimpleUser): SimpleUser => ({name: 'LOREM', surname: user.surname}),
        },
    };
    const shared = {auth: {me: null as any}};
    const getSharedData = (): typeof shared => shared;

    type Req = ReturnType<typeof getDefaultRequest>;

    const changeUserName = route((ctx, user: SimpleUser): SimpleUser => {
        return myApp.db.changeUserName(user);
    });

    const getSameDate = route((ctx, data: DataPoint): DataPoint => {
        return data;
    });

    const auth = headersFn((ctx, h: HeadersSubset<'Authorization'>): void | RpcError<'not-authorized'> => {
        const token = h.headers.Authorization;
        if (token !== '1234')
            return new RpcError({
                publicMessage: 'Not Authorized',
                type: 'not-authorized',
            });
    });

    const getDefaultRequest = (path: string, params?): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    describe('success path should', () => {
        it('read data from body & route', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const id = 'changeUserName';
            const request = getDefaultRequest(id, [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            expect(response.body[id]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('read data from header & middleFn', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: headersFromRecord({Authorization: '1234'}),
                body: JSON.stringify({changeUserName: [{name: 'Leo', surname: 'Tungsten'}]}),
            };

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            expect(response.hasErrors).toBeFalsy();
            expect(response.body).toEqual({changeUserName: {name: 'LOREM', surname: 'Tungsten'}});
        });

        // when the body is an array we assume it's a single route call and we have to reconstruct the body
        // http://my-api.com/route1 [p1, p2, p3] => {route1: [p1, p2, p3]}
        it('read data from body & route, when the body is a single array we should reconstruct full body request', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const id = 'changeUserName';
            const request = {
                headers: headersFromRecord({}),
                body: JSON.stringify([{name: 'Leo', surname: 'Tungsten'}]),
            };

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            expect(response.body[id]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('request and response headers are case insensitive', async () => {
            await initRouter({contextDataFactory: getSharedData});
            const auth = headersFn((ctx, h: HeadersSubset<'Authorization'>): HeadersSubset<'User-Id'> => {
                const token = h.headers.Authorization;
                return new HeadersSubset({'User-Id': token === '1234' ? 'MyUser-Id' : 'Unknown'});
            });
            await registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: headersFromRecord({AuThoriZatioN: '1234'}),
                body: JSON.stringify({changeUserName: [{name: 'Leo', surname: 'Tungsten'}]}),
            };

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.get('user-id')).toEqual('MyUser-Id');
        });

        it('should be able to accept request headers and regular rpc params', async () => {
            await initRouter({contextDataFactory: getSharedData});
            const auth = headersFn((ctx, h: HeadersSubset<'Authorization'>, userId: string): string => userId);
            await registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: headersFromRecord({AuThoriZatioN: 'bearer-token-1234'}),
                body: JSON.stringify({
                    auth: ['user-1234'],
                    changeUserName: [{name: 'Leo', surname: 'Tungsten'}],
                }),
            };

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            expect(response.hasErrors).toBeFalsy();
            expect(response.body.auth).toEqual('user-1234');
        });

        it('if there are no params input field can be omitted', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello: route((): string => 'hello')});

            const path = '/sayHello';
            const id = 'sayHello';
            const request1: RawRequest = {headers: headersFromRecord({}), body: ''};
            const request2: RawRequest = {headers: headersFromRecord({}), body: '{}'};
            const request3: RawRequest = {headers: headersFromRecord({}), body: '{"sayHello": null}'};

            const response1 = await dispatchRoute(path, request1.body, request1.headers, headersFromRecord({}), request1, {});
            const response2 = await dispatchRoute(path, request2.body, request2.headers, headersFromRecord({}), request2, {});
            const response3 = await dispatchRoute(path, request3.body, request3.headers, headersFromRecord({}), request3, {});

            expect(response1.body[id]).toEqual('hello');
            expect(response2.body[id]).toEqual('hello');
            expect(response3.body[id]).toEqual('hello');
        });

        it('transform the path before finding a route', async () => {
            const publicPath = '/api/v1/Hello';
            const method = 'GET';
            const routeId = 'getHello';
            const request = {
                method,
                ...getDefaultRequest(routeId, []),
            };
            const options = {
                contextDataFactory: getSharedData,
                pathTransform: (req, path: string): string => {
                    const rPath = path.replace(`${options.prefix}/`, `${options.prefix}/${req.method.toLowerCase()}`);
                    return rPath;
                },
                prefix: 'api/v1',
            };
            await initRouter(options);
            await registerRoutes({
                getHello: route((): string => 'hello'), // GET api/v1/Hello
            });

            const response = await dispatchRoute(publicPath, request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.body[routeId]).toEqual('hello');
        });

        // TODO: need an unit test that guarantees that if one routes has a dependency on the output of another middleFn it wil work
        it('support async handlers and ensure execution in order', async () => {
            await initRouter({contextDataFactory: getSharedData});
            const id = 'sumTwo';
            const routes = {
                sumTwo: route(async (ctx, val: number): Promise<number> => {
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve(val + 2);
                        }, 500);
                    });
                }),
                totals: middleFn((ctx: CallContext): string => {
                    // is sumTwo is not executed in order then `ctx.response.body.sumTwo` would be undefined here
                    return `the total is ${ctx.response.body[id]}`;
                }),
            } satisfies Routes;
            await registerRoutes(routes);

            const request = getDefaultRequest(id, [2]);
            const response = await dispatchRoute('/sumTwo', request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.body[id]).toEqual(4);
            expect(response.body['totals']).toEqual('the total is 4');
        });
    });

    describe('fail path should', () => {
        it('return an error if no route is found', async () => {
            await initRouter({contextDataFactory: getSharedData, skipClientRoutes: false});
            await registerRoutes({changeUserName});

            const request = getDefaultRequest('abcd', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/abcd', request.body, request.headers, headersFromRecord({}), request, {});
            // Not-found errors are returned by the not-found route and stored in thrownErrors
            const error = response.body[MION_ROUTES.thrownErrors]?.[MION_ROUTES.notFound];
            const expected = new RpcError({
                statusCode: StatusCodes.NOT_FOUND,
                type: 'route-not-found',
                publicMessage: 'Route not found',
            });
            expect(error).toEqual(expected);
        });

        it('return an error if data is missing from header', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({auth, changeUserName});

            const request = getDefaultRequest('changeUserName', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            // Validation errors are unexpected errors (not part of return type union)
            const error = response.body[MION_ROUTES.thrownErrors]?.auth;
            const expected = new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'validation-error',
                publicMessage: `Invalid params in 'auth', validation failed.`,
                errorData: expect.anything(),
            });
            expect(error).toEqual(expected);
        });

        it('return an error if body is not the correct type', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const request: RawRequest = {
                headers: headersFromRecord({}),
                body: '1234',
            };

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const error = response.body[MION_ROUTES.thrownErrors]?.['mionDeserializeRequest'];
            const expected = new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'invalid-request-body',
                publicMessage: 'Wrong request body. Expecting a body containing the route name and parameters.',
            });
            expect(error).toEqual(expected);

            const request2: RawRequest = {
                headers: headersFromRecord({}),
                body: '{-12',
            };

            const response2 = await dispatchRoute(
                '/changeUserName',
                request2.body,
                request2.headers,
                headersFromRecord({}),
                request2,
                {}
            );
            const errorResp = response2.body[MION_ROUTES.thrownErrors]?.['mionDeserializeRequest'];
            expect(errorResp).toMatchObject({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                'mion@isΣrrθr': true,
                type: 'parsing-json-request-error',
                publicMessage: expect.stringContaining('Invalid json request body:'), // Nodejs error is slightly different depending on node version
            });
        });

        it('return an error if data is missing from body', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const request = getDefaultRequest('changeUserName', []);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            // Validation errors are unexpected errors (not part of return type union)
            const error = response.body[MION_ROUTES.thrownErrors]?.changeUserName;
            const expected = new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: `validation-error`,
                publicMessage: `Invalid params in 'changeUserName', validation failed.`,
                errorData: {typeErrors: [{expected: 'object', path: [0]}]},
            });
            expect(error).toEqual(expected);
        });

        it("return an error if can't deserialize method", async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({getSameDate});

            const request = getDefaultRequest('getSameDate', []);

            const response = await dispatchRoute(
                '/getSameDate',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const error = response.body[MION_ROUTES.thrownErrors]?.['getSameDate'];
            expect(error).toMatchObject({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                'mion@isΣrrθr': true,
                type: 'serialization-error',
                publicMessage: `Invalid params 'getSameDate', can not deserialize. Parameters might be of the wrong type.`,
                errorData: {deserializeError: `Cannot read properties of undefined (reading 'date')`},
            });
        });

        it('return an error if method validation fails, incorrect type', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const wrongSimpleUser: SimpleUser = {name: true, surname: 'Smith'} as any;
            const request = getDefaultRequest('changeUserName', [wrongSimpleUser]);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const expected = new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'validation-error',
                publicMessage: `Invalid params in 'changeUserName', validation failed.`,
                errorData: {typeErrors: [{expected: 'string', path: [0, 'name']}]},
            });
            // Validation errors are unexpected errors (not part of return type union)
            const error = response.body[MION_ROUTES.thrownErrors]?.changeUserName;
            expect(error).toEqual(expected);
        });

        it('return an error if method validation fails, empty type', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const request = getDefaultRequest('changeUserName', [{}]);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const expected = new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'validation-error',
                publicMessage: `Invalid params in 'changeUserName', validation failed.`,
                errorData: {
                    typeErrors: [
                        {expected: 'string', path: [0, 'name']},
                        {expected: 'string', path: [0, 'surname']},
                    ],
                },
            });
            // Validation errors are unexpected errors (not part of return type union)
            const error = response.body[MION_ROUTES.thrownErrors]?.changeUserName;
            expect(error).toEqual(expected);
        });

        it('return an unknown error if a route fails with a generic error', async () => {
            await initRouter({contextDataFactory: getSharedData});

            const routeFail = route((): void => {
                throw new Error('this is a generic error');
            });
            await registerRoutes({routeFail});

            const request = getDefaultRequest('routeFail', []);

            const response = await dispatchRoute('/routeFail', request.body, request.headers, headersFromRecord({}), request, {});
            const error = response.body[MION_ROUTES.thrownErrors]?.['routeFail'];
            expect(error).toMatchObject({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                'mion@isΣrrθr': true,
                type: 'unknown-error',
                publicMessage: 'Unknown error in handler "routeFail" of route ExecutionChain.',
            });
        });
    });

    describe('parsedBody (a js object already parsed from json) functionality should', () => {
        it('use parsedBody when provided instead of parsing rawBody', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const id = 'changeUserName';
            const jsBody = {[id]: [{name: 'Leo', surname: 'Tungsten'}]};
            const rawBody = jsBody;

            const response = await dispatchRoute(
                '/changeUserName',
                rawBody,
                headersFromRecord({}),
                headersFromRecord({}),
                {headers: headersFromRecord({}), body: jsBody},
                {}
            );
            expect(response.body[id]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('handle parsedBody with Date objects correctly', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({getSameDate});

            const id = 'getSameDate';
            const testDate = new Date('2022-04-22T00:17:00.000Z');
            const jsBody = {[id]: [{date: testDate}]};
            const rawBody = jsBody;

            const response = await dispatchRoute(
                '/getSameDate',
                rawBody,
                headersFromRecord({}),
                headersFromRecord({}),
                {headers: headersFromRecord({}), body: jsBody},
                {}
            );
            // When using parsedBody, Date objects are preserved (not serialized to strings)
            expect(response.body[id]).toEqual({date: testDate});
        });

        it('fallback to parsing rawBody when parsedBody is not provided', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const id = 'changeUserName';
            const request = getDefaultRequest(id, [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            expect(response.body[id]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('handle empty rawBody and no parsedBody correctly', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName});

            const response = await dispatchRoute(
                '/changeUserName',
                '', // empty rawBody (falsy)
                headersFromRecord({}),
                headersFromRecord({}),
                {headers: headersFromRecord({}), body: ''},
                {}
            );
            // When rawBody is empty and parsedBody is undefined, parseRequestBody returns early
            // leaving request.body as empty object, then route fails validation (correct behavior)
            expect(response.hasErrors).toBeTruthy();
            // Validation errors are unexpected errors (not part of return type union)
            expect(response.body[MION_ROUTES.thrownErrors]?.changeUserName).toMatchObject({
                'mion@isΣrrθr': true,
                type: 'validation-error',
            });
        });
    });
});

describe('Route errors should', () => {
    it('automatically generate error ids when RouteOptions autoGenerateErrorId is set to true', async () => {
        resetRouter();
        await initRouter({autoGenerateErrorId: true});
        const error = new RpcError({publicMessage: 'error', type: 'test-error'});
        expect(typeof error.id).toEqual('string');

        resetRouter();
        await initRouter({autoGenerateErrorId: false});
        const error2 = new RpcError({publicMessage: 'error', type: 'test-error'});
        expect(error2.id).toEqual(undefined);
    });
});
