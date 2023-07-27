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
            path: 'first',
            fieldName: 'first',
            isRoute: false,
            selfPointer: ['first'],
        },
        userBefore: {
            path: 'userBefore',
            fieldName: 'userBefore',
            isRoute: false,
            selfPointer: ['users', 'userBefore'],
        },
        userAfter: {
            path: 'userAfter',
            fieldName: 'userAfter',
            isRoute: false,
            selfPointer: ['users', 'userAfter'],
        },
        userPetsAfter: {
            path: 'userPetsAfter',
            fieldName: 'userPetsAfter',
            isRoute: false,
            selfPointer: ['users', 'pets', 'userPetsAfter'],
        },
        last: {
            path: 'last',
            fieldName: 'last',
            isRoute: false,
            selfPointer: ['last'],
        },
    };

    const routeExecutables = {
        usersGetUser: {
            path: '/users/getUser',
            fieldName: '/users/getUser',
            isRoute: true,
            selfPointer: ['users', 'getUser'],
        },
        usersPetsGetUserPet: {
            path: '/users/pets/getUserPet',
            fieldName: '/users/pets/getUserPet',
            isRoute: true,
            selfPointer: ['users', 'pets', 'getUserPet'],
        },
        petsGetPet: {
            path: '/pets/getPet',
            fieldName: '/pets/getPet',
            isRoute: true,
            selfPointer: ['pets', 'getPet'],
        },
    };

    const defaultExecutables = {
        parseJsonRequestBody: {
            isRoute: false,
            isRawExecutable: true,
            path: 'parseJsonRequestBody',
            fieldName: 'parseJsonRequestBody',
            selfPointer: ['parseJsonRequestBody'],
        },
        stringifyJsonResponseBody: {
            isRoute: false,
            isRawExecutable: true,
            path: 'stringifyJsonResponseBody',
            fieldName: 'stringifyJsonResponseBody',
            selfPointer: ['stringifyJsonResponseBody'],
        },
    };

    function addDefaultExecutables(exec: any[]) {
        return [
            expect.objectContaining({...defaultExecutables.parseJsonRequestBody}),
            ...exec,
            expect.objectContaining({...defaultExecutables.stringifyJsonResponseBody}),
        ];
    }

    beforeEach(() => resetRouter());

    it('create a flat routes Map', () => {
        initRouter();
        registerRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(5);

        expect(getRouteExecutionPath('/users/getUser')).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...hookExecutables.userBefore}),
                expect.objectContaining({...routeExecutables.usersGetUser}),
                expect.objectContaining({...hookExecutables.userAfter}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/users/setUser')).toBeTruthy();
        expect(getRouteExecutionPath('/users/pets/getUserPet')).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...hookExecutables.userBefore}),
                expect.objectContaining({...routeExecutables.usersPetsGetUserPet}),
                expect.objectContaining({...hookExecutables.userPetsAfter}),
                expect.objectContaining({...hookExecutables.userAfter}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/pets/getPet')).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...routeExecutables.petsGetPet}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/pets/setPet')).toBeTruthy();
    });

    it('should support methods', () => {
        initRouter();
        function hello(): void {}
        const routes = {
            hello,
        };
        registerRoutes(routes);

        expect(getRouteExecutable('/hello')).toEqual(
            expect.objectContaining({
                path: '/hello',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                inHeader: false,
                fieldName: '/hello',
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
                path: 'first',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: false,
                inHeader: false,
                fieldName: 'first',
                isRoute: false,
            })
        );
    });

    it('add default values to routes', () => {
        initRouter();
        const defaultRouteValues = {sayHello: {route: (): null => null}};
        registerRoutes(defaultRouteValues);

        expect(getRouteExecutable('/sayHello')).toEqual(
            expect.objectContaining({
                path: '/sayHello',
                nestLevel: 0,
                forceRunOnError: false,
                canReturnData: true,
                inHeader: false,
                fieldName: '/sayHello',
                isRoute: true,
            })
        );
    });

    it('add prefix & suffix to routes', () => {
        initRouter({prefix: 'api/v1', suffix: '.json'});
        registerRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(5);

        expect(getRouteExecutionPath('/api/v1/users/getUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/setUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/pets/getUserPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets/getPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets/setPet.json')).toBeTruthy();
    });

    it('customize route paths', () => {
        initRouter({prefix: 'api/v1'});

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
        registerRoutes(routes);

        expect(geRoutesSize()).toEqual(2);

        expect(getRouteExecutionPath('/api/v1/users/create')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/delete')).toBeTruthy();
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

    it('throw an error when there are naming collisions', () => {
        initRouter();
        const fieldCollision = {
            preProcess: {
                fieldName: 'process',
                hook: (): null => null,
            },
            postProcess: {
                fieldName: 'process',
                hook: (): null => null,
            },
        };
        const pathCollision = {
            sayHello1: {
                path: 'sayHello',
                route: (): null => null,
            },
            sayHello2: {
                path: 'sayHello',
                route: (): null => null,
            },
        };
        expect(() => registerRoutes(fieldCollision)).toThrow(
            `Invalid hook: postProcess. Naming collision, the fieldName 'process' has been used in more than one hook/route.`
        );
        expect(() => registerRoutes(pathCollision)).toThrow('Invalid route: sayHello2. Naming collision, duplicated route');
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

        expect(getRouteExecutable('/sayHello')?.reflection.isAsync).toEqual(false);
        expect(getRouteExecutable('/asyncSayHello')?.reflection.isAsync).toEqual(true);

        // when there is no return type we asume the function is async.
        // this is done so await is enforced in case we don't know the return type
        expect(getRouteExecutable('/noReturnType')?.reflection.isAsync).toEqual(true);
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
            expect.objectContaining({fieldName: 'p1', isRoute: false}),
            expect.objectContaining({fieldName: 'p2', isRoute: false}),
            expect.objectContaining({fieldName: 'first', isRoute: false}),
            expect.objectContaining({path: '/pets/getPet', isRoute: true}),
            expect.objectContaining({fieldName: 'last', isRoute: false}),
            expect.objectContaining({fieldName: 'a1', isRoute: false}),
            expect.objectContaining({fieldName: 'a2', isRoute: false}),
        ]);

        expect(getRouteExecutionPath('/pets/getPet')).toEqual(expectedExecutionPath);
        expect(() => addStartHooks(prependHooks)).toThrow('Can not add start hooks after the router has been initialized');
        expect(() => addEndHooks(appendHooks)).toThrow('Can not add end hooks after the router has been initialized');
    });
});
