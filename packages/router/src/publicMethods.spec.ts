/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_ROUTE_OPTIONS, DEFAULT_HOOK} from './constants';
import {getPublicRoutes} from './publicMethods';
import {registerRoutes, initRouter, reset} from './router';

describe('Public Mothods should', () => {
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

    it('not generate public data when  generateSpec = false', () => {
        initRouter(app, getSharedData, {generateSpec: false});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({});
    });

    it('generate all the required public fields for hook and route', () => {
        initRouter(app, getSharedData, {generateSpec: true});
        const testR = {
            hook,
            routes: {
                route1,
            },
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            hook: expect.objectContaining({
                handlerType: 'hook',
                isRoute: false,
                canReturnData: DEFAULT_HOOK.canReturnData,
                inHeader: DEFAULT_HOOK.inHeader,
                fieldName: 'hook',
                enableValidation: DEFAULT_ROUTE_OPTIONS.enableValidation,
                enableSerialization: DEFAULT_ROUTE_OPTIONS.enableSerialization,
            }),
            routes: {
                route1: expect.objectContaining({
                    handlerType: 'routes.route1',
                    isRoute: true,
                    canReturnData: true,
                    path: '/routes/route1',
                    inHeader: false,
                    enableValidation: DEFAULT_ROUTE_OPTIONS.enableValidation,
                    enableSerialization: DEFAULT_ROUTE_OPTIONS.enableSerialization,
                }),
            },
        });
    });

    it('generate public data when suing prefix and suffix', () => {
        initRouter(app, getSharedData, {generateSpec: true, prefix: 'v1', suffix: '.json'});
        const testR = {
            hook,
            route1,
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            hook: expect.objectContaining({
                isRoute: false,
                canReturnData: DEFAULT_HOOK.canReturnData,
                inHeader: false,
                fieldName: 'hook',
            }),
            route1: expect.objectContaining({
                isRoute: true,
                canReturnData: true,
                path: '/v1/route1.json',
                inHeader: false,
            }),
        });
    });

    it('generate public data from some routes', () => {
        initRouter(app, getSharedData, {generateSpec: true});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({
            first: expect.objectContaining({
                fieldName: 'first',
                isRoute: false,
            }),
            users: {
                userBefore: expect.objectContaining({
                    fieldName: 'userBefore',
                    isRoute: false,
                }),
                getUser: expect.objectContaining({
                    path: '/users/getUser',
                    isRoute: true,
                }),
                setUser: expect.objectContaining({
                    path: '/users/setUser',
                    isRoute: true,
                }),
                pets: {
                    getUserPet: expect.objectContaining({
                        path: '/users/pets/getUserPet',
                        isRoute: true,
                    }),
                },
                userAfter: expect.objectContaining({
                    fieldName: 'userAfter',
                    isRoute: false,
                }),
            },
            pets: {
                getPet: expect.objectContaining({
                    path: '/pets/getPet',
                    isRoute: true,
                }),
                setPet: expect.objectContaining({
                    path: '/pets/setPet',
                    isRoute: true,
                }),
            },
            last: expect.objectContaining({
                fieldName: 'last',
                isRoute: false,
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
