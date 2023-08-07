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
    getRouteEntries,
} from './router';
import {Handler, HookDef, RouteDef, Routes} from './types';

describe('Create routes should', () => {
    const hook: HookDef = {hook(): void {}};
    const route1: Handler = () => 'route1';
    const route2: RouteDef = {
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
                userPetsAfter: hook,
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
            id: 'first',
            isRoute: false,
        },
        userBefore: {
            id: 'users-userBefore',
            isRoute: false,
        },
        userAfter: {
            id: 'users-userAfter',
            isRoute: false,
        },
        userPetsAfter: {
            id: 'users-pets-userPetsAfter',
            isRoute: false,
        },
        last: {
            id: 'last',
            isRoute: false,
        },
    };

    const routeExecutables = {
        usersGetUser: {
            id: 'users-getUser',
            isRoute: true,
        },
        usersPetsGetUserPet: {
            id: 'users-pets-getUserPet',
            isRoute: true,
        },
        petsGetPet: {
            id: 'pets-getPet',
            isRoute: true,
        },
    };

    const defaultExecutables = {
        mionParseJsonRequestBody: {
            isRoute: false,
            isRawExecutable: true,
            id: 'mionParseJsonRequestBody',
        },
        mionStringifyJsonResponseBody: {
            isRoute: false,
            isRawExecutable: true,
            id: 'mionStringifyJsonResponseBody',
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

    it('should support methods', () => {
        initRouter();
        function hello(): void {}
        const routes = {
            hello,
        };
        registerRoutes(routes);

        expect(getRouteExecutable('hello')).toEqual(
            expect.objectContaining({
                id: 'hello',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                inHeader: false,
                isRoute: true,
            })
        );
    });

    it('add default values to hooks', () => {
        initRouter();
        const defaultHookValues = {first: {hook: (): null => null}};
        registerRoutes(defaultHookValues);

        expect(getHookExecutable('first')).toEqual(
            expect.objectContaining({
                id: 'first',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: false,
                inHeader: false,
                isRoute: false,
            })
        );
    });

    it('add default values to routes', () => {
        initRouter();
        const defaultRouteValues = {sayHello: {route: (): null => null}};
        registerRoutes(defaultRouteValues);

        expect(getRouteExecutable('sayHello')).toEqual(
            expect.objectContaining({
                id: 'sayHello',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                inHeader: false,
                isRoute: true,
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
            sayHello: (): null => null,
            asyncSayHello: async (): Promise<string> => {
                const hello = await new Promise<string>((res) => {
                    setTimeout(() => res('hello'), 50);
                });
                return hello;
            },
            noReturnType: () => null,
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
            p1: {rawHook: (ctx, cb) => cb()},
            p2: {rawHook: (ctx, cb) => cb()},
        };

        const appendHooks = {
            a1: {rawHook: (ctx, cb) => cb()},
            a2: {rawHook: (ctx, cb) => cb()},
        };
        addStartHooks(prependHooks, false);
        addEndHooks(appendHooks, false);

        initRouter();
        registerRoutes(routes);

        const expectedExecutionPath = addDefaultExecutables([
            expect.objectContaining({id: 'p1', isRoute: false}),
            expect.objectContaining({id: 'p2', isRoute: false}),
            expect.objectContaining({id: 'first', isRoute: false}),
            expect.objectContaining({id: 'pets-getPet', isRoute: true}),
            expect.objectContaining({id: 'last', isRoute: false}),
            expect.objectContaining({id: 'a1', isRoute: false}),
            expect.objectContaining({id: 'a2', isRoute: false}),
        ]);

        expect(getRouteExecutionPath('/pets-getPet')).toEqual(expectedExecutionPath);
        expect(() => addStartHooks(prependHooks)).toThrow('Can not add start hooks after the router has been initialized');
        expect(() => addEndHooks(appendHooks)).toThrow('Can not add end hooks after the router has been initialized');
    });
});
