/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach} from 'vitest';
import {MionHeaders} from '../types/context.ts';
import {registerRoutes, initRouter, resetRouter, getRouteExecutable} from '../router.ts';
import {
    getRoutePath,
    SerializableMethodsData,
    MethodsCache,
    MION_ROUTES,
    RpcError,
    JitCompiledFnData,
    HandlerType,
    RouteOnlyOptions,
    RemoteMethodOpts,
} from '@mionkit/core';
import {linkedFn, rawLinkedFn, route} from '../lib/handlers.ts';
import {Routes} from '../types/general.ts';
import {mionClientRoutes} from './client.routes.ts';
import {headersFromRecord} from '../lib/headers.ts';
import {dispatchRoute} from '../dispatch.ts';
import {runType, JitFunctions} from '@mionkit/run-types';
import {getSerializableMethod} from '../lib/remoteMethods.ts';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('PublicMethods run type functionality', () => {
    const route1 = route((ctx): string => 'something');
    const routes = {route1} satisfies Routes;

    type ClientReturn = SerializableMethodsData | RpcError<string>;

    afterEach(() => resetRouter());

    it('can validate return type ClientReturn', () => {
        const rt = runType<ClientReturn>();
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(
            validate(
                new RpcError({
                    publicMessage: 'error',
                    message: 'error',
                    type: 'test-error',
                })
            )
        ).toBe(true);
    });

    it('can validate return type ClientReturn + errors', async () => {
        await initRouter();
        await registerRoutes(routes);
        const executable = getRouteExecutable('route1')!;
        const publicMethod = getSerializableMethod(executable!);

        const response: SerializableMethodsData = {
            methods: {[publicMethod.id]: publicMethod},
            deps: {},
            purFnDeps: {},
        };

        const rt = runType<ClientReturn>();
        const rtMethodsData = runType<SerializableMethodsData>();
        const rtPublicMethods = runType<MethodsCache>();
        const typeErrorsMethodsData = rtMethodsData.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsPublicMethods = rtPublicMethods.createJitFunction(JitFunctions.typeErrors);
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrorsPublicMethods({hello: publicMethod})).toEqual([]);
        expect(typeErrorsMethodsData(response)).toEqual([]); // seems this is working but not the union type so we need to review runType Union errors
        // also only returning the Error a Union is not usefull, maybe if we detect is one of the types in the union we should return the errors of that type
        expect(typeErrors(response)).toEqual([]);
        expect(
            typeErrors(
                new RpcError({
                    publicMessage: 'error',
                    message: 'error',
                    type: 'test-error',
                })
            )
        ).toEqual([]);
    });

    it('can serialize/deserialize return type PublicMethods | RpcError>', async () => {
        await initRouter();
        await registerRoutes(routes);
        const executable = getRouteExecutable('route1')!;
        const publicMethod = getSerializableMethod(executable!);
        const response: SerializableMethodsData = {
            methods: {[publicMethod.id]: publicMethod},
            deps: {},
            purFnDeps: {},
        };
        const rt = runType<ClientReturn>();
        const stringifyJson = rt.createJitFunction(JitFunctions.stringifyJson);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const error = new RpcError({
            publicMessage: 'error',
            message: 'error',
            type: 'test-error',
        });
        const errorClone = new RpcError({
            publicMessage: 'error',
            message: 'error',
            type: 'test-error',
        });
        // operations modify the original object so we need to clone it before serializing
        const roundTrip = restoreFromJson(JSON.parse(stringifyJson(errorClone)));
        expect(roundTrip instanceof RpcError).toBeTruthy();
        expect(roundTrip).toEqual(error);
        // operations modify the original object so we need to clone it before serializing
        const responseClone: SerializableMethodsData = {
            methods: {[publicMethod.id]: structuredClone(publicMethod)},
            deps: {},
            purFnDeps: {},
        };
        const jsonStr = stringifyJson(responseClone);
        const roundTrip2 = restoreFromJson(JSON.parse(jsonStr));
        delete (publicMethod as any).handler;
        expect(roundTrip2).toEqual(response);
    });
});

describe('Client Routes should', () => {
    const privateLinkedFn = linkedFn((ctx): void => undefined);
    const publicLinkedFn = linkedFn((ctx): null => null);
    const auth = linkedFn((ctx, token: string): void => undefined);
    const route1 = route((ctx): string => 'route1');
    const route2 = route((ctx): string => 'route2');

    const routes = {
        auth: auth, // is public as has params
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

    const defaultRouteOpts: RouteOnlyOptions = {
        runOnError: false,
        serializer: 'json',
        validateParams: true,
        validateReturn: false,
        description: undefined,
    };
    const defaultLinkedFnOpts: RemoteMethodOpts = {
        runOnError: false,
        validateParams: true,
        validateReturn: false,
        description: undefined,
    };

    const methodsMetadata = {
        'users/getUser': {
            type: HandlerType.route,
            id: 'users/getUser',
            isAsync: false,
            hasReturnData: true,
            nestLevel: 1,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: [],
            linkedFnIds: ['auth', 'last'],
            pointer: ['users', 'getUser'],
            options: defaultRouteOpts,
        },
        'users/setUser': {
            type: HandlerType.route,
            id: 'users/setUser',
            isAsync: false,
            hasReturnData: true,
            nestLevel: 1,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: [],
            linkedFnIds: ['auth', 'last'],
            pointer: ['users', 'setUser'],
            options: defaultRouteOpts,
        },
        'users/pets/getUserPet': {
            type: HandlerType.route,
            id: 'users/pets/getUserPet',
            isAsync: false,
            hasReturnData: true,
            nestLevel: 2,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: [],
            linkedFnIds: ['auth', 'last'],
            pointer: ['users', 'pets', 'getUserPet'],
            options: defaultRouteOpts,
        },
        'pets/getPet': {
            type: HandlerType.route,
            id: 'pets/getPet',
            isAsync: false,
            hasReturnData: true,
            nestLevel: 1,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: [],
            linkedFnIds: ['auth', 'last'],
            pointer: ['pets', 'getPet'],
            options: defaultRouteOpts,
        },
        'pets/setPet': {
            type: HandlerType.route,
            id: 'pets/setPet',
            isAsync: false,
            hasReturnData: true,
            nestLevel: 1,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: [],
            linkedFnIds: ['auth', 'last'],
            pointer: ['pets', 'setPet'],
            options: defaultRouteOpts,
        },
        auth: {
            type: HandlerType.linkedFn,
            id: 'auth',
            isAsync: false,
            hasReturnData: false,
            nestLevel: 0,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: ['token'],
            pointer: ['auth'],
            options: defaultLinkedFnOpts,
        },
        last: {
            type: HandlerType.linkedFn,
            id: 'last',
            isAsync: false,
            hasReturnData: true,
            nestLevel: 0,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: [],
            pointer: ['last'],
            options: defaultLinkedFnOpts,
        },
    } satisfies MethodsCache;

    const methodsId = MION_ROUTES.methodsMetadataById;
    const routeMethodsId = MION_ROUTES.methodsMetadataByPath;
    const methodsPath = getRoutePath([methodsId], {prefix: '', suffix: ''});
    const routeMethodsPath = getRoutePath([routeMethodsId], {prefix: '', suffix: ''});
    const jitFnRt = runType<JitCompiledFnData>();
    const isJitCompiledFn = jitFnRt.createJitFunction(JitFunctions.isType);
    const restoreJitCompiledFn = jitFnRt.createJitFunction(JitFunctions.restoreFromJson);

    afterEach(() => resetRouter());

    it('get Remote LinkedFns Only info from id', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const methodIdList = ['auth', 'last']; // all public linkedFns
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // linkedFn is required
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedMethods = {
            auth: methodsMetadata.auth,
            last: methodsMetadata.last,
        };
        const methodsData = response.body[methodsId] as SerializableMethodsData; // serializable data for remote methods
        const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
        expect(methodsData.methods).toEqual(expectedMethods);
        Object.values(dependencies).forEach((dep) => {
            expect(isJitCompiledFn(restoreJitCompiledFn(dep))).toBe(true);
        });
    });

    it('get Remote Route info from id, it should also return the linkedFns from the ExecutionChain', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const methodIdList = ['users/getUser']; // all public methods
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // linkedFn is required (request should be authenticated)
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedMethods = {
            auth: methodsMetadata.auth,
            'users/getUser': methodsMetadata['users/getUser'],
            last: methodsMetadata['last'],
        };
        const methodsData = response.body[methodsId] as SerializableMethodsData; // serializable data for remote methods
        const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
        expect(methodsData.methods).toEqual(expectedMethods);
        Object.values(dependencies).forEach((dep) => {
            const restored = restoreJitCompiledFn(dep); // we need to restore before checking correct type
            expect(isJitCompiledFn(restored)).toBe(true);
        });
    });

    it('get All Remote Methods info when getAllRemoteMethods is true', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const methodIdList = ['auth']; // all public methods
        const getAllRemoteMethods = true;
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // linkedFn is required
                [methodsId]: [methodIdList, getAllRemoteMethods],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedMethods = methodsMetadata;
        const methodsData = response.body[methodsId] as SerializableMethodsData; // serializable data for remote methods
        const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
        expect(methodsData.methods).toEqual(expectedMethods);
        Object.values(dependencies).forEach((dep) => {
            const restored = restoreJitCompiledFn(dep); // we need to restore before checking correct type
            expect(isJitCompiledFn(restored)).toBe(true);
        });
    });

    it('get Remote Methods info from route path', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // linkedFn is required
                [routeMethodsId]: ['/users/getUser'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedMethods = {
            auth: methodsMetadata.auth,
            'users/getUser': methodsMetadata['users/getUser'],
            last: methodsMetadata.last,
        };
        const methodsData = response.body[routeMethodsId] as SerializableMethodsData; // serializable data for remote methods
        const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
        expect(methodsData.methods).toEqual(expectedMethods);
        Object.values(dependencies).forEach((dep) => {
            const restored = restoreJitCompiledFn(dep); // we need to restore before checking correct type
            expect(isJitCompiledFn(restored)).toBe(true);
        });
    });

    it('fail when remote method is private or not defined', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const methodIdList = ['parse', 'helloWorld']; // all public methods
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // linkedFn is required
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedResponse = new RpcError({
            type: 'rpc-metadata-not-found',
            publicMessage: 'Errors getting Remote Methods Metadata',
            errorData: {
                parse: 'Remote Method parse not found',
                helloWorld: 'Remote Method helloWorld not found',
            },
        });
        expect(response.body[methodsId]).toEqual(expectedResponse);
    });

    it('fail when route path is not defined', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // linkedFn is required
                [routeMethodsId]: ['/abcd'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedResponse = new RpcError({
            type: 'rpc-metadata-not-found',
            publicMessage: 'Route /abcd not found',
        });
        expect(response.body[routeMethodsId]).toEqual(expectedResponse);
    });
});

describe('Restore Client Routes jit functions', () => {
    type User = {
        id: string;
        name: string;
        surname: string;
        others: string[];
    };

    const routes = {
        users: {
            getUser: route((ctx, id: string): User => ({id, name: 'John', surname: 'Smith', others: []})),
        },
    } satisfies Routes;

    const routeMethodsId = MION_ROUTES.methodsMetadataByPath;
    const routeMethodsPath = getRoutePath([routeMethodsId], {prefix: '', suffix: ''});

    afterEach(() => resetRouter());

    it('should restore jit functions', async () => {
        await initRouter();
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                [routeMethodsId]: ['/users/getUser'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const methodsData = response.body[routeMethodsId] as SerializableMethodsData; // serializable data for remote methods
    });
});
