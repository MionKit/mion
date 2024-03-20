/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router';
import {dispatchRoute} from './dispatch';
import {CallContext, MionHeaders} from './types/context';
import {Routes} from './types/general';
import {PublicRpcError, StatusCodes} from '@mionkit/core';
import {headersHook, hook, route} from './initFunctions';
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

    const auth = headersHook('Authorization', (ctx, token: string) => {
        if (token !== '1234') throw {statusCode: StatusCodes.FORBIDDEN, message: 'invalid auth token'};
    });

    const getDefaultRequest = (path: string, params?): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    describe('success path should', () => {
        it('read data from body & route', async () => {
            initRouter({sharedDataFactory: getSharedData});
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
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: headersFromRecord({Authorization: '1234'}),
                body: JSON.stringify({['changeUserName']: [{name: 'Leo', surname: 'Tungsten'}]}),
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
            expect(response.body).toEqual({['changeUserName']: {name: 'LOREM', surname: 'Tungsten'}});
        });

        // when the body is an array we assume it's a single route call and we have to reconstruct the body
        // http://my-api.com/route1 [p1, p2, p3] => {route1: [p1, p2, p3]}
        it('read data from body & route, when the body is a single array we should reconstruct full body request', async () => {
            initRouter({sharedDataFactory: getSharedData});
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

        it('headers are case insensitive, returned headers alway lowercase', async () => {
            initRouter({sharedDataFactory: getSharedData});
            const auth = headersHook('Authorization', (ctx, token: string): string => (token === '1234' ? 'MyUser' : 'Unknown'));
            registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: headersFromRecord({AuThoriZatioN: '1234'}),
                body: JSON.stringify({['changeUserName']: [{name: 'Leo', surname: 'Tungsten'}]}),
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
            expect(response.headers.get('authorization')).toEqual('MyUser');
        });

        it('if there are no params input field can be omitted', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({sayHello: route(() => 'hello')});

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
                sharedDataFactory: getSharedData,
                pathTransform: (req, path: string): string => {
                    const rPath = path.replace(`${options.prefix}/`, `${options.prefix}/${req.method.toLowerCase()}`);
                    return rPath;
                },
                prefix: 'api/v1',
            };
            initRouter(options);
            registerRoutes({
                getHello: route(() => 'hello'), // GET api/v1/Hello
            });

            const response = await dispatchRoute(publicPath, request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.body[routeId]).toEqual('hello');
        });

        // TODO: need an unit test that guarantees that if one routes has a dependency on the output of another hook it wil work
        it('support async handlers and ensure execution in order', async () => {
            initRouter({sharedDataFactory: getSharedData});
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
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('abcd', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/abcd', request.body, request.headers, headersFromRecord({}), request, {});
            // not found returns a different element in body as regular hooks or routes
            const error = response.body['/abcd'];
            expect(error).toEqual({
                statusCode: 404,
                name: 'Not Found',
                message: 'Route not found',
            } satisfies PublicRpcError);
        });

        it('return an error if data is missing from header', async () => {
            initRouter({sharedDataFactory: getSharedData});
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
                statusCode: 400,
                name: 'Validation Error',
                message: `Invalid params in 'auth', validation failed.`,
                errorData: expect.anything(),
            } satisfies PublicRpcError);
        });

        it('return an error if body is not the correct type', async () => {
            initRouter({sharedDataFactory: getSharedData});
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
            const error = response.body['mionParseJsonRequestBody'];
            expect(error).toEqual({
                statusCode: 400,
                name: 'Invalid Request Body',
                message: 'Wrong request body. Expecting an json body containing the route name and parameters.',
            });

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
            const errorResp = response2.body['mionParseJsonRequestBody'];
            expect(errorResp).toEqual({
                statusCode: 422,
                name: 'Parsing Request Body Error',
                message: expect.stringContaining('Invalid request body:'), // Nodejs error is slightly different depending on node version
            } satisfies PublicRpcError);
        });

        it('return an error if data is missing from body', async () => {
            initRouter({sharedDataFactory: getSharedData});
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
            const error = response.body['changeUserName'];
            expect(error).toEqual({
                statusCode: 400,
                name: `Validation Error`,
                message: `Invalid params in 'changeUserName', validation failed.`,
                errorData: [{expected: '[user:object<name:string, surname:string>]', path: ''}],
            } satisfies PublicRpcError);
        });

        it("return an error if can't deserialize", async () => {
            initRouter({sharedDataFactory: getSharedData});
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
                statusCode: 400,
                name: 'Serialization Error',
                message: `Invalid params 'getSameDate', can not deserialize. Parameters might be of the wrong type.`,
                errorData: {deserializeError: `Cannot read properties of undefined (reading 'date')`},
            } satisfies PublicRpcError);
        });

        it('return an error if validation fails, incorrect type', async () => {
            initRouter({sharedDataFactory: getSharedData});
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
            const expected: PublicRpcError = {
                name: 'Validation Error',
                statusCode: 400,
                message: `Invalid params in 'changeUserName', validation failed.`,
                errorData: [{expected: 'string', path: '/user/name'}],
            };
            const error = response.body['changeUserName'];
            expect(error).toEqual(expected);
        });

        it('return an error if validation fails, empty type', async () => {
            initRouter({sharedDataFactory: getSharedData});
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
            const expected: PublicRpcError = {
                name: 'Validation Error',
                statusCode: 400,
                message: `Invalid params in 'changeUserName', validation failed.`,
                errorData: [
                    {expected: 'string', path: '/user/name'},
                    {expected: 'string', path: '/user/surname'},
                ],
            };
            const error = response.body['changeUserName'];
            expect(error).toEqual(expected);
        });

        it('return an unknown error if a route fails with a generic error', async () => {
            initRouter({sharedDataFactory: getSharedData});

            const routeFail = route(() => {
                throw new Error('this is a generic error');
            });
            registerRoutes({routeFail});

            const request = getDefaultRequest('routeFail', []);

            const response = await dispatchRoute('/routeFail', request.body, request.headers, headersFromRecord({}), request, {});
            const error = response.body['routeFail'];
            expect(error).toEqual({
                statusCode: 500,
                name: 'Unknown Error',
                message: 'Unknown error in step 1 of route execution path.',
            } satisfies PublicRpcError);
        });

        // TODO: not sure how to make serialization/validation throw an error
        // eslint-disable-next-line jest/no-disabled-tests
        it.skip("return an error if can't validate", async () => {
            initRouter({sharedDataFactory: getSharedData});
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
                statusCode: 400,
                message: `Invalid params 'getSameDate', can not validate parameters.`,
                name: 'Validation Error',
            } satisfies PublicRpcError);
        });
    });
});
