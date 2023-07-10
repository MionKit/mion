/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_ROUTE_OPTIONS, DEFAULT_HOOK} from './constants';
import {getPublicRoutes} from './publicMethods';
import {registerRoutes, initRouter, reset, getRouteDefaultParams} from './router';
import {getFunctionReflectionMethods} from '@mionkit/runtype';

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
        initRouter(app, getSharedData, {getPublicRoutesData: false});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({});
    });

    it('generate all the required public fields for hook and route', () => {
        initRouter(app, getSharedData, {getPublicRoutesData: true});
        const testR = {
            hook,
            routes: {
                route1,
            },
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            hook: expect.objectContaining({
                _handler: 'hook',
                isRoute: false,
                canReturnData: DEFAULT_HOOK.canReturnData,
                inHeader: DEFAULT_HOOK.inHeader,
                fieldName: 'hook',
                enableValidation: DEFAULT_ROUTE_OPTIONS.enableValidation,
                enableSerialization: DEFAULT_ROUTE_OPTIONS.enableSerialization,
            }),
            routes: {
                route1: expect.objectContaining({
                    _handler: 'routes.route1',
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

    it('be able to convert serialized handler types to json, deserialize and use them for validation', () => {
        initRouter(app, getSharedData, {getPublicRoutesData: true});
        const testR = {
            addMilliseconds: (app, ctx, ms: number, date: Date) => date.setMilliseconds(date.getMilliseconds() + ms),
        };
        const api = registerRoutes(testR);
        const reflection = getFunctionReflectionMethods(
            testR.addMilliseconds,
            DEFAULT_ROUTE_OPTIONS.reflectionOptions,
            getRouteDefaultParams().length
        );
        const date = new Date('2022-12-19T00:24:00.00');

        // ###### Validation ######
        // Dates does not trow an error when validating, TODO: investigate if is an error in deepkit
        const notaNumber = {code: 'type', message: 'Not a number', path: ''};
        const expectedValidationError = [[notaNumber], []];
        expect(reflection.validateParams([123, date]).errors).toEqual([[], []]);
        expect(reflection.validateParams([123, date]).errors).toEqual([[], []]);
        expect(reflection.validateParams(['noNumber', new Date('noDate')]).errors).toEqual(expectedValidationError);
        expect(reflection.validateParams(['noNumber', new Date('noDate')]).errors).toEqual(expectedValidationError);

        // ###### Serialization ######
        const deserialized = reflection.deserializeParams([123, '2022-12-19T00:24:00.00']);
        const deserializedFromRestored = reflection.deserializeParams([123, '2022-12-19T00:24:00.00']);
        expect(deserialized).toEqual([123, date]);
        expect(deserializedFromRestored).toEqual([123, date]);

        // Dates does not trow an error when serializing, TODO: investigate if is an error in deepkit
        const expectedThrownError = 'Validation error:\n(type): Cannot convert noNumber to number';
        expect(() => {
            reflection.deserializeParams(['noNumber', 'noDate']);
        }).toThrow(expectedThrownError);
        expect(() => {
            reflection.deserializeParams(['noNumber', 'noDate']);
        }).toThrow(expectedThrownError);
    });

    it('generate public data when suing prefix and suffix', () => {
        initRouter(app, getSharedData, {getPublicRoutesData: true, prefix: 'v1', suffix: '.json'});
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
        initRouter(app, getSharedData, {getPublicRoutesData: true});
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
