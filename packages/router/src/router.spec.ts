/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    addRoutes,
    geHooksSize,
    geSize,
    getComplexity,
    getHookExecutable,
    getRouteExecutionPath,
    getRouteExecutable,
    reset,
    setRouterOptions,
} from './router';
import {Handler, Hook, Route, RouteObject, Routes} from './types';

describe('router should', () => {
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

        expect(geSize()).toEqual(5);
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

        expect(geSize()).toEqual(5);
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
            'Invalid hook: postProcess. Naming collision, the fieldName process has been already used',
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

        console.log('bestCaseComplexity', bestCaseComplexity);
        console.log('worstCaseComplexity', worstCaseComplexity);

        expect(worstCaseComplexity * ratio > bestCaseComplexity).toBeTruthy();
    });

    it('should extend routes types', () => {
        // TODO extend route/hook type and add to readme
        type MyRoute = Route & {};
    });
});
