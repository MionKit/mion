/* ########
 * 2023 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_ROUTE_OPTIONS, DEFAULT_HOOK} from './constants';
import {getPublicRoutes} from './publicRoutes';
import {registerRoutes, initRouter, reset} from './router';

describe('Public Route Data should', () => {
    type SimpleUser = {name: string; surname: string};
    const hook = {hook(): void {}};
    const route1 = () => 'route1';
    const route2 = {
        route() {
            return 'route2';
        },
    };

    const routes = {
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

    const app = {
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

    beforeEach(() => reset());

    it('not generate public data when  generateRouterPublicData = false', () => {
        initRouter(app, getSharedData, {generateRouterPublicData: false});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual(null);
    });

    it('generate all the required public fields for hook and route', () => {
        initRouter(app, getSharedData, {generateRouterPublicData: true});
        const testR = {
            hook,
            route1,
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            hook: expect.objectContaining({
                isRoute: false,
                canReturnData: DEFAULT_HOOK.canReturnData,
                path: 'hook',
                inHeader: DEFAULT_HOOK.inHeader,
                fieldName: 'hook',
                enableValidation: DEFAULT_ROUTE_OPTIONS.enableValidation,
                enableSerialization: DEFAULT_ROUTE_OPTIONS.enableSerialization,
                selfPointer: ['hook'],
            }),
            route1: expect.objectContaining({
                isRoute: true,
                canReturnData: true,
                path: '/route1',
                inHeader: false,
                fieldName: '/route1',
                enableValidation: DEFAULT_ROUTE_OPTIONS.enableValidation,
                enableSerialization: DEFAULT_ROUTE_OPTIONS.enableSerialization,
                selfPointer: ['route1'],
            }),
        });
    });

    it('generate public data when suing prefix and suffix', () => {
        initRouter(app, getSharedData, {generateRouterPublicData: true, prefix: 'v1', suffix: '.json'});
        const testR = {
            hook,
            route1,
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            hook: expect.objectContaining({
                isRoute: false,
                canReturnData: DEFAULT_HOOK.canReturnData,
                path: 'hook',
                inHeader: false,
                fieldName: 'hook',
                selfPointer: ['hook'],
            }),
            route1: expect.objectContaining({
                isRoute: true,
                canReturnData: true,
                path: '/v1/route1.json',
                inHeader: false,
                fieldName: '/v1/route1.json',
                selfPointer: ['route1'],
            }),
        });
    });

    it('generate public data from some routes', () => {
        initRouter(app, getSharedData, {generateRouterPublicData: true});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({
            first: expect.objectContaining({
                path: 'first',
                fieldName: 'first',
                isRoute: false,
                selfPointer: ['first'],
            }),
            users: {
                userBefore: expect.objectContaining({
                    path: 'users/userBefore',
                    fieldName: 'userBefore',
                    isRoute: false,
                    selfPointer: ['users', 'userBefore'],
                }),
                getUser: expect.objectContaining({
                    path: '/users/getUser',
                    fieldName: '/users/getUser',
                    isRoute: true,
                    selfPointer: ['users', 'getUser'],
                }),
                setUser: expect.objectContaining({
                    path: '/users/setUser',
                    fieldName: '/users/setUser',
                    isRoute: true,
                    selfPointer: ['users', 'setUser'],
                }),
                pets: {
                    getUserPet: expect.objectContaining({
                        path: '/users/pets/getUserPet',
                        fieldName: '/users/pets/getUserPet',
                        isRoute: true,
                        selfPointer: ['users', 'pets', 'getUserPet'],
                    }),
                },
                userAfter: expect.objectContaining({
                    path: 'users/userAfter',
                    fieldName: 'userAfter',
                    isRoute: false,
                    selfPointer: ['users', 'userAfter'],
                }),
            },
            pets: {
                getPet: expect.objectContaining({
                    path: '/pets/getPet',
                    fieldName: '/pets/getPet',
                    isRoute: true,
                    selfPointer: ['pets', 'getPet'],
                }),
                setPet: expect.objectContaining({
                    path: '/pets/setPet',
                    fieldName: '/pets/setPet',
                    isRoute: true,
                    selfPointer: ['pets', 'setPet'],
                }),
            },
            last: expect.objectContaining({
                path: 'last',
                fieldName: 'last',
                isRoute: false,
                selfPointer: ['last'],
            }),
        });
    });

    it('should throw an error when route pr hook is not already created in the router', () => {
        const testR1 = {route1};
        const testR2 = {hook};
        expect(() => getPublicRoutes(testR1)).toThrow(
            `Route '/route1' not found in router. Please check you have called router.addRoutes first!`
        );
        expect(() => getPublicRoutes(testR2)).toThrow(
            `Hook 'hook' not found in router. Please check you have called router.addRoutes first!`
        );
    });
});
