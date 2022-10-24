/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    addRoutes,
    geHooksSize,
    geRoutesSize,
    getComplexity,
    getHookExecutable,
    getRouteExecutionPath,
    getRouteExecutable,
    reset,
    setRouterOptions,
    initRouter,
    runRoute,
} from './router';
import {Context, Handler, Hook, MkRequest, Route, RouteObject, Routes} from './types';
import {APIGatewayEvent} from 'aws-lambda';
import {StatusCodes} from './status-codes';

describe('Create routes should', () => {
    const hook: Hook = {hook() {}};
    const route1: Handler = () => 'route1';
    const route2: RouteObject = {
        route() {
            return 'route2';
        },
    };

    const routes: Routes = {
        first: hook,
        users: {
            userBefore: hook,
            getUser: route1,
            setUser: route2,
            pets: {
                getUserPet: route2,
            },
            userAfter: hook,
        },
        pets: {
            getPet: route1,
            setPet: route2,
        },
        last: hook,
    };

    const hookExecutables = {
        first: {
            path: 'first',
            fieldName: 'first',
            isRoute: false,
            paramValidators: [],
        },
        userBefore: {
            path: 'users/userBefore',
            fieldName: 'userBefore',
            isRoute: false,
            paramValidators: [],
        },
        userAfter: {
            path: 'users/userAfter',
            fieldName: 'userAfter',
            isRoute: false,
            paramValidators: [],
        },
        last: {
            path: 'last',
            fieldName: 'last',
            isRoute: false,
            paramValidators: [],
        },
    };

    const routeExecutables = {
        usersGetUser: {
            path: '/users/getUser',
            fieldName: '/users/getUser',
            isRoute: true,
            paramValidators: [],
        },
        usersPetsGetUserPet: {
            path: '/users/pets/getUserPet',
            fieldName: '/users/pets/getUserPet',
            isRoute: true,
            paramValidators: [],
        },
        petsGetPet: {
            path: '/pets/getPet',
            fieldName: '/pets/getPet',
            isRoute: true,
            paramValidators: [],
        },
    };

    beforeEach(() => reset());

    it('create a flat routes Map', () => {
        addRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(4);

        expect(getRouteExecutionPath('/users/getUser')).toEqual([
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...hookExecutables.userBefore}),
            expect.objectContaining({...routeExecutables.usersGetUser}),
            expect.objectContaining({...hookExecutables.userAfter}),
            expect.objectContaining({...hookExecutables.last}),
        ]);
        expect(getRouteExecutionPath('/users/setUser')).toBeTruthy();
        expect(getRouteExecutionPath('/users/pets/getUserPet')).toEqual([
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...hookExecutables.userBefore}),
            expect.objectContaining({...routeExecutables.usersPetsGetUserPet}),
            expect.objectContaining({...hookExecutables.userAfter}),
            expect.objectContaining({...hookExecutables.last}),
        ]);
        expect(getRouteExecutionPath('/pets/getPet')).toEqual([
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...routeExecutables.petsGetPet}),
            expect.objectContaining({...hookExecutables.last}),
        ]);
        expect(getRouteExecutionPath('/pets/setPet')).toBeTruthy();
    });

    it('should support methods', () => {
        function hello() {}
        const routes = {
            hello,
        };
        addRoutes(routes);

        expect(getRouteExecutable('/hello')).toEqual(
            expect.objectContaining({
                path: '/hello',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                inHeader: false,
                fieldName: '/hello',
                isRoute: true,
            }),
        );
    });

    it('add default values to hooks', () => {
        const defaultHookValues = {first: {hook: () => null}};
        addRoutes(defaultHookValues);

        expect(getHookExecutable('first')).toEqual(
            expect.objectContaining({
                path: 'first',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: false,
                inHeader: false,
                fieldName: 'first',
                isRoute: false,
            }),
        );
    });

    it('add default values to routes', () => {
        const defaultRouteValues = {sayHello: {route: () => null}};
        addRoutes(defaultRouteValues);

        expect(getRouteExecutable('/sayHello')).toEqual(
            expect.objectContaining({
                path: '/sayHello',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                inHeader: false,
                fieldName: '/sayHello',
                isRoute: true,
            }),
        );
    });

    it('add prefix & suffix to routes', () => {
        setRouterOptions({prefix: 'api/v1', suffix: '.json'});
        addRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(4);

        expect(getRouteExecutionPath('/api/v1/users/getUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/setUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/pets/getUserPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets/getPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets/setPet.json')).toBeTruthy();
    });

    it('customize route paths', () => {
        setRouterOptions({prefix: 'api/v1'});

        const routes: Routes = {
            u: {
                c: {
                    path: 'users/create',
                    route: () => null,
                },
                d: {
                    path: '/users/delete',
                    route: () => null,
                },
            },
        };
        addRoutes(routes);

        expect(geRoutesSize()).toEqual(2);

        expect(getRouteExecutionPath('/api/v1/users/create')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/delete')).toBeTruthy();
    });

    it('throw an error when a routes are invalid', () => {
        const empty = {};
        const emptySub = {sayHello: {}};
        const invalidValues = {sayHello: {total: 2}};
        const numericNames = {directory: {2: route1}};

        expect(() => addRoutes(empty)).toThrow('Invalid route: root Object. Can Not define empty routes');
        expect(() => addRoutes(emptySub)).toThrow('Invalid route: sayHello. Can Not define empty routes');
        expect(() => addRoutes(invalidValues as any)).toThrow(
            'Invalid route: sayHello/total. Type <number> is not a valid route.',
        );
        expect(() => addRoutes(numericNames)).toThrow('Invalid route: directory/2. Numeric route names are not allowed');
    });

    it('throw an error when there are naming collisions', () => {
        const fieldCollision = {
            preProcess: {
                fieldName: 'process',
                hook: () => null,
            },
            postProcess: {
                fieldName: 'process',
                hook: () => null,
            },
        };
        const pathCollision = {
            sayHello1: {
                path: 'sayHello',
                route: () => null,
            },
            sayHello2: {
                path: 'sayHello',
                route: () => null,
            },
        };
        expect(() => addRoutes(fieldCollision)).toThrow(
            `Invalid hook: postProcess. Naming collision, the fieldName 'process' has been used in more than one hook/route.`,
        );
        expect(() => addRoutes(pathCollision)).toThrow('Invalid route: sayHello2. Naming collision, duplicated route');
    });

    it('should optimize parsing routes (complexity) when there are multiple routes in a row', () => {
        const bestCase = {
            first: hook,
            route1: route1,
            route2: route2,
            route3: route1,
            route4: route2,
            route5: route1,
            route6: route2,
            route7: route1,
            route8: route2,
            route9: route1,
            route10: route2,
            pets: {
                petsFirst: hook,
                route1: route1,
                route2: route2,
                route3: route1,
                route4: route2,
                route5: route1,
                route6: route2,
                route7: route1,
                route8: route2,
                route9: route1,
                route10: route2,
                petsLast: hook,
            },
            last: hook,
        };
        const worstCase = {
            first: hook,
            route1: route1,
            route12: route2,
            pets: {
                petsFirst: hook,
                route1: route1,
                route12: route2,
                petsLast: hook,
            },
            last: hook,
        };
        const bestCaseTotalRoutes = 20;
        const worstCaseTotalRoutes = 4;
        const ratio = bestCaseTotalRoutes / worstCaseTotalRoutes;

        addRoutes(bestCase);
        const bestCaseComplexity = getComplexity();
        reset();
        addRoutes(worstCase);
        const worstCaseComplexity = getComplexity();

        expect(worstCaseComplexity * ratio > bestCaseComplexity).toBeTruthy();
    });

    it('differentiate async vs non async routes', () => {
        // !! Important return types must always be declared as deepkit doe not infers the type
        const defaultRouteValues = {
            sayHello: (): null => null,
            asyncSayHello: async (): Promise<string> => {
                const hello = await new Promise<string>((res, rej) => {
                    setTimeout(() => res('hello'), 50);
                });
                return hello;
            },
        };
        addRoutes(defaultRouteValues);

        expect(getRouteExecutable('/sayHello')).toEqual(
            expect.objectContaining({
                isAsync: false,
            }),
        );

        expect(getRouteExecutable('/asyncSayHello')).toEqual(
            expect.objectContaining({
                isAsync: true,
            }),
        );
    });
});

describe('Run routes', () => {
    type SimpleUser = {
        name: string;
        surname: string;
    };
    type DataPoint = {
        date: Date;
    };
    const app = {
        cloudLogs: {
            log: () => null,
            error: () => null,
        },
        db: {
            changeUserName: (user: SimpleUser) => ({name: 'LOREM', surname: user.surname}),
        },
    };

    const getSharedData = () => ({auth: {me: null as any}});

    type App = typeof app;
    type SharedData = ReturnType<typeof getSharedData>;
    type CallContext = Context<App, SharedData, APIGatewayEvent>;

    const changeUserName: Route = (context: CallContext, user: SimpleUser) => {
        return context.app.db.changeUserName(user);
    };

    const getSameDate: Route = (context, data: DataPoint): DataPoint => {
        return data;
    };

    const auth: Hook = {
        fieldName: 'Authorization',
        inHeader: true,
        hook: (context: CallContext, token: string) => {
            if (token !== '1234') throw {statusCode: StatusCodes.FORBIDDEN, message: 'invalid auth token'};
        },
    };

    const getDefaultRequest = (path: string, params?): MkRequest => ({
        headers: {},
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => reset());

    describe('success path should', () => {
        it('read data from body & route', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const path = '/changeUserName';
            const request = getDefaultRequest(path, [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await runRoute('/changeUserName', request);
            expect(response.data[path]).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('read data from header & hook', async () => {
            initRouter(app, getSharedData);
            addRoutes({auth, changeUserName});

            const request: MkRequest = {
                headers: {Authorization: '1234'},
                body: JSON.stringify({['/changeUserName']: [{name: 'Leo', surname: 'Tungsten'}]}),
            };

            const path = '/changeUserName';
            const response = await runRoute(path, request);
            expect(response.errors.length).toEqual(0);
            expect(response.data).toEqual({[path]: {name: 'LOREM', surname: 'Tungsten'}});
        });

        it('if there are no params input field can be omitted', async () => {
            initRouter(app, getSharedData);
            addRoutes({sayHello: () => 'hello'});

            const path = '/sayHello';
            const request1: MkRequest = {headers: {}, body: ''};
            const request2: MkRequest = {headers: {}, body: '{}'};
            const request3: MkRequest = {headers: {}, body: '{"/sayHello": null}'};

            const response1 = await runRoute('/sayHello', request1);
            const response2 = await runRoute('/sayHello', request2);
            const response3 = await runRoute('/sayHello', request3);

            expect(response1.data[path]).toEqual('hello');
            expect(response2.data[path]).toEqual('hello');
            expect(response3.data[path]).toEqual('hello');
        });

        it('customize the routeFieldName', async () => {
            initRouter(app, getSharedData, {routeFieldName: 'apiData'});
            addRoutes({changeUserName});

            const path = '/changeUserName';
            const request = getDefaultRequest('apiData', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await runRoute('/changeUserName', request);
            expect(response.data.apiData).toEqual({name: 'LOREM', surname: 'Tungsten'});
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
                pathTransform: (req, path: string) => {
                    // publicPath = api/v1/sayHello
                    // routePath = api/v1/GET/sayHello
                    const rPath = path.replace(options.prefix, `${options.prefix}/${req.method}`);
                    return rPath;
                },
                prefix: 'api/v1',
            };
            initRouter(app, getSharedData, options);
            addRoutes({
                GET: {
                    sayHello: () => 'hello', // api/v1/GET/sayHello
                },
            });

            const response = await runRoute(publicPath, request);
            expect(response.data[routePath]).toEqual('hello');
        });
    });

    describe('fail path should', () => {
        it('return an error if no route is found', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request = getDefaultRequest('/abcd', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await runRoute('/abcd', request);
            expect(response.errors[0]).toEqual({
                statusCode: 404,
                message: `Route not found`,
            });
        });

        it('return an error if data is missing from header', async () => {
            initRouter(app, getSharedData);
            addRoutes({auth, changeUserName});

            const request = getDefaultRequest('/changeUserName', [{name: 'Leo', surname: 'Tungsten'}]);

            const response = await runRoute('/changeUserName', request);
            expect(response.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid header 'Authorization'. No header found with that name.`,
            });
        });

        it('return an error if body is not a json object', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request: MkRequest = {
                headers: {},
                body: '1234',
            };

            const response = await runRoute('/changeUserName', request);
            expect(response.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid request body`,
            });
        });

        it('return an error if data is missing from body', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request = getDefaultRequest('/changeUserName', []);

            const response = await runRoute('/changeUserName', request);
            expect(response.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input '/changeUserName', missing or invalid number of input parameters`,
            });
        });

        it("return an error if can't deserialize", async () => {
            initRouter(app, getSharedData);
            addRoutes({getSameDate});

            const request = getDefaultRequest('/getSameDate', [1234]);

            const response = await runRoute('/getSameDate', request);
            expect(response.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input '/getSameDate', can not deserialize. Parameters might be of the wrong type.`,
            });
        });

        it('return an error if validation fails, incorrect type', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const wrongSimpleUser: SimpleUser = {name: true, surname: 'Smith'} as any;
            const request = getDefaultRequest('/changeUserName', [wrongSimpleUser]);

            const response = await runRoute('/changeUserName', request);
            expect(response.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid param[0] in '/changeUserName', name(type): Not a string.`,
            });
        });

        it('return an error if validation fails, empty type', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request = getDefaultRequest('/changeUserName', [{}]);

            const response = await runRoute('/changeUserName', request);
            expect(response.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid param[0] in '/changeUserName', name(type): Not a string.`,
            });
        });

        it('return an unknown error if a route fails with a generic error', async () => {
            initRouter(app, getSharedData);

            const routeFail: Route = (c: any) => {
                throw 'this is a generic error';
            };
            addRoutes({routeFail});

            const request = getDefaultRequest('/routeFail', []);

            const response = await runRoute('/routeFail', request);
            expect(response.errors[0]).toEqual({
                statusCode: 500,
                message: `Unknown error in step 0 of execution path.`,
            });
        });

        // TODO: not sure how to make serialization/validation throe an error
        it.skip("return an error if can't validate", async () => {
            initRouter(app, getSharedData);
            addRoutes({getSameDate});

            const request = getDefaultRequest('/getSameDate', [1234]);

            const response = await runRoute('/getSameDate', request);
            expect(response.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input '/getSameDate', can not validate parameters.`,
            });
        });
    });
});
