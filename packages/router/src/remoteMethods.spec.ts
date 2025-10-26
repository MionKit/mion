/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getPublicApi} from './remoteMethods';
import {registerRoutes, initRouter, resetRouter} from './router';
import {CallContext} from './types/context';
import {Routes} from './types/general';
import {HandlerType} from './types/remoteMethods';
import {hook, rawHook, route} from './handlers';
import {jitUtils} from '@mionkit/core';

function hasSerializableHashes(paramNames?: string[]) {
    return {
        isType: expect.any(String),
        typeErrors: expect.any(String),
        prepareForJson: expect.any(String),
        restoreFromJson: expect.any(String),
        jsonStringify: expect.any(String),
    };
}

describe('Public Methods should', () => {
    const privateHook = hook((ctx): void => undefined);
    const publicHook = hook((ctx): null => null);
    const paramsHook = hook((ctx, s: string): void => undefined);
    const route1 = route((ctx): string => 'route1');
    const route2 = route((ctx): string => 'route2');

    const routes = {
        first: paramsHook, // is public as has params
        parse: rawHook((ctx, req: unknown, resp: unknown, opts: unknown): void => undefined), // private
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
        initRouter({contextDataFactory: getSharedData, getPublicRoutesData: false});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({});
    });

    it('generate all the required public fields for hook and route', () => {
        initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
        const testR = {
            auth: paramsHook,
            routes: {
                route1,
            },
        };
        const api = registerRoutes(testR);

        expect(api.auth).toEqual(
            expect.objectContaining({
                type: HandlerType.hook,
                handler: 'auth', // to be used by codegen so need to be a valid js syntax
                id: 'auth',
                paramsJitHashes: hasSerializableHashes(['s']),
                returnJitHashes: hasSerializableHashes(),
                paramNames: ['s'],
            })
        );

        expect(api.routes.route1).toEqual(
            expect.objectContaining({
                type: HandlerType.route,
                handler: 'routes.route1', // to be used by codegen so need to be a valid js syntax
                id: 'routes/route1',
                paramsJitHashes: hasSerializableHashes([]),
                returnJitHashes: hasSerializableHashes(),
                paramNames: [],
            })
        );
    });

    it('be able to convert serialized handler types to json, deserialize and use them for validation', () => {
        initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
        const testR = {
            addMilliseconds: route((ctx, ms: number, date: Date): number => date.setMilliseconds(date.getMilliseconds() + ms)),
        };
        const api = registerRoutes(testR);

        const compiledIsType = jitUtils.getJIT(api.addMilliseconds.paramsJitHashes.isType)!;
        const compiledRestoreFromJson = jitUtils.getJIT(api.addMilliseconds.paramsJitHashes.restoreFromJson)!;
        const compiledPrepareForJson = jitUtils.getJIT(api.addMilliseconds.paramsJitHashes.prepareForJson)!;

        const isTypeClosure = new Function('utl', compiledIsType.code);
        const restoreFromJsonClosure = new Function('utl', compiledRestoreFromJson.code);
        const prepareForJsonClosure = new Function('utl', compiledPrepareForJson.code);

        const isType = isTypeClosure(jitUtils);
        const restoreFromJson = restoreFromJsonClosure(jitUtils);
        const prepareForJson = prepareForJsonClosure(jitUtils);

        const date = new Date('2022-12-19T00:24:00.00');

        // ###### Validation ######
        expect(isType([123, date])).toEqual(true);
        expect(isType([123, date])).toEqual(true);
        expect(isType(['noNumber', new Date('noDate')])).toEqual(false);
        expect(isType(['noNumber', new Date('noDate')])).toEqual(false);

        // ###### Serialization ######
        const deserialized = restoreFromJson([123, '2022-12-19T00:24:00.00']);
        expect(deserialized).toEqual([123, date]);

        // ###### Deserialization ######
        const serialized = prepareForJson([123, date]);
        expect(serialized).toEqual([123, date]);
    });

    it('generate public data when suing prefix and suffix', () => {
        initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true, prefix: 'v1', suffix: '.json'});
        const testR = {
            auth: paramsHook,
            route1,
        };
        const api = registerRoutes(testR);

        expect(api).toEqual({
            auth: expect.objectContaining({
                type: HandlerType.hook,
                id: 'auth',
            }),
            route1: expect.objectContaining({
                type: HandlerType.route,
                id: 'route1',
            }),
        });
    });

    it('generate public data for public routes only', () => {
        initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
        const publicExecutables = registerRoutes(routes);

        expect(publicExecutables).toEqual({
            first: expect.objectContaining({
                type: HandlerType.hook,
                id: 'first',
            }),
            parse: null,
            users: {
                userBefore: null,
                getUser: expect.objectContaining({
                    type: HandlerType.route,
                    id: 'users/getUser',
                }),
                setUser: expect.objectContaining({
                    type: HandlerType.route,
                    id: 'users/setUser',
                }),
                pets: {
                    getUserPet: expect.objectContaining({
                        type: HandlerType.route,
                        id: 'users/pets/getUserPet',
                    }),
                },
                userAfter: null,
            },
            pets: {
                getPet: expect.objectContaining({
                    type: HandlerType.route,
                    id: 'pets/getPet',
                }),
                setPet: expect.objectContaining({
                    type: HandlerType.route,
                    id: 'pets/setPet',
                }),
            },
            last: expect.objectContaining({
                type: HandlerType.hook,
                id: 'last',
            }),
        });
    });

    it('should throw an error when route or hook is not already created in the router', () => {
        const testR1 = {route1};
        const testR2 = {hook1: paramsHook};
        expect(() => getPublicApi(testR1)).toThrow(
            `Route or Hook route1 not found. Please check you have called router.registerRoutes first.`
        );
        expect(() => getPublicApi(testR2)).toThrow(
            `Route or Hook hook1 not found. Please check you have called router.registerRoutes first.`
        );
    });

    it('should serialize remote method type skipping the context parameter', () => {
        initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
        const routes = {
            sayHello: route((ctx: CallContext, name: string): string => `Hello ${name}`),
        };
        const api = registerRoutes(routes);
        expect(api.sayHello.paramNames?.length).toEqual(1);
    });
});
