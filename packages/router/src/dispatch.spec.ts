/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router';
import {dispatchRoute} from './dispatch';
import {CallContext, RawRequest, Route, Routes} from './types';
import {AnonymRpcError, RpcError, StatusCodes} from '@mionkit/core';

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

    const changeUserName = (ctx, user: SimpleUser) => {
        return myApp.db.changeUserName(user);
    };

    const getSameDate = (ctx, data: DataPoint): DataPoint => {
        return data;
    };

    const auth = {
        headerName: 'Authorization',
        headerHook: (ctx, token: string) => {
            if (token !== '1234') throw {statusCode: StatusCodes.FORBIDDEN, message: 'invalid auth token'};
        },
    };

    const getDefaultRequest = (path: string, params?): RawRequest => ({
        headers: {},
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    describe('success path should', () => {
        it('read data from body & route', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const id = 'changeUserName';
            const request = getDefaultRequest(id, [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/changeUserName', request, {});
            expect(response.body[id]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('read data from header & hook', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: {Authorization: '1234'},
                body: JSON.stringify({['changeUserName']: [{name: 'Leo', surname: 'Tungsten'}]}),
            };

            const response = await dispatchRoute('/changeUserName', request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(response.body).toEqual({['changeUserName']: {name: 'LOREM', surname: 'Tungsten'}});
        });

        it('use soft serialization for header params', async () => {
            initRouter({sharedDataFactory: getSharedData});
            const isTrue = {
                canReturnData: true,
                headerName: 'isTrue',
                headerHook: (ctx, isBoolean: boolean) => isBoolean,
            };
            registerRoutes({isTrue, changeUserName});

            const request: RawRequest = {
                headers: {isTrue: 'false'},
                body: JSON.stringify({['changeUserName']: [{name: 'Leo', surname: 'Tungsten'}]}),
            };

            const response = await dispatchRoute('/changeUserName', request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(response.headers['istrue']).toEqual(false);
        });

        it('headers are case insensitive, returned headers alway lowercase', async () => {
            initRouter({sharedDataFactory: getSharedData});
            const auth = {
                canReturnData: true,
                headerName: 'Authorization',
                headerHook: (ctx, token: string): string => (token === '1234' ? 'MyUser' : 'Unknown'),
            };
            registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: {AuThoriZatioN: '1234'},
                body: JSON.stringify({['changeUserName']: [{name: 'Leo', surname: 'Tungsten'}]}),
            };

            const response = await dispatchRoute('/changeUserName', request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.authorization).toEqual('MyUser');
        });

        it('if there are no params input field can be omitted', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({sayHello: () => 'hello'});

            const path = '/sayHello';
            const id = 'sayHello';
            const request1: RawRequest = {headers: {}, body: ''};
            const request2: RawRequest = {headers: {}, body: '{}'};
            const request3: RawRequest = {headers: {}, body: '{"sayHello": null}'};

            const response1 = await dispatchRoute(path, request1, {});
            const response2 = await dispatchRoute(path, request2, {});
            const response3 = await dispatchRoute(path, request3, {});

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
                    // publicPath = api/v1/sayHello
                    // routePath = api/v1/getHello
                    const rPath = path.replace(`${options.prefix}/`, `${options.prefix}/${req.method.toLowerCase()}`);
                    return rPath;
                },
                prefix: 'api/v1',
            };
            initRouter(options);
            registerRoutes({
                getHello: () => 'hello', // GET api/v1/Hello
            });

            const response = await dispatchRoute(publicPath, request, {});
            expect(response.body[routeId]).toEqual('hello');
        });

        // TODO: need an unit test that guarantees that if one routes has a dependency on the output of another hook it wil work
        it('support async handlers and ensure execution in order', async () => {
            initRouter({sharedDataFactory: getSharedData});
            const id = 'sumTwo';
            const routes = {
                sumTwo: async (ctx, val: number): Promise<number> => {
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve(val + 2);
                        }, 500);
                    });
                },
                totals: {
                    canReturnData: true,
                    hook: (ctx: CallContext): string => {
                        // is sumTwo is not executed in order then `ctx.response.body.sumTwo` would be undefined here
                        return `the total is ${ctx.response.body[id]}`;
                    },
                },
            } satisfies Routes;
            registerRoutes(routes);

            const request = getDefaultRequest(id, [2]);
            const response = await dispatchRoute('/sumTwo', request, {});
            expect(response.body[id]).toEqual(4);
            expect(response.body['totals']).toEqual('the total is 4');
        });
    });

    describe('fail path should', () => {
        it('return an error if no route is found', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('abcd', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/abcd', request, {});
            // not found returns a different element in body as regular hooks or routes
            const error = response.body['/abcd'];
            expect(error).toEqual({
                statusCode: 404,
                name: 'Not Found',
                message: 'Route not found',
            } satisfies AnonymRpcError);
        });

        it('return an error if data is missing from header', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({auth, changeUserName});

            const request = getDefaultRequest('changeUserName', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/changeUserName', request, {});
            const error = response.body?.auth;
            expect(error).toEqual({
                statusCode: 400,
                name: 'Validation Error',
                message: `Invalid params in 'auth', validation failed.`,
                errorData: expect.anything(),
            } satisfies AnonymRpcError);
        });

        it('return an error if body is not the correct type', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request: RawRequest = {
                headers: {},
                body: '1234',
            };

            const response = await dispatchRoute('/changeUserName', request, {});
            const error = response.body['mionParseJsonRequestBody'];
            expect(error).toEqual({
                statusCode: 400,
                name: 'Invalid Request Body',
                message: 'Wrong request body. Expecting an json body containing the route name and parameters.',
            });

            const request2: RawRequest = {
                headers: {},
                body: '{-12',
            };

            const response2 = await dispatchRoute('/changeUserName', request2, {});
            const errorResp = response2.body['mionParseJsonRequestBody'];
            expect(errorResp).toEqual({
                statusCode: 422,
                name: 'Parsing Request Body Error',
                message: 'Invalid request body: Unexpected number in JSON at position 1',
            } satisfies AnonymRpcError);
        });

        it('return an error if data is missing from body', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('changeUserName', []);

            const response = await dispatchRoute('/changeUserName', request, {});
            const error = response.body['changeUserName'];
            expect(error).toEqual({
                statusCode: 400,
                name: `Validation Error`,
                message: `Invalid params in 'changeUserName', validation failed.`,
                errorData: expect.objectContaining({
                    hasErrors: true,
                    totalErrors: 1,
                }),
            } satisfies AnonymRpcError);
        });

        it("return an error if can't deserialize", async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({getSameDate});

            const request = getDefaultRequest('getSameDate', [1234]);

            const response = await dispatchRoute('/getSameDate', request, {});
            const error = response.body['getSameDate'];
            expect(error).toEqual({
                statusCode: 400,
                name: 'Serialization Error',
                message: `Invalid params 'getSameDate', can not deserialize. Parameters might be of the wrong type.`,
                errorData: expect.anything(),
            } satisfies AnonymRpcError);
        });

        it('return an error if validation fails, incorrect type', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const wrongSimpleUser: SimpleUser = {name: true, surname: 'Smith'} as any;
            const request = getDefaultRequest('changeUserName', [wrongSimpleUser]);

            const response = await dispatchRoute('/changeUserName', request, {});
            const expected: AnonymRpcError = {
                name: 'Validation Error',
                statusCode: 400,
                message: `Invalid params in 'changeUserName', validation failed.`,
                errorData: expect.objectContaining({
                    hasErrors: true,
                    totalErrors: 1,
                    errors: expect.any(Array),
                }),
            };
            const error = response.body['changeUserName'];
            expect(error).toEqual(expected);
        });

        it('return an error if validation fails, empty type', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('changeUserName', [{}]);

            const response = await dispatchRoute('/changeUserName', request, {});
            const expected: AnonymRpcError = {
                name: 'Validation Error',
                statusCode: 400,
                message: `Invalid params in 'changeUserName', validation failed.`,
                errorData: expect.objectContaining({
                    hasErrors: true,
                    totalErrors: 2,
                    errors: expect.any(Array),
                }),
            };
            const error = response.body['changeUserName'];
            expect(error).toEqual(expected);
        });

        it('return an unknown error if a route fails with a generic error', async () => {
            initRouter({sharedDataFactory: getSharedData});

            const routeFail: Route = () => {
                throw new Error('this is a generic error');
            };
            registerRoutes({routeFail});

            const request = getDefaultRequest('routeFail', []);

            const response = await dispatchRoute('/routeFail', request, {});
            const error = response.body['routeFail'];
            expect(error).toEqual({
                statusCode: 500,
                name: 'Unknown Error',
                message: 'Unknown error in step 1 of route execution path.',
            } satisfies AnonymRpcError);
        });

        // TODO: not sure how to make serialization/validation throw an error
        // eslint-disable-next-line jest/no-disabled-tests
        it.skip("return an error if can't validate", async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({getSameDate});

            const request = getDefaultRequest('getSameDate', [1234]);

            const response = await dispatchRoute('/getSameDate', request, {});
            const error = response.body['getSameDate'];
            expect(error).toEqual({
                statusCode: 400,
                message: `Invalid params 'getSameDate', can not validate parameters.`,
                name: 'Validation Error',
            } satisfies AnonymRpcError);
        });
    });
});
