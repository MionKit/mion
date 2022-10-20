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
import {Context, Handler, Hook, MkRequest, MkResponse, Route, RouteObject, Routes} from './types';
import {APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {StatusCodes} from './status-codes';

describe('router create routes should', () => {
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
            inputFieldName: 'first',
            outputFieldName: 'first',
            isRoute: false,
            paramValidators: [],
        },
        userBefore: {
            path: 'users/userBefore',
            inputFieldName: 'userBefore',
            outputFieldName: 'userBefore',
            isRoute: false,
            paramValidators: [],
        },
        userAfter: {
            path: 'users/userAfter',
            inputFieldName: 'userAfter',
            outputFieldName: 'userAfter',
            isRoute: false,
            paramValidators: [],
        },
        last: {
            path: 'last',
            inputFieldName: 'last',
            outputFieldName: 'last',
            isRoute: false,
            paramValidators: [],
        },
    };

    const routeExecutables = {
        usersGetUser: {
            path: 'users/getUser',
            inputFieldName: 'params',
            outputFieldName: 'response',
            isRoute: true,
            paramValidators: [],
        },
        usersPetsGetUserPet: {
            path: 'users/pets/getUserPet',
            inputFieldName: 'params',
            outputFieldName: 'response',
            isRoute: true,
            paramValidators: [],
        },
        petsGetPet: {
            path: 'pets/getPet',
            inputFieldName: 'params',
            outputFieldName: 'response',
            isRoute: true,
            paramValidators: [],
        },
    };

    beforeEach(() => reset());

    it('create a flat routes Map', () => {
        addRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(4);

        expect(getRouteExecutionPath('users/getUser')).toEqual([
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...hookExecutables.userBefore}),
            expect.objectContaining({...routeExecutables.usersGetUser}),
            expect.objectContaining({...hookExecutables.userAfter}),
            expect.objectContaining({...hookExecutables.last}),
        ]);
        expect(getRouteExecutionPath('users/setUser')).toBeTruthy();
        expect(getRouteExecutionPath('users/pets/getUserPet')).toEqual([
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...hookExecutables.userBefore}),
            expect.objectContaining({...routeExecutables.usersPetsGetUserPet}),
            expect.objectContaining({...hookExecutables.userAfter}),
            expect.objectContaining({...hookExecutables.last}),
        ]);
        expect(getRouteExecutionPath('pets/getPet')).toEqual([
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...routeExecutables.petsGetPet}),
            expect.objectContaining({...hookExecutables.last}),
        ]);
        expect(getRouteExecutionPath('pets/setPet')).toBeTruthy();
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
                inputFieldName: 'first',
                outputFieldName: 'first',
                isRoute: false,
            }),
        );
    });

    it('add default values to routes', () => {
        const defaultRouteValues = {sayHello: {route: () => null}};
        addRoutes(defaultRouteValues);

        expect(getRouteExecutable('sayHello')).toEqual(
            expect.objectContaining({
                path: 'sayHello',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                inHeader: false,
                inputFieldName: 'params',
                outputFieldName: 'response',
                isRoute: true,
            }),
        );
    });

    it('add prefixes to routes', () => {
        setRouterOptions({prefix: 'api/v1', suffix: '.json'});
        addRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(4);

        expect(getRouteExecutionPath('api/v1/users/getUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('api/v1/users/setUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('api/v1/users/pets/getUserPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('api/v1/pets/getPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('api/v1/pets/setPet.json')).toBeTruthy();
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

    it('should extend routes types', () => {
        // TODO extend route/hook type and add to readme
        type MyRoute = Route & {};
    });
});

describe('router run routes should', () => {
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
    type CallContext = Context<App, SharedData, APIGatewayEvent, APIGatewayProxyResult>;

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

    const getDefaultRequest = (params?): MkRequest => ({
        headers: {},
        body: JSON.stringify({params}),
    });

    const getDefaultResponse = (): MkResponse => ({
        statusCode: 0,
        headers: {},
        body: null,
    });

    beforeEach(() => reset());

    describe('success path', () => {
        it('read data from body & route', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request = getDefaultRequest([{name: 'Leo', surname: 'Tungsten'}]);
            const response = getDefaultResponse();

            const data = await runRoute('changeUserName', request, response);
            expect(data.body.response).toEqual({name: 'LOREM', surname: 'Tungsten'});
        });

        it('read data from header & hook', async () => {
            initRouter(app, getSharedData);
            addRoutes({auth, changeUserName});

            const request: MkRequest = {
                headers: {Authorization: '1234'},
                body: JSON.stringify({params: [{name: 'Leo', surname: 'Tungsten'}]}),
            };
            const response = getDefaultResponse();

            const data = await runRoute('changeUserName', request, response);
            expect(data.errors.length).toEqual(0);
            expect(data.body).toEqual({response: {name: 'LOREM', surname: 'Tungsten'}});
        });
    });

    describe('fail path', () => {
        it('return an error if no route is found', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request = getDefaultRequest([{name: 'Leo', surname: 'Tungsten'}]);
            const response = getDefaultResponse();

            const data = await runRoute('abcd', request, response);
            expect(data.errors[0]).toEqual({
                statusCode: 404,
                message: `Route not found`,
            });
        });

        it('return an error if data is missing from header', async () => {
            initRouter(app, getSharedData);
            addRoutes({auth, changeUserName});

            const request = getDefaultRequest([{name: 'Leo', surname: 'Tungsten'}]);
            const response = getDefaultResponse();

            const data = await runRoute('changeUserName', request, response);
            expect(data.errors[0]).toEqual({
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
            const response = getDefaultResponse();

            const data = await runRoute('changeUserName', request, response);
            expect(data.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid request body`,
            });
        });

        it('return an error if params is  is not an array', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request: MkRequest = {
                headers: {},
                body: JSON.stringify({params: {user: {name: 'Leo', surname: 'Tungsten'}}}),
            };
            const response = getDefaultResponse();

            const data = await runRoute('changeUserName', request, response);
            expect(data.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input 'params', must be an array of parameters`,
            });
        });

        it('return an error if data is missing from body', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request = getDefaultRequest([]);
            const response = getDefaultResponse();

            const data = await runRoute('changeUserName', request, response);
            expect(data.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input 'params', missing or invalid number of input parameters`,
            });
        });

        it("return an error if can't deserialize", async () => {
            initRouter(app, getSharedData);
            addRoutes({getSameDate});

            const request = getDefaultRequest([1234]);
            const response = getDefaultResponse();

            const data = await runRoute('getSameDate', request, response);
            expect(data.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input 'params', can not deserialize. Parameters might be of the wrong type.`,
            });
        });

        it('return an error if validation fails, incorrect type', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const wrongSimpleUser: SimpleUser = {name: true, surname: 'Smith'} as any;
            const request = getDefaultRequest([wrongSimpleUser]);
            const response = getDefaultResponse();

            const data = await runRoute('changeUserName', request, response);
            expect(data.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input 'params[0]', name(type): Not a string.`,
            });
        });

        it('return an error if validation fails, empty type', async () => {
            initRouter(app, getSharedData);
            addRoutes({changeUserName});

            const request = getDefaultRequest([{}]);
            const response = getDefaultResponse();

            const data = await runRoute('changeUserName', request, response);
            expect(data.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input 'params[0]', name(type): Not a string.`,
            });
        });

        // TODO: not sure how to make serialization/validation throe an error
        it.skip("return an error if can't validate", async () => {
            initRouter(app, getSharedData);
            addRoutes({getSameDate});

            const request = getDefaultRequest([1234]);
            const response = getDefaultResponse();

            const data = await runRoute('getSameDate', request, response);
            expect(data.errors[0]).toEqual({
                statusCode: 400,
                message: `Invalid input 'params', can not validate parameters.`,
            });
        });
    });
});
