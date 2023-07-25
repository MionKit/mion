/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router';
import {dispatchRoute, getCallContext} from './dispatch';
import {CallContext, RawRequest, Route, Routes} from './types';
import {PublicError, StatusCodes} from '@mionkit/core';

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

            const path = '/changeUserName';
            const request = getDefaultRequest(path, [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/changeUserName', request, {});
            expect(response.body[path][0]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('read data from header & hook', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: {Authorization: '1234'},
                body: JSON.stringify({['/changeUserName']: [{name: 'Leo', surname: 'Tungsten'}]}),
            };

            const path = '/changeUserName';
            const response = await dispatchRoute(path, request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(response.body).toEqual({[path]: [{name: 'LOREM', surname: 'Tungsten'}]});
        });

        it('if there are no params input field can be omitted', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({sayHello: () => 'hello'});

            const path = '/sayHello';
            const request1: RawRequest = {headers: {}, body: ''};
            const request2: RawRequest = {headers: {}, body: '{}'};
            const request3: RawRequest = {headers: {}, body: '{"/sayHello": null}'};

            const response1 = await dispatchRoute('/sayHello', request1, {});
            const response2 = await dispatchRoute('/sayHello', request2, {});
            const response3 = await dispatchRoute('/sayHello', request3, {});

            expect(response1.body[path][0]).toEqual('hello');
            expect(response2.body[path][0]).toEqual('hello');
            expect(response3.body[path][0]).toEqual('hello');
        });

        it('customize the routeFieldName', async () => {
            initRouter({sharedDataFactory: getSharedData, routeFieldName: 'apiData'});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('apiData', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/changeUserName', request, {});
            expect(response.body.apiData[0]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('transform the path before finding a route', async () => {
            const publicPath = '/api/v1/sayHello';
            // !! Important the route's fieldName is Still the original
            const routePath = '/api/v1/GET/sayHello';
            const request = {
                method: 'GET',
                ...getDefaultRequest(routePath, []),
            };
            const options = {
                sharedDataFactory: getSharedData,
                pathTransform: (req, path: string): string => {
                    // publicPath = api/v1/sayHello
                    // routePath = api/v1/GET/sayHello
                    const rPath = path.replace(options.prefix, `${options.prefix}/${req.method}`);
                    return rPath;
                },
                prefix: 'api/v1',
            };
            initRouter(options);
            registerRoutes({
                GET: {
                    sayHello: () => 'hello', // api/v1/GET/sayHello
                },
            });

            const response = await dispatchRoute(publicPath, request, {});
            expect(response.body[routePath][0]).toEqual('hello');
        });

        it('use async local context', async () => {
            initRouter({sharedDataFactory: getSharedData, useAsyncCallContext: true});
            let asyncCallContext;
            const contextBefore = getCallContext();

            // note that when using async local context the context parameter is not passed to the handler
            const sumTwo = (val: number) => {
                asyncCallContext = getCallContext();
                return val + 2;
            };
            // TODO handlers without context as first parameter reported as wrong type
            // we could add simple handler to route but in that case it wouldn't report an error when first parameter is not context
            // we could also use reflection to decide at runtipe if first parameter should be context or not
            registerRoutes({sumTwo} as any);
            const path = '/sumTwo';
            const request = getDefaultRequest(path, [2]);
            const response = await dispatchRoute(path, request, {});
            const contextAfter = getCallContext();

            expect(asyncCallContext.shared).toEqual(shared);
            // when call context is called from outside the context it should be undefined
            expect(contextBefore as any).not.toBeDefined();
            expect(contextAfter as any).not.toBeDefined();
            expect(response.body[path][0]).toEqual(4);
        });

        // TODO: need an unit test that guarantees that if one routes has a dependency on the output of another hook it wil work
        it('support async handlers and ensure execution in order', async () => {
            initRouter({sharedDataFactory: getSharedData});
            const pathSum = '/sumTwo';
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
                        return `the total is ${ctx.response.body[pathSum][0]}`;
                    },
                },
            } satisfies Routes;
            registerRoutes(routes);

            const request = getDefaultRequest(pathSum, [2]);
            const response = await dispatchRoute(pathSum, request, {});
            expect(response.body[pathSum][0]).toEqual(4);
            expect(response.body['totals'][0]).toEqual('the total is 4');
        });
    });

    describe('fail path should', () => {
        it('return an error if no route is found', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('/abcd', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/abcd', request, {});
            const error = response.body['/abcd'][1];
            expect(error).toEqual({
                statusCode: 404,
                name: 'Not Found',
                message: 'Route not found',
            });
        });

        it('return an error if data is missing from header', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({auth, changeUserName});

            const request = getDefaultRequest('/changeUserName', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/changeUserName', request, {});
            const error = response.body?.Authorization?.[1];
            expect(error).toEqual({
                statusCode: 400,
                name: 'Invalid Header',
                message: `Invalid header 'Authorization'. No header found with that name.`,
            });
        });

        it('return an error if body is not the correct type', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request: RawRequest = {
                headers: {},
                body: '1234',
            };

            const response = await dispatchRoute('/changeUserName', request, {});
            const error = response.body.parseJsonRequestBody[1];
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
            const errorResp = response2.body.parseJsonRequestBody[1];
            expect(errorResp).toEqual({
                statusCode: 422,
                name: 'Parsing Request Body Error',
                message: 'Invalid request body: Unexpected number in JSON at position 1',
            });
        });

        it('return an error if data is missing from body', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('/changeUserName', []);

            const response = await dispatchRoute('/changeUserName', request, {});
            const error = response.body['/changeUserName'][1];
            expect(error).toEqual({
                statusCode: 400,
                name: `Validation Error`,
                message: `Invalid params in '/changeUserName', validation failed.`,
                errorData: expect.objectContaining({
                    hasErrors: true,
                    totalErrors: 1,
                }),
            });
        });

        it("return an error if can't deserialize", async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({getSameDate});

            const request = getDefaultRequest('/getSameDate', [1234]);

            const response = await dispatchRoute('/getSameDate', request, {});
            const error = response.body['/getSameDate'][1];
            expect(error).toEqual({
                statusCode: 400,
                name: 'Serialization Error',
                message: `Invalid params '/getSameDate', can not deserialize. Parameters might be of the wrong type.`,
            });
        });

        it('return an error if validation fails, incorrect type', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const wrongSimpleUser: SimpleUser = {name: true, surname: 'Smith'} as any;
            const request = getDefaultRequest('/changeUserName', [wrongSimpleUser]);

            const response = await dispatchRoute('/changeUserName', request, {});
            const expected: PublicError = {
                name: 'Validation Error',
                statusCode: 400,
                message: `Invalid params in '/changeUserName', validation failed.`,
                errorData: expect.objectContaining({
                    hasErrors: true,
                    totalErrors: 1,
                    errors: expect.any(Array),
                }),
            };
            const error = response.body['/changeUserName'][1];
            expect(error).toEqual(expected);
        });

        it('return an error if validation fails, empty type', async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('/changeUserName', [{}]);

            const response = await dispatchRoute('/changeUserName', request, {});
            const expected: PublicError = {
                name: 'Validation Error',
                statusCode: 400,
                message: `Invalid params in '/changeUserName', validation failed.`,
                errorData: expect.objectContaining({
                    hasErrors: true,
                    totalErrors: 2,
                    errors: expect.any(Array),
                }),
            };
            const error = response.body['/changeUserName'][1];
            expect(error).toEqual(expected);
        });

        it('return an unknown error if a route fails with a generic error', async () => {
            initRouter({sharedDataFactory: getSharedData});

            const routeFail: Route = () => {
                throw new Error('this is a generic error');
            };
            registerRoutes({routeFail});

            const request = getDefaultRequest('/routeFail', []);

            const response = await dispatchRoute('/routeFail', request, {});
            const error = response.body['/routeFail'][1];
            expect(error).toEqual({
                statusCode: 500,
                name: 'Unknown Error',
                message: 'Unknown error in step 1 of route execution path.',
            });
        });

        // TODO: not sure how to make serialization/validation throw an error
        // eslint-disable-next-line jest/no-disabled-tests
        it.skip("return an error if can't validate", async () => {
            initRouter({sharedDataFactory: getSharedData});
            registerRoutes({getSameDate});

            const request = getDefaultRequest('/getSameDate', [1234]);

            const response = await dispatchRoute('/getSameDate', request, {});
            const error = response.body['/getSameDate'][1];
            expect(error).toEqual({
                statusCode: 400,
                message: `Invalid params '/getSameDate', can not validate parameters.`,
            });
        });
    });
});
