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
import {type Routes} from './types/general';
import {hook, route, rawHook, headersHook} from './lib/handlers';
import {HandlerType, HeadersSubset} from '@mionkit/core';
import {isPublicExecutable} from './types/guards';

describe('Create routes should', () => {
    const hook1 = hook((): void => undefined);
    const route1 = route((): string => 'route1');
    const route2 = route((): string => 'route2');

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
            type: HandlerType.hook,
        },
        userBefore: {
            id: 'users/userBefore',
            type: HandlerType.hook,
        },
        userAfter: {
            id: 'users/userAfter',
            type: HandlerType.hook,
        },
        userPetsAfter: {
            id: 'users/pets/userPetsAfter',
            type: HandlerType.hook,
        },
        last: {
            id: 'last',
            type: HandlerType.hook,
        },
    };

    const routeExecutables = {
        usersGetUser: {
            id: 'users/getUser',
            type: HandlerType.route,
        },
        usersPetsGetUserPet: {
            id: 'users/pets/getUserPet',
            type: HandlerType.route,
        },
        petsGetPet: {
            id: 'pets/getPet',
            type: HandlerType.route,
        },
    };

    const defaultExecutables = {
        mionDeserializeRequest: {
            id: 'mionDeserializeRequest',
            type: HandlerType.rawHook,
        },
        mionSerializeResponse: {
            id: 'mionSerializeResponse',
            type: HandlerType.rawHook,
        },
    };

    function addDefaultExecutables(exec: any[]) {
        return [
            expect.objectContaining({...defaultExecutables.mionDeserializeRequest}),
            ...exec,
            expect.objectContaining({...defaultExecutables.mionSerializeResponse}),
        ];
    }

    beforeEach(() => resetRouter());

    it('create a flat routes Map', async () => {
        await initRouter();
        await registerRoutes(routes);

        expect(geRoutesSize()).toEqual(8); // includes +3 mion Error routes (notFound, thrownErrors, platformError)
        expect(geHooksSize()).toEqual(5);

        expect(getRouteExecutionPath('/users/getUser')?.methods).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...hookExecutables.userBefore}),
                expect.objectContaining({...routeExecutables.usersGetUser}),
                expect.objectContaining({...hookExecutables.userAfter}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/users/setUser')).toBeTruthy();
        expect(getRouteExecutionPath('/users/pets/getUserPet')?.methods).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...hookExecutables.userBefore}),
                expect.objectContaining({...routeExecutables.usersPetsGetUserPet}),
                expect.objectContaining({...hookExecutables.userPetsAfter}),
                expect.objectContaining({...hookExecutables.userAfter}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/pets/getPet')?.methods).toEqual(
            addDefaultExecutables([
                expect.objectContaining({...hookExecutables.first}),
                expect.objectContaining({...routeExecutables.petsGetPet}),
                expect.objectContaining({...hookExecutables.last}),
            ])
        );
        expect(getRouteExecutionPath('/pets/setPet')).toBeTruthy();
    });

    it('add default values to hooks', async () => {
        await initRouter();
        const defaultHookValues = {
            first: hook((): void => undefined),
            second: hook((): null => null),
        };
        await registerRoutes(defaultHookValues);

        expect(getHookExecutable('first')).toEqual(
            expect.objectContaining({
                id: 'first',
                nestLevel: 0,
                type: HandlerType.hook,
                hasReturnData: false,
                options: expect.objectContaining({
                    runOnError: false,
                }),
            })
        );

        expect(getHookExecutable('second')).toEqual(
            expect.objectContaining({
                id: 'second',
                nestLevel: 0,
                type: HandlerType.hook,
                hasReturnData: true,
                options: expect.objectContaining({
                    runOnError: false,
                }),
            })
        );
    });

    it('add default values to routes', async () => {
        await initRouter();
        const defaultRouteValues = {sayHello: route((): null => null)};
        await registerRoutes(defaultRouteValues);

        expect(getRouteExecutable('sayHello')).toEqual(
            expect.objectContaining({
                id: 'sayHello',
                nestLevel: 0,
                type: HandlerType.route,
                hasReturnData: true,
                options: expect.objectContaining({
                    runOnError: false,
                }),
            })
        );
    });

    it('add prefix & suffix to routes', async () => {
        await initRouter({prefix: 'api/v1', suffix: '.json'});
        await registerRoutes(routes);

        expect(geRoutesSize()).toEqual(8); // includes +3 mion Error routes (notFound, thrownErrors, platformError)
        expect(geHooksSize()).toEqual(5);

        expect(getRouteExecutionPath('/api/v1/users/getUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/setUser.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/users/pets/getUserPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets/getPet.json')).toBeTruthy();
        expect(getRouteExecutionPath('/api/v1/pets/setPet.json')).toBeTruthy();
    });

    it('throw an error when a routes are invalid', async () => {
        await initRouter();
        const empty = {};
        const emptySub = {sayHello: {}};
        const invalidValues = {sayHello: {total: 2}};
        const numericNames = {directory: {2: route1}};

        await expect(registerRoutes(empty)).rejects.toThrow('Invalid route: *. Can Not define empty routes');
        await expect(registerRoutes(emptySub)).rejects.toThrow('Invalid route: sayHello. Can Not define empty routes');
        await expect(registerRoutes(invalidValues as any)).rejects.toThrow(
            'Invalid route: sayHello/total. Type <number> is not a valid route.'
        );
        await expect(registerRoutes(numericNames)).rejects.toThrow(
            'Invalid route: directory/2. Numeric route names are not allowed'
        );
    });

    it('throw an error when contextDataFactory returns invalid values', async () => {
        const errorMessage = 'contextDataFactory must return a plain object with at least one property';

        await expect(initRouter({contextDataFactory: () => undefined as any})).rejects.toThrow(errorMessage);
        resetRouter();
        await expect(initRouter({contextDataFactory: () => null as any})).rejects.toThrow(errorMessage);
        resetRouter();
        await expect(initRouter({contextDataFactory: () => 'string' as any})).rejects.toThrow(errorMessage);
        resetRouter();
        await expect(initRouter({contextDataFactory: () => 42 as any})).rejects.toThrow(errorMessage);
        resetRouter();
        await expect(initRouter({contextDataFactory: () => [] as any})).rejects.toThrow(errorMessage);
        resetRouter();
        await expect(initRouter({contextDataFactory: () => ({})})).rejects.toThrow(errorMessage);
    });

    it('accept valid contextDataFactory that returns an object with properties', async () => {
        await expect(initRouter({contextDataFactory: () => ({user: null})})).resolves.not.toThrow();
        resetRouter();
        await expect(initRouter({contextDataFactory: () => ({user: null, data: 'test'})})).resolves.not.toThrow();
    });

    it('optimize parsing routes (complexity) when there are multiple routes in a row', async () => {
        await initRouter();
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

        await registerRoutes(bestCase);
        const bestCaseComplexity = getComplexity();
        resetRouter();
        await initRouter();
        await registerRoutes(worstCase);
        const worstCaseComplexity = getComplexity();

        expect(worstCaseComplexity * ratio > bestCaseComplexity).toBeTruthy();
    });

    it('differentiate async vs non async routes', async () => {
        await initRouter();
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
        await registerRoutes(defaultRouteValues);

        expect(getRouteExecutable('sayHello')?.isAsync).toEqual(false);
        expect(getRouteExecutable('asyncSayHello')?.isAsync).toEqual(true);

        // when there is no return type we assume the function is async.
        // this is done so await is enforced in case we don't know the return type
        expect(getRouteExecutable('noReturnType')?.isAsync).toEqual(true);
    });

    it('add start and end global hooks', async () => {
        const prependHooks = {
            p1: rawHook((ctx, cb: () => void): void => cb()),
            p2: rawHook((ctx, cb: () => void): void => cb()),
        };

        const appendHooks = {
            a1: rawHook((ctx, cb: () => void): void => cb()),
            a2: rawHook((ctx, cb: () => void): void => cb()),
        };
        addStartHooks(prependHooks, false);
        addEndHooks(appendHooks, false);

        await initRouter();
        await registerRoutes(routes);

        const expectedExecutionPath = addDefaultExecutables([
            expect.objectContaining({id: 'p1', type: HandlerType.rawHook}),
            expect.objectContaining({id: 'p2', type: HandlerType.rawHook}),
            expect.objectContaining({id: 'first', type: HandlerType.hook}),
            expect.objectContaining({id: 'pets/getPet', type: HandlerType.route}),
            expect.objectContaining({id: 'last', type: HandlerType.hook}),
            expect.objectContaining({id: 'a1', type: HandlerType.rawHook}),
            expect.objectContaining({id: 'a2', type: HandlerType.rawHook}),
        ]);

        expect(getRouteExecutionPath('/pets/getPet')?.methods).toEqual(expectedExecutionPath);
        expect(() => addStartHooks(prependHooks)).toThrow('Can not add start hooks after the router has been initialized');
        expect(() => addEndHooks(appendHooks)).toThrow('Can not add end hooks after the router has been initialized');
    });

    it('header hooks should be considered public (non-private)', async () => {
        await initRouter();
        const routesWithHeaderHook = {
            auth: headersHook((ctx, h: HeadersSubset<'Authorization'>): void => {
                // Header hook with no return data and no body params
            }),
            sayHello: route((): string => 'hello'),
        } satisfies Routes;
        await registerRoutes(routesWithHeaderHook);

        const authHook = getHookExecutable('auth');
        expect(authHook).toBeDefined();
        expect(authHook!.type).toEqual(HandlerType.headerHook);
        // Header hooks should be public because they have headerNames, even if they have no return data or body params
        expect(isPublicExecutable(authHook!)).toBe(true);
    });
});
