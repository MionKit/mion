/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_ROUTE_OPTIONS} from './constants';
import {getRemoteMethodsMetadata} from './remoteMethodsMetadata';
import {registerRoutes, initRouter, resetRouter, getRouteDefaultParams} from './router';
import {getFunctionReflectionMethods} from '@mionkit/reflection';
import {CallContext} from './types/context';
import {Routes} from './types/general';
import {ProcedureType} from './types/procedures';
import {hook, rawHook, route} from './initFunctions';

describe('Public Methods should', () => {
    const privateHook = hook((ctx): void => undefined);
    const publicHook = hook((ctx): null => null);
    const paramsHook = hook((ctx, s: string): void => undefined);
    const route1 = route(() => 'route1');
    const route2 = route(() => 'route2');

    const routes = {
        first: paramsHook, // is public as has params
        parse: rawHook((ctx, req, resp, opts): void => undefined), // private
        users: {
            userBefore: privateHook, // private
            getUser: route1, // public
            setUser: route2, // public
            pets: {
                getUserPet: route2, // public
            },
            userAfter: privateHook, // private
        },
        pets: {
            getPet: route1, // public
            setPet: route2, // public
        },
        last: publicHook, // public Hook
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
            auth: paramsHook,
            routes: {
                route1,
            },
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            auth: expect.objectContaining({
                type: ProcedureType.hook,
                handler: 'auth', // to be used by codegen so need to be a valid js syntax
                id: 'auth',
                useValidation: DEFAULT_ROUTE_OPTIONS.useValidation,
                useSerialization: DEFAULT_ROUTE_OPTIONS.useSerialization,
            }),
            routes: {
                route1: expect.objectContaining({
                    type: ProcedureType.route,
                    handler: 'routes.route1', // to be used by codegen so need to be a valid js syntax
                    id: 'routes-route1',
                    useValidation: DEFAULT_ROUTE_OPTIONS.useValidation,
                    useSerialization: DEFAULT_ROUTE_OPTIONS.useSerialization,
                }),
            },
        });
    });

    it('be able to convert serialized handler types to json, deserialize and use them for validation', () => {
        initRouter({sharedDataFactory: getSharedData, getPublicRoutesData: true});
        const testR = {
            addMilliseconds: route((ctx, ms: number, date: Date) => date.setMilliseconds(date.getMilliseconds() + ms)),
        };
        const api = registerRoutes(testR);
        const reflection = getFunctionReflectionMethods(
            testR.addMilliseconds.handler,
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
            auth: paramsHook,
            route1,
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            auth: expect.objectContaining({
                type: ProcedureType.hook,
                id: 'auth',
            }),
            route1: expect.objectContaining({
                type: ProcedureType.route,
                id: 'route1',
            }),
        });
    });

    it('generate public data for public routes only', () => {
        initRouter({sharedDataFactory: getSharedData, getPublicRoutesData: true});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({
            first: expect.objectContaining({
                type: ProcedureType.hook,
                id: 'first',
            }),
            parse: null,
            users: {
                userBefore: null,
                getUser: expect.objectContaining({
                    type: ProcedureType.route,
                    id: 'users-getUser',
                }),
                setUser: expect.objectContaining({
                    type: ProcedureType.route,
                    id: 'users-setUser',
                }),
                pets: {
                    getUserPet: expect.objectContaining({
                        type: ProcedureType.route,
                        id: 'users-pets-getUserPet',
                    }),
                },
                userAfter: null,
            },
            pets: {
                getPet: expect.objectContaining({
                    type: ProcedureType.route,
                    id: 'pets-getPet',
                }),
                setPet: expect.objectContaining({
                    type: ProcedureType.route,
                    id: 'pets-setPet',
                }),
            },
            last: expect.objectContaining({
                type: ProcedureType.hook,
                id: 'last',
            }),
        });
    });

    it('should throw an error when route or hook is not already created in the router', () => {
        const testR1 = {route1};
        const testR2 = {hook1: paramsHook};
        expect(() => getRemoteMethodsMetadata(testR1)).toThrow(
            `Route or Hook route1 not found. Please check you have called router.registerRoutes first.`
        );
        expect(() => getRemoteMethodsMetadata(testR2)).toThrow(
            `Route or Hook hook1 not found. Please check you have called router.registerRoutes first.`
        );
    });

    it('should serialize remote method type skipping the context parameter', () => {
        initRouter({sharedDataFactory: getSharedData, getPublicRoutesData: true});
        const routes = {
            sayHello: route((ctx: CallContext, name: string): string => `Hello ${name}`),
        };
        const api = registerRoutes(routes);
        const serializedFunction: any = api.sayHello.serializedTypes[0]; // SerializedTypeFunction);
        expect(serializedFunction?.parameters?.length).toEqual(1);
    });
});
