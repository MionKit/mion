/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router';
import {dispatchRoute} from './dispatch';
import {CallContext, MionHeaders} from './types/context';
import {HeadersList} from './types/HeadersList';
import {Routes} from './types/general';
import {PublicRpcError, RpcError} from '@mionkit/core';
import {StatusCodes} from '@mionkit/core';
import {headersHook, hook, route} from './handlers';
import {headersFromRecord} from './headers';

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

    const auth = headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
        if (token !== '1234') throw {statusCode: StatusCodes.FORBIDDEN, message: 'invalid auth token'};
    });

    const getDefaultRequest = (path: string, params?): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    describe('success path should', () => {
        it('read data from body & route', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

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

        it('read data from header & hook', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({auth, changeUserName});

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
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

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
            initRouter({contextDataFactory: getSharedData});
            const auth = headersHook(
                (ctx, [token]: HeadersList<['Authorization']>): HeadersList<['User-Id']> =>
                    token === '1234' ? ['MyUser-Id'] : ['Unknown']
            );
            registerRoutes({auth, changeUserName});

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
            initRouter({contextDataFactory: getSharedData});
            const auth = headersHook((ctx, [token]: HeadersList<['Authorization']>, userId: string): string => userId);
            registerRoutes({auth, changeUserName});

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
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({sayHello: route((): string => 'hello')});

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
            initRouter(options);
            registerRoutes({
                getHello: route((): string => 'hello'), // GET api/v1/Hello
            });

            const response = await dispatchRoute(publicPath, request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.body[routeId]).toEqual('hello');
        });

        // TODO: need an unit test that guarantees that if one routes has a dependency on the output of another hook it wil work
        it('support async handlers and ensure execution in order', async () => {
            initRouter({contextDataFactory: getSharedData});
            const id = 'sumTwo';
            const routes = {
                sumTwo: route(async (ctx, val: number): Promise<number> => {
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve(val + 2);
                        }, 500);
                    });
                }),
                totals: hook((ctx: CallContext): string => {
                    // is sumTwo is not executed in order then `ctx.response.body.sumTwo` would be undefined here
                    return `the total is ${ctx.response.body[id]}`;
                }),
            } satisfies Routes;
            registerRoutes(routes);

            const request = getDefaultRequest(id, [2]);
            const response = await dispatchRoute('/sumTwo', request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.body[id]).toEqual(4);
            expect(response.body['totals']).toEqual('the total is 4');
        });
    });

    describe('fail path should', () => {
        it('return an error if no route is found', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('abcd', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/abcd', request.body, request.headers, headersFromRecord({}), request, {});
            // not found returns a different element in body as regular hooks or routes
            const error = response.body['/abcd'];
            expect(error).toEqual({
                'mion:isΣrrθr': true,
                statusCode: 404,
                type: 'route-not-found',
                publicMessage: 'Route not found',
            } satisfies PublicRpcError<'route-not-found'>);
        });

        it('return an error if data is missing from header', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({auth, changeUserName});

            const request = getDefaultRequest('changeUserName', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const error = response.body?.auth;
            expect(error).toEqual({
                'mion:isΣrrθr': true,
                statusCode: 400,
                type: 'headers-validation-error',
                publicMessage: `Invalid headers in 'auth', validation failed.`,
                errorData: expect.anything(),
            } satisfies PublicRpcError<'headers-validation-error'>);
        });

        it('return an error if body is not the correct type', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

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
            const error = response.body['mionDeserializeRequest'];
            expect(error).toEqual({
                'mion:isΣrrθr': true,
                statusCode: 400,
                type: 'invalid-request-body',
                publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
            } satisfies PublicRpcError<'invalid-request-body'>);

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
            const errorResp = response2.body['mionDeserializeRequest'];
            expect(errorResp).toEqual({
                'mion:isΣrrθr': true,
                type: 'parsing-json-request-error',
                statusCode: 422,
                publicMessage: expect.stringContaining('Invalid json request body:'), // Nodejs error is slightly different depending on node version
            } satisfies PublicRpcError<'parsing-json-request-error'>);
        });

        it('return an error if data is missing from body', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('changeUserName', []);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const error = response.body.changeUserName;
            expect(error).toEqual({
                'mion:isΣrrθr': true,
                statusCode: 400,
                type: `validation-error`,
                publicMessage: `Invalid params in 'changeUserName', validation failed.`,
                errorData: [{expected: 'object', path: [0]}],
            } satisfies PublicRpcError<'validation-error'>);
        });

        it("return an error if can't deserialize", async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({getSameDate});

            const request = getDefaultRequest('getSameDate', []);

            const response = await dispatchRoute(
                '/getSameDate',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const error = response.body['getSameDate'];
            expect(error).toEqual({
                'mion:isΣrrθr': true,
                statusCode: 400,
                type: 'serialization-error',
                publicMessage: `Invalid params 'getSameDate', can not deserialize. Parameters might be of the wrong type.`,
                errorData: {deserializeError: `Cannot read properties of undefined (reading 'date')`},
            } satisfies PublicRpcError<'serialization-error'>);
        });

        it('return an error if validation fails, incorrect type', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

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
            const expected: PublicRpcError<'validation-error'> = {
                'mion:isΣrrθr': true,
                type: 'validation-error',
                statusCode: 400,
                publicMessage: `Invalid params in 'changeUserName', validation failed.`,
                errorData: [{expected: 'string', path: [0, 'name']}],
            };
            const error = response.body.changeUserName;
            expect(error).toEqual(expected);
        });

        it('return an error if validation fails, empty type', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('changeUserName', [{}]);

            const response = await dispatchRoute(
                '/changeUserName',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const expected: PublicRpcError<'validation-error'> = {
                'mion:isΣrrθr': true,
                type: 'validation-error',
                statusCode: 400,
                publicMessage: `Invalid params in 'changeUserName', validation failed.`,
                errorData: [
                    {expected: 'string', path: [0, 'name']},
                    {expected: 'string', path: [0, 'surname']},
                ],
            };
            const error = response.body.changeUserName;
            expect(error).toEqual(expected);
        });

        it('return an unknown error if a route fails with a generic error', async () => {
            initRouter({contextDataFactory: getSharedData});

            const routeFail = route((): void => {
                throw new Error('this is a generic error');
            });
            registerRoutes({routeFail});

            const request = getDefaultRequest('routeFail', []);

            const response = await dispatchRoute('/routeFail', request.body, request.headers, headersFromRecord({}), request, {});
            const error = response.body['routeFail'];
            expect(error).toEqual({
                'mion:isΣrrθr': true,
                statusCode: 500,
                type: 'unknown-error',
                publicMessage: 'Unknown error in handler "routeFail" of route execution path.',
            } satisfies PublicRpcError<'unknown-error'>);
        });

        // TODO: not sure how to make serialization/validation throw an error
        // eslint-disable-next-line jest/no-disabled-tests
        it.skip("return an error if can't validate", async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({getSameDate});

            const request = getDefaultRequest('getSameDate', [1234]);

            const response = await dispatchRoute(
                '/getSameDate',
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                {}
            );
            const error = response.body['getSameDate'];
            expect(error).toEqual({
                'mion:isΣrrθr': true,
                statusCode: 400,
                publicMessage: `Invalid params 'getSameDate', can not validate parameters.`,
                type: 'validation-error',
            } satisfies PublicRpcError<'validation-error'>);
        });
    });

    describe('parsedBody (a js object already parsed from json) functionality should', () => {
        it('use parsedBody when provided instead of parsing rawBody', async () => {
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

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
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({getSameDate});

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
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

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
            initRouter({contextDataFactory: getSharedData});
            registerRoutes({changeUserName});

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
            expect(response.body.changeUserName).toMatchObject({
                'mion:isΣrrθr': true,
                type: 'validation-error',
                statusCode: 400,
            });
        });
    });
});

describe('Route errors should', () => {
    it('automatically generate error ids when RouteOptions autoGenerateErrorId is set to true', () => {
        resetRouter();
        initRouter({autoGenerateErrorId: true});
        const error = new RpcError({statusCode: 400, publicMessage: 'error', type: 'test-error'});
        expect(typeof error.id).toEqual('string');

        resetRouter();
        initRouter({autoGenerateErrorId: false});
        const error2 = new RpcError({statusCode: 400, publicMessage: 'error', type: 'test-error'});
        expect(error2.id).toEqual(undefined);
    });
});
