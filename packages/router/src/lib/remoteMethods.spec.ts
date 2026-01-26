/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getPublicApi} from './remoteMethods';
import {registerRoutes, initRouter, resetRouter} from '../router';
import {CallContext} from '../types/context';
import {Routes} from '../types/general';
import {LinkedFnMethod, RouteMethod} from '../types/remoteMethods';
import {getJitFnHashes, HandlerType} from '@mionkit/core';
import {linkedFn, rawLinkedFn, route} from './handlers';
import {getJitUtils} from '@mionkit/core';

describe('Public Methods should', () => {
    const privateLinkedFn = linkedFn((ctx): void => undefined);
    const publicLinkedFn = linkedFn((ctx): null => null);
    const paramsLinkedFn = linkedFn((ctx, s: string): void => undefined);
    const route1 = route((ctx): string => 'route1');
    const route2 = route((ctx): string => 'route2');

    const routes = {
        first: paramsLinkedFn, // is public as has params
        parse: rawLinkedFn((ctx, req: unknown, resp: unknown, opts: unknown): void => undefined), // private
        users: {
            userBefore: privateLinkedFn, // private
            getUser: route1, // public
            setUser: route2, // public
            pets: {
                getUserPet: route2, // public
            },
            userAfter: privateLinkedFn, // private
        },
        pets: {
            getPet: route1, // public
            setPet: route2, // public
        },
        last: publicLinkedFn, // public LinkedFn
    } satisfies Routes;

    const shared = {auth: {me: null as any}};
    const getSharedData = (): typeof shared => shared;

    beforeEach(() => resetRouter());

    it('not generate public data when  generateSpec = false', async () => {
        await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: false});
        const publicExecutables = await registerRoutes(routes);

        expect(publicExecutables).toEqual({});
    });

    it('generate all the required public fields for linkedFn and route', async () => {
        await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
        const testR = {
            auth: paramsLinkedFn,
            routes: {
                route1,
            },
        };
        const api = await registerRoutes(testR);

        expect(api.auth).toEqual(
            expect.objectContaining({
                type: HandlerType.linkedFn,
                id: 'auth',
                paramsJitHash: expect.any(String),
                returnJitHash: expect.any(String),
                paramNames: ['s'],
            } as Partial<LinkedFnMethod>)
        );

        expect(api.routes.route1).toEqual(
            expect.objectContaining({
                type: HandlerType.route,
                id: 'routes/route1',
                paramsJitHash: expect.any(String),
                returnJitHash: expect.any(String),
                paramNames: [],
            } as Partial<RouteMethod>)
        );
    });

    it('be able to convert serialized handler types to json, deserialize and use them for validation', async () => {
        await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
        const testR = {
            addMilliseconds: route((ctx, ms: number, date: Date): number => date.setMilliseconds(date.getMilliseconds() + ms)),
        };
        const api = await registerRoutes(testR);

        const hashes = getJitFnHashes(api.addMilliseconds.paramsJitHash);
        const compiledIsType = getJitUtils().getJIT(hashes.isType)!;
        const compiledRestoreFromJson = getJitUtils().getJIT(hashes.restoreFromJson)!;
        const compiledPrepareForJson = getJitUtils().getJIT(hashes.prepareForJson)!;

        const isTypeClosure = new Function('utl', compiledIsType.code);
        const restoreFromJsonClosure = new Function('utl', compiledRestoreFromJson.code);
        const prepareForJsonClosure = new Function('utl', compiledPrepareForJson.code);

        const isType = isTypeClosure(getJitUtils());
        const restoreFromJson = restoreFromJsonClosure(getJitUtils());
        const prepareForJson = prepareForJsonClosure(getJitUtils());

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

    it('generate public data when suing prefix and suffix', async () => {
        await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true, prefix: 'v1', suffix: '.json'});
        const testR = {
            auth: paramsLinkedFn,
            route1,
        };
        const api = await registerRoutes(testR);

        expect(api).toEqual({
            auth: expect.objectContaining({
                type: HandlerType.linkedFn,
                id: 'auth',
            }),
            route1: expect.objectContaining({
                type: HandlerType.route,
                id: 'route1',
            }),
        });
    });

    it('generate public data for public routes only', async () => {
        await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
        const publicExecutables = await registerRoutes(routes);

        expect(publicExecutables).toEqual({
            first: expect.objectContaining({
                type: HandlerType.linkedFn,
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
                type: HandlerType.linkedFn,
                id: 'last',
            }),
        });
    });

    it('should throw an error when route or linkedFn is not already created in the router', () => {
        const testR1 = {route1};
        const testR2 = {linkedFn1: paramsLinkedFn};
        expect(() => getPublicApi(testR1)).toThrow(
            `Route or LinkedFn route1 not found. Please check you have called router.registerRoutes first.`
        );
        expect(() => getPublicApi(testR2)).toThrow(
            `Route or LinkedFn linkedFn1 not found. Please check you have called router.registerRoutes first.`
        );
    });

    it('should serialize remote method type skipping the context parameter', async () => {
        await initRouter({contextDataFactory: getSharedData, getPublicRoutesData: true});
        const routes = {
            sayHello: route((ctx: CallContext, name: string): string => `Hello ${name}`),
        };
        const api = await registerRoutes(routes);
        expect(api.sayHello).toEqual(
            expect.objectContaining({
                type: HandlerType.route,
                id: 'sayHello',
                paramNames: ['name'],
            } as Partial<RouteMethod>)
        );
    });
});
