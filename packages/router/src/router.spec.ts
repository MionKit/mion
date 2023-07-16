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
import type {Handler, HookDef} from '@mionkit/hooks';
import type {RouteDef, Routes} from './types';
import {updateGlobalOptions} from '@mionkit/core';

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

    const defaultRouterExecutables = {
        parseRequestBody: {
            path: 'mionParseJsonRequestBodyHook',
            fieldName: 'mionParseJsonRequestBodyHook',
            isRoute: false,
            selfPointer: ['mionParseJsonRequestBodyHook'],
        },
        stringifyResponseBody: {
            path: 'mionStringifyJsonResponseBodyHook',
            fieldName: 'mionStringifyJsonResponseBodyHook',
            isRoute: false,
            selfPointer: ['mionStringifyJsonResponseBodyHook'],
        },
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

    beforeEach(() => resetRouter());

    it('create a flat routes Map', () => {
        initRouter({}, () => {});
        registerRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(7);

        expect(getRouteExecutionPath('/users/getUser')).toEqual([
            expect.objectContaining({...defaultRouterExecutables.parseRequestBody}),
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...hookExecutables.userBefore}),
            expect.objectContaining({...routeExecutables.usersGetUser}),
            expect.objectContaining({...hookExecutables.userAfter}),
            expect.objectContaining({...hookExecutables.last}),
            expect.objectContaining({...defaultRouterExecutables.stringifyResponseBody}),
        ]);
        expect(getRouteExecutionPath('/users/setUser')).toBeTruthy();
        expect(getRouteExecutionPath('/users/pets/getUserPet')).toEqual([
            expect.objectContaining({...defaultRouterExecutables.parseRequestBody}),
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...hookExecutables.userBefore}),
            expect.objectContaining({...routeExecutables.usersPetsGetUserPet}),
            expect.objectContaining({...hookExecutables.userPetsAfter}),
            expect.objectContaining({...hookExecutables.userAfter}),
            expect.objectContaining({...hookExecutables.last}),
            expect.objectContaining({...defaultRouterExecutables.stringifyResponseBody}),
        ]);
        expect(getRouteExecutionPath('/pets/getPet')).toEqual([
            expect.objectContaining({...defaultRouterExecutables.parseRequestBody}),
            expect.objectContaining({...hookExecutables.first}),
            expect.objectContaining({...routeExecutables.petsGetPet}),
            expect.objectContaining({...hookExecutables.last}),
            expect.objectContaining({...defaultRouterExecutables.stringifyResponseBody}),
        ]);
        expect(getRouteExecutionPath('/pets/setPet')).toBeTruthy();
    });

    it('should support methods', () => {
        initRouter({}, () => {});
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
        initRouter({}, () => {});
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
        initRouter({}, () => {});
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
        initRouter({}, () => {});
        updateGlobalOptions({prefix: 'api/v1', suffix: '.json'});
        registerRoutes(routes);

        expect(geRoutesSize()).toEqual(5);
        expect(geHooksSize()).toEqual(7);

        expect(getRouteExecutionPath('/api/v1/users/getUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/setUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/pets/getUserPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets/getPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets/setPet.json')).toBeTruthy();
    });

    it('add start and end global hooks', () => {
        initRouter({}, () => {});
        const prependHooks = {
            p1: {hook: () => null},
            p2: {hook: () => null},
        };

        const appendHooks = {
            a1: {hook: () => null},
            a2: {hook: () => null},
        };
        addStartHooks(prependHooks, false);
        addEndHooks(appendHooks, false);
        registerRoutes(routes);

        const expectedExecutionPath = [
            expect.objectContaining({...defaultRouterExecutables.parseRequestBody}),
            expect.objectContaining({fieldName: 'p1', isRoute: false}),
            expect.objectContaining({fieldName: 'p2', isRoute: false}),
            expect.objectContaining({fieldName: 'first', isRoute: false}),
            expect.objectContaining({path: '/pets/getPet', isRoute: true}),
            expect.objectContaining({fieldName: 'last', isRoute: false}),
            expect.objectContaining({fieldName: 'a1', isRoute: false}),
            expect.objectContaining({fieldName: 'a2', isRoute: false}),
            expect.objectContaining({...defaultRouterExecutables.stringifyResponseBody}),
        ];

        expect(getRouteExecutionPath('/pets/getPet')).toEqual(expectedExecutionPath);
        expect(() => addStartHooks(prependHooks)).toThrow('Can not add start hooks after the router has been initialized');
        expect(() => addEndHooks(appendHooks)).toThrow('Can not add end hooks after the router has been initialized');
    });

    it('customize route paths', () => {
        initRouter({}, () => {});
        updateGlobalOptions({prefix: 'api/v1'});

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
        initRouter({}, () => {});
        const empty = {};
        const emptySub = {sayHello: {}};
        const invalidValues = {sayHello: {total: 2}};
        const numericNames = {directory: {2: route1}};

        expect(() => registerRoutes(empty)).toThrow('Invalid route: *. Can Notregister empty routes');
        expect(() => registerRoutes(emptySub)).toThrow('Invalid route: sayHello. Can Notregister empty routes');
        expect(() => registerRoutes(invalidValues as any)).toThrow(
            'Invalid route: sayHello/total. Type <number> is not a valid route.'
        );
        expect(() => registerRoutes(numericNames)).toThrow('Invalid route: directory/2. Numeric route names are not allowed');
    });

    it('throw an error when there are naming collisions', () => {
        initRouter({}, () => {});
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
        initRouter({}, () => {});
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
        initRouter({}, () => {});
        registerRoutes(worstCase);
        const worstCaseComplexity = getComplexity();

        expect(worstCaseComplexity * ratio > bestCaseComplexity).toBeTruthy();
    });

    it('differentiate async vs non async routes', () => {
        initRouter({}, () => {});
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
});

describe('Lazy loading', () => {
    const totalRoutes = 1000;

    interface User {
        id: number;
        name: string;
        surname: string;
        lastUpdate: Date;
    }

    interface DateAndLocale {
        date: Date;
        locale: string;
    }

    const defaultRoute = (app, context, user: User, date: DateAndLocale, message?: string) => `hello ${user.name} ${message}`;
    const myApp = {};

    const routes = {};
    for (let i = 0; i < totalRoutes; ++i) {
        routes[`route-${i}`] = defaultRoute;
    }

    beforeEach(() => resetRouter());

    it('should load app faster when using lazy load reflection methods', () => {
        // no lazy load
        const loadingTimeNo = process.hrtime.bigint();
        initRouter(myApp, () => {}, {lazyLoadReflection: false});
        registerRoutes(routes);
        const endTimeNo = process.hrtime.bigint();

        resetRouter();

        // lazy load
        const loadingTimeLazy = process.hrtime.bigint();
        initRouter(myApp, () => {}, {lazyLoadReflection: true});
        registerRoutes(routes);
        const endTimeLazy = process.hrtime.bigint();

        const coldStartLazy = Number(endTimeLazy - loadingTimeLazy) / 1000000;
        const coldStartNoLazy = Number(endTimeNo - loadingTimeNo) / 1000000;
        // console.log('load ms', {
        //     'no lazy': coldStartNoLazy,
        //     lazy: coldStartLazy,
        // });

        expect(coldStartNoLazy).toBeGreaterThan(coldStartLazy);
    });
});
