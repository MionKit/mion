/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    registerRoutes,
    geHooksSize,
    geRoutesSize,
    getComplexity,
    getHookExecutable,
    getRouteExecutionPath,
    getRouteExecutable,
    resetRouter,
    initRouter,
    addStartHooks,
    addEndHooks,
} from './router';
import {type Routes, hook, route, rawHook, ExecutableType} from '..';

describe('Create routes should', () => {
    const hook1 = hook((): void => undefined);
    const route1 = route(() => 'route1');
    const route2 = route(() => 'route2');

    const routes = {
        first: hook1,
        users: {
            userBefore: hook1,
            getUser: route1,
            setUser: route2,
            pets: {
                getUserPet: route2,
                userPetsAfter: hook1,
            },
            userAfter: hook1,
        },
        pets: {
            getPet: route1,
            setPet: route2,
        },
        last: hook1,
    } satisfies Routes;

    const hookExecutables = {
        first: {
            id: 'first',
            type: ExecutableType.hook,
        },
        userBefore: {
            id: 'users-userBefore',
            type: ExecutableType.hook,
        },
        userAfter: {
            id: 'users-userAfter',
            type: ExecutableType.hook,
        },
        userPetsAfter: {
            id: 'users-pets-userPetsAfter',
            type: ExecutableType.hook,
        },
        last: {
            id: 'last',
            type: ExecutableType.hook,
        },
    };

    const routeExecutables = {
        usersGetUser: {
            id: 'users-getUser',
            type: ExecutableType.route,
        },
        usersPetsGetUserPet: {
            id: 'users-pets-getUserPet',
            type: ExecutableType.route,
        },
        petsGetPet: {
            id: 'pets-getPet',
            type: ExecutableType.route,
        },
    };

    const defaultExecutables = {
        mionParseJsonRequestBody: {
            id: 'mionParseJsonRequestBody',
            type: ExecutableType.rawHook,
        },
        mionStringifyJsonResponseBody: {
            id: 'mionStringifyJsonResponseBody',
            type: ExecutableType.rawHook,
        },
    };

    function addDefaultExecutables(exec: any[]) {
        return [
            expect.objectContaining({...defaultExecutables.mionParseJsonRequestBody}),
            ...exec,
            expect.objectContaining({...defaultExecutables.mionStringifyJsonResponseBody}),
        ];
    }

    beforeEach(() => resetRouter());

    it('create a flat routes Map', () => {
        initRouter();
        registerRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(5);

        expect(getRouteExecutionPath('/users-getUser')).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...hookExecutables.userBefore}),
                expect.objectContaining({...routeExecutables.usersGetUser}),
                expect.objectContaining({...hookExecutables.userAfter}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/users-setUser')).toBeTruthy();
        expect(getRouteExecutionPath('/users-pets-getUserPet')).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...hookExecutables.userBefore}),
                expect.objectContaining({...routeExecutables.usersPetsGetUserPet}),
                expect.objectContaining({...hookExecutables.userPetsAfter}),
                expect.objectContaining({...hookExecutables.userAfter}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/pets-getPet')).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...routeExecutables.petsGetPet}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/pets-setPet')).toBeTruthy();
    });

    it('add default values to hooks', () => {
        initRouter();
        const defaultHookValues = {
            first: hook((): void => undefined),
            second: hook((): null => null),
        };
        registerRoutes(defaultHookValues);

        expect(getHookExecutable('first')).toEqual(
            expect.objectContaining({
                id: 'first',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: false,
                type: ExecutableType.hook,
            })
        );

        expect(getHookExecutable('second')).toEqual(
            expect.objectContaining({
                id: 'second',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                type: ExecutableType.hook,
            })
        );
    });

    it('add default values to routes', () => {
        initRouter();
        const defaultRouteValues = {sayHello: route((): null => null)};
        registerRoutes(defaultRouteValues);

        expect(getRouteExecutable('sayHello')).toEqual(
            expect.objectContaining({
                id: 'sayHello',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                type: ExecutableType.route,
            })
        );
    });

    it('add prefix & suffix to routes', () => {
        initRouter({prefix: 'api/v1', suffix: '.json'});
        registerRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(5);

        expect(getRouteExecutionPath('/api/v1/users-getUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users-setUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users-pets-getUserPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets-getPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets-setPet.json')).toBeTruthy();
    });

    it('throw an error when a routes are invalid', () => {
        initRouter();
        const empty = {};
        const emptySub = {sayHello: {}};
        const invalidValues = {sayHello: {total: 2}};
        const numericNames = {directory: {2: route1}};

        expect(() => registerRoutes(empty)).toThrow('Invalid route: *. Can Not define empty routes');
        expect(() => registerRoutes(emptySub)).toThrow('Invalid route: sayHello. Can Not define empty routes');
        expect(() => registerRoutes(invalidValues as any)).toThrow(
            'Invalid route: sayHello/total. Type <number> is not a valid route.'
        );
        expect(() => registerRoutes(numericNames)).toThrow('Invalid route: directory/2. Numeric route names are not allowed');
    });

    it('optimize parsing routes (complexity) when there are multiple routes in a row', () => {
        initRouter();
        const bestCase = {
            first: hook1,
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
                petsFirst: hook1,
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
                petsLast: hook1,
            },
            last: hook1,
        };
        const worstCase = {
            first: hook1,
            route1: route1,
            route12: route2,
            pets: {
                petsFirst: hook1,
                route1: route1,
                route12: route2,
                petsLast: hook1,
            },
            last: hook1,
        };
        const bestCaseTotalRoutes = 20;
        const worstCaseTotalRoutes = 4;
        const ratio = bestCaseTotalRoutes / worstCaseTotalRoutes;

        registerRoutes(bestCase);
        const bestCaseComplexity = getComplexity();
        resetRouter();
        initRouter();
        registerRoutes(worstCase);
        const worstCaseComplexity = getComplexity();

        expect(worstCaseComplexity * ratio > bestCaseComplexity).toBeTruthy();
    });

    it('differentiate async vs non async routes', () => {
        initRouter();
        // !! Important return types must always be declared as deepkit doe not infers the type
        const defaultRouteValues = {
            sayHello: route((): null => null),
            asyncSayHello: route(async (): Promise<string> => {
                const hello = await new Promise<string>((res) => {
                    setTimeout(() => res('hello'), 50);
                });
                return hello;
            }),
            noReturnType: route(() => null),
        };
        registerRoutes(defaultRouteValues);

        expect(getRouteExecutable('sayHello')?.reflection.isAsync).toEqual(false);
        expect(getRouteExecutable('asyncSayHello')?.reflection.isAsync).toEqual(true);

        // when there is no return type we asume the function is async.
        // this is done so await is enforced in case we don't know the return type
        expect(getRouteExecutable('noReturnType')?.reflection.isAsync).toEqual(true);
    });

    it('add start and end global hooks', () => {
        const prependHooks = {
            p1: rawHook((ctx, cb) => cb()),
            p2: rawHook((ctx, cb) => cb()),
        };

        const appendHooks = {
            a1: rawHook((ctx, cb) => cb()),
            a2: rawHook((ctx, cb) => cb()),
        };
        addStartHooks(prependHooks, false);
        addEndHooks(appendHooks, false);

        initRouter();
        registerRoutes(routes);

        const expectedExecutionPath = addDefaultExecutables([
            expect.objectContaining({id: 'p1', type: ExecutableType.rawHook}),
            expect.objectContaining({id: 'p2', type: ExecutableType.rawHook}),
            expect.objectContaining({id: 'first', type: ExecutableType.hook}),
            expect.objectContaining({id: 'pets-getPet', type: ExecutableType.route}),
            expect.objectContaining({id: 'last', type: ExecutableType.hook}),
            expect.objectContaining({id: 'a1', type: ExecutableType.rawHook}),
            expect.objectContaining({id: 'a2', type: ExecutableType.rawHook}),
        ]);

        expect(getRouteExecutionPath('/pets-getPet')).toEqual(expectedExecutionPath);
        expect(() => addStartHooks(prependHooks)).toThrow('Can not add start hooks after the router has been initialized');
        expect(() => addEndHooks(appendHooks)).toThrow('Can not add end hooks after the router has been initialized');
    });
});
