/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_ROUTE_OPTIONS, DEFAULT_HOOK} from './constants';
import {getPublicRoutes} from './publicMethods';
import {registerRoutes, initRouter, resetRouter, getRouteDefaultParams} from './router';
import {getFunctionReflectionMethods} from '@mionkit/runtype';
import {Routes} from './types';

describe('Public Mothods should', () => {
    const privateHook = (ctx): void => undefined;
    const paramsHook = (ctx, s: string): void => undefined;
    const route1 = () => 'route1';
    const route2 = {
        route() {
            return 'route2';
        },
    };

    const routes = {
        first: {hook: paramsHook}, // is public as has params
        parse: {rawHook: (ctx, req, resp, opts): void => undefined}, // private
        users: {
            userBefore: {hook: privateHook}, // private
            getUser: route1, // public
            setUser: route2, // public
            pets: {
                getUserPet: route2, // public
            },
            userAfter: {hook: privateHook}, // private
        },
        pets: {
            getPet: route1, // public
            setPet: route2, // public
        },
        last: {hook: privateHook, canReturnData: true}, // public as canReturnData
    } satisfies Routes;

    const shared = {auth: {me: null as any}};
    const getSharedData = (): typeof shared => shared;

    beforeEach(() => resetRouter());

    it('not generate public data when  generateSpec = false', () => {
        initRouter({sharedDataFactory: getSharedData, getPublicRoutesData: false});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({});
    });

    it('generate all the required public fields for hook and route', () => {
        initRouter({sharedDataFactory: getSharedData, getPublicRoutesData: true});
        const testR = {
            auth: {hook: paramsHook},
            routes: {
                route1,
            },
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            auth: expect.objectContaining({
                _handler: 'auth', // to be used by codegen so need to be a valid js syntax
                isRoute: false,
                id: 'auth',
                enableValidation: DEFAULT_ROUTE_OPTIONS.enableValidation,
                enableSerialization: DEFAULT_ROUTE_OPTIONS.enableSerialization,
            }),
            routes: {
                route1: expect.objectContaining({
                    _handler: 'routes.route1', // to be used by codegen so need to be a valid js syntax
                    isRoute: true,
                    id: 'routes-route1',
                    enableValidation: DEFAULT_ROUTE_OPTIONS.enableValidation,
                    enableSerialization: DEFAULT_ROUTE_OPTIONS.enableSerialization,
                }),
            },
        });
    });

    it('be able to convert serialized handler types to json, deserialize and use them for validation', () => {
        initRouter({sharedDataFactory: getSharedData, getPublicRoutesData: true});
        const testR = {
            addMilliseconds: (ctx, ms: number, date: Date) => date.setMilliseconds(date.getMilliseconds() + ms),
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
        initRouter({sharedDataFactory: getSharedData, getPublicRoutesData: true, prefix: 'v1', suffix: '.json'});
        const testR = {
            auth: {hook: paramsHook},
            route1,
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            auth: expect.objectContaining({
                isRoute: false,
                inHeader: false,
                id: 'auth',
            }),
            route1: expect.objectContaining({
                isRoute: true,
                id: 'route1',
                inHeader: false,
            }),
        });
    });

    it('generate public data for pulbic routes only', () => {
        initRouter({sharedDataFactory: getSharedData, getPublicRoutesData: true});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({
            first: expect.objectContaining({
                id: 'first',
                isRoute: false,
            }),
            parse: null,
            users: {
                userBefore: null,
                getUser: expect.objectContaining({
                    id: 'users-getUser',
                    isRoute: true,
                }),
                setUser: expect.objectContaining({
                    id: 'users-setUser',
                    isRoute: true,
                }),
                pets: {
                    getUserPet: expect.objectContaining({
                        id: 'users-pets-getUserPet',
                        isRoute: true,
                    }),
                },
                userAfter: null,
            },
            pets: {
                getPet: expect.objectContaining({
                    id: 'pets-getPet',
                    isRoute: true,
                }),
                setPet: expect.objectContaining({
                    id: 'pets-setPet',
                    isRoute: true,
                }),
            },
            last: expect.objectContaining({
                id: 'last',
                isRoute: false,
            }),
        });
    });

    it('should throw an error when route pr hook is not already created in the router', () => {
        const testR1 = {route1};
        const testR2 = {hook1: {hook: paramsHook}};
        expect(() => getPublicRoutes(testR1)).toThrow(
            `Route 'route1' not found in router. Please check you have called router.addRoutes first!`
        );
        expect(() => getPublicRoutes(testR2)).toThrow(
            `Hook 'hook1' not found in router. Please check you have called router.addRoutes first!`
        );
    });
});
