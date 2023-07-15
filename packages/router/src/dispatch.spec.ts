/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter, getApp} from './router';
import {dispatchRoute, getCallContext} from './dispatch';
import {Context, RawRequest, Route} from './types';
import {StatusCodes} from './status-codes';
import {PublicError} from './errors';

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

    type App = typeof myApp;
    type Req = ReturnType<typeof getDefaultRequest>;
    type RawServerContext = {rawRequest: Req};
    type CallContext = Context<typeof getSharedData, RawServerContext>;

    const changeUserName = (app: App, ctx, user: SimpleUser) => {
        return app.db.changeUserName(user);
    };

    const getSameDate = (app, ctx, data: DataPoint): DataPoint => {
        return data;
    };

    const auth = {
        fieldName: 'Authorization',
        inHeader: true,
        hook: (app, ctx, token: string) => {
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
            initRouter(myApp, getSharedData);
            registerRoutes({changeUserName});

            const path = '/changeUserName';
            const request = getDefaultRequest(path, [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/changeUserName', {rawRequest: request});
            expect(response.body[path]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('read data from header & hook', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({auth, changeUserName});

            const request: RawRequest = {
                headers: {Authorization: '1234'},
                body: JSON.stringify({['/changeUserName']: [{name: 'Leo', surname: 'Tungsten'}]}),
            };

            const path = '/changeUserName';
            const response = await dispatchRoute(path, {rawRequest: request});
            expect(response.publicErrors.length).toEqual(0);
            expect(response.body).toEqual({[path]: {name: 'LOREM', surname: 'Tungsten'}});
        });

        it('if there are no params input field can be omitted', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({sayHello: () => 'hello'});

            const path = '/sayHello';
            const request1: RawRequest = {headers: {}, body: ''};
            const request2: RawRequest = {headers: {}, body: '{}'};
            const request3: RawRequest = {headers: {}, body: '{"/sayHello": null}'};

            const response1 = await dispatchRoute('/sayHello', {rawRequest: request1});
            const response2 = await dispatchRoute('/sayHello', {rawRequest: request2});
            const response3 = await dispatchRoute('/sayHello', {rawRequest: request3});

            expect(response1.body[path]).toEqual('hello');
            expect(response2.body[path]).toEqual('hello');
            expect(response3.body[path]).toEqual('hello');
        });

        it('customize the routeFieldName', async () => {
            initRouter(myApp, getSharedData, {routeFieldName: 'apiData'});
            registerRoutes({changeUserName});

            const request = getDefaultRequest('apiData', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/changeUserName', {rawRequest: request});
            expect(response.body.apiData).toEqual({name: 'LOREM', surname: 'Tungsten'});
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
                pathTransform: (req, path: string): string => {
                    // publicPath = api/v1/sayHello
                    // routePath = api/v1/GET/sayHello
                    const rPath = path.replace(options.prefix, `${options.prefix}/${req.method}`);
                    return rPath;
                },
                prefix: 'api/v1',
            };
            initRouter(myApp, getSharedData, options);
            registerRoutes({
                GET: {
                    sayHello: () => 'hello', // api/v1/GET/sayHello
                },
            });

            const response = await dispatchRoute(publicPath, {rawRequest: request});
            expect(response.body[routePath]).toEqual('hello');
        });

        it('use async local context', async () => {
            initRouter(myApp, getSharedData, {useAsyncCallContext: true});
            let appFromModule;
            let asyncCallContext;
            const contextBefore = getCallContext();

            // note that when using async local context the app and context parameters are not passed to the handler
            const sumTwo = (val: number) => {
                appFromModule = getApp();
                asyncCallContext = getCallContext();
                return val + 2;
            };
            registerRoutes({sumTwo});
            const path = '/sumTwo';
            const request = getDefaultRequest(path, [2]);
            const response = await dispatchRoute(path, {rawRequest: request});
            const contextAfter = getCallContext();

            expect(appFromModule).toBeDefined();
            expect(asyncCallContext.shared).toEqual(shared);
            expect(myApp === appFromModule).toBeTruthy();
            // when call context is called from outside the context it should be undefined
            expect(contextBefore as any).not.toBeDefined();
            expect(contextAfter as any).not.toBeDefined();
            expect(response.body[path]).toEqual(4);
        });

        it('support async handlers', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({
                sumTwo: async (app, ctx, val: number) => {
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve(val + 2);
                        }, 500);
                    });
                },
            });
            const path = '/sumTwo';
            const request = getDefaultRequest(path, [2]);
            const response = await dispatchRoute(path, {rawRequest: request});
            expect(response.body[path]).toEqual(4);
        });
    });

    describe('fail path should', () => {
        it('return an error if no route is found', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({changeUserName});

            const request = getDefaultRequest('/abcd', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/abcd', {rawRequest: request});
            expect(response.publicErrors[0]).toEqual({
                statusCode: 404,
                name: 'Not Found',
                message: 'Route not found',
            });
        });

        it('return an error if data is missing from header', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({auth, changeUserName});

            const request = getDefaultRequest('/changeUserName', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await dispatchRoute('/changeUserName', {rawRequest: request});
            expect(response.publicErrors[0]).toEqual({
                statusCode: 400,
                name: 'Invalid Header',
                message: `Invalid header 'Authorization'. No header found with that name.`,
            });
        });

        it('return an error if body is not the correct type', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({changeUserName});

            const request: RawRequest = {
                headers: {},
                body: '1234',
            };

            const response = await dispatchRoute('/changeUserName', {rawRequest: request});
            expect(response.publicErrors[0]).toEqual({
                statusCode: 400,
                name: 'Invalid Request Body',
                message: 'Wrong request body. Expecting an json body containing the route name and parameters.',
            });

            const request2: RawRequest = {
                headers: {},
                body: '{-12',
            };

            const response2 = await dispatchRoute('/changeUserName', {rawRequest: request2});
            expect(response2.publicErrors[0]).toEqual({
                statusCode: 422,
                name: 'Parsing Request Body',
                message: 'Invalid request body: Unexpected number in JSON at position 1',
            });
        });

        it('return an error if data is missing from body', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({changeUserName});

            const request = getDefaultRequest('/changeUserName', []);

            const response = await dispatchRoute('/changeUserName', {rawRequest: request});
            expect(response.publicErrors[0]).toEqual({
                statusCode: 400,
                name: 'Invalid Params Length',
                message: `Invalid params '/changeUserName', missing or invalid number of input parameters`,
            });
        });

        it("return an error if can't deserialize", async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({getSameDate});

            const request = getDefaultRequest('/getSameDate', [1234]);

            const response = await dispatchRoute('/getSameDate', {rawRequest: request});
            expect(response.publicErrors[0]).toEqual({
                statusCode: 400,
                name: 'Serialization Error',
                message: `Invalid params '/getSameDate', can not deserialize. Parameters might be of the wrong type.`,
            });
        });

        it('return an error if validation fails, incorrect type', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({changeUserName});

            const wrongSimpleUser: SimpleUser = {name: true, surname: 'Smith'} as any;
            const request = getDefaultRequest('/changeUserName', [wrongSimpleUser]);

            const response = await dispatchRoute('/changeUserName', {rawRequest: request});
            const error: PublicError = {
                name: 'Validation Error',
                statusCode: 400,
                message: `Invalid params in '/changeUserName', validation failed.`,
                errorData: expect.objectContaining({
                    hasErrors: true,
                    totalErrors: 1,
                    errors: expect.any(Array),
                }),
            };
            expect(response.publicErrors[0]).toEqual(error);
        });

        it('return an error if validation fails, empty type', async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({changeUserName});

            const request = getDefaultRequest('/changeUserName', [{}]);

            const response = await dispatchRoute('/changeUserName', {rawRequest: request});
            const error: PublicError = {
                name: 'Validation Error',
                statusCode: 400,
                message: `Invalid params in '/changeUserName', validation failed.`,
                errorData: expect.objectContaining({
                    hasErrors: true,
                    totalErrors: 2,
                    errors: expect.any(Array),
                }),
            };
            expect(response.publicErrors[0]).toEqual(error);
        });

        it('return an unknown error if a route fails with a generic error', async () => {
            initRouter(myApp, getSharedData);

            const myRoute: Route = () => {
                throw new Error('this is a generic error');
            };
            registerRoutes({myRoute});

            const request = getDefaultRequest('/myRoute', []);

            const response = await dispatchRoute('/myRoute', {rawRequest: request});
            expect(response.publicErrors[0]).toEqual({
                statusCode: 500,
                name: 'Unknown Error',
                message: 'Unknown error in step /myRoute of route execution path.',
            });
        });

        // TODO: not sure how to make serialization/validation throw an error
        // eslint-disable-next-line jest/no-disabled-tests
        it.skip("return an error if can't validate", async () => {
            initRouter(myApp, getSharedData);
            registerRoutes({getSameDate});

            const request = getDefaultRequest('/getSameDate', [1234]);

            const response = await dispatchRoute('/getSameDate', {rawRequest: request});
            expect(response.publicErrors[0]).toEqual({
                statusCode: 400,
                message: `Invalid params '/getSameDate', can not validate parameters.`,
            });
        });
    });
});
