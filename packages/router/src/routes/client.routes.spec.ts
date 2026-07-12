/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach} from 'vitest';
import {MionHeaders} from '../types/context.ts';
import {registerRoutes, initRouter, resetRouter, getRouteExecutable, initMionRouter} from '../router.ts';
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
    CoreRouterOptions,
    SerializerModes,
} from '@mionjs/core';
import {middleFn, rawMiddleFn, route} from '../lib/handlers.ts';
import {Routes} from '../types/general.ts';
import {mionClientRoutes} from './client.routes.ts';
import {headersFromRecord} from '../lib/headers.ts';
import {dispatchRoute} from '../dispatch.ts';
import {createValidate, createGetValidationErrors, createJsonEncoder, createJsonDecoder} from '@mionjs/run-types';
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
        const validate = createValidate<ClientReturn>();
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

        const typeErrorsMethodsData = createGetValidationErrors<SerializableMethodsData>();
        const typeErrorsPublicMethods = createGetValidationErrors<MethodsCache>();
        const typeErrors = createGetValidationErrors<ClientReturn>();

        expect(typeErrorsPublicMethods({hello: publicMethod})).toEqual([]);
        expect(typeErrorsMethodsData(response)).toEqual([]);
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
        const encodeJson = createJsonEncoder<ClientReturn>();
        const decodeJson = createJsonDecoder<ClientReturn>();
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
        // operations may modify the original object so we clone it before serializing
        const roundTrip = decodeJson(encodeJson(errorClone)!);
        expect(roundTrip instanceof RpcError).toBeTruthy();
        expect(roundTrip).toEqual(error);
        const responseClone: SerializableMethodsData = {
            methods: {[publicMethod.id]: structuredClone(publicMethod)},
            deps: {},
            purFnDeps: {},
        };
        const jsonStr = encodeJson(responseClone);
        const roundTrip2 = decodeJson(jsonStr!);
        delete (publicMethod as any).handler;
        expect(roundTrip2).toEqual(response);
    });
});

describe('Client Routes should', () => {
    const privateMiddleFn = middleFn((ctx): void => undefined);
    const publicMiddleFn = middleFn((ctx): null => null);
    const auth = middleFn((ctx, token: string): void => undefined);
    const route1 = route((ctx): string => 'route1');
    const route2 = route((ctx): string => 'route2');

    const routes = {
        auth: auth, // is public as has params
        parse: rawMiddleFn((ctx, req: unknown, resp: unknown, opts: unknown): void => undefined), // private
        users: {
            userBefore: privateMiddleFn, // private
            getUser: route1, // public
            setUser: route2, // public
            pets: {
                getUserPet: route2, // public
            },
            userAfter: privateMiddleFn, // private
        },
        pets: {
            getPet: route1, // public
            setPet: route2, // public
        },
        last: publicMiddleFn, // public MiddleFn
    } satisfies Routes;

    const shared = {auth: {me: null as any}};
    const getSharedData = (): typeof shared => shared;

    const defaultRouteOpts: RouteOnlyOptions = {
        runOnError: false,
        serializer: 'json',
        validateParams: true,
        validateReturn: false,
        description: undefined,
        isMutation: undefined,
    };
    const defaultMiddleFnOpts: RemoteMethodOpts = {
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
            middleFnIds: ['auth', 'last'],
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
            middleFnIds: ['auth', 'last'],
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
            middleFnIds: ['auth', 'last'],
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
            middleFnIds: ['auth', 'last'],
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
            middleFnIds: ['auth', 'last'],
            pointer: ['pets', 'setPet'],
            options: defaultRouteOpts,
        },
        auth: {
            type: HandlerType.middleFn,
            id: 'auth',
            isAsync: false,
            hasReturnData: false,
            nestLevel: 0,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: ['token'],
            pointer: ['auth'],
            options: defaultMiddleFnOpts,
        },
        last: {
            type: HandlerType.middleFn,
            id: 'last',
            isAsync: false,
            hasReturnData: true,
            nestLevel: 0,
            paramsJitHash: expect.any(String),
            returnJitHash: expect.any(String),
            paramNames: [],
            pointer: ['last'],
            options: defaultMiddleFnOpts,
        },
    } satisfies MethodsCache;

    const methodsId = MION_ROUTES.methodsMetadataById;
    const emptyRouterOpts: CoreRouterOptions = {basePath: '', suffix: '', autoGenerateErrorId: false};
    const methodsPath = getRoutePath([methodsId], emptyRouterOpts);
    const isJitCompiledFn = createValidate<JitCompiledFnData>();
    // deps ride the (already parsed) JSON response; encode+decode replays the wire trip
    const encodeJitCompiledFn = createJsonEncoder<JitCompiledFnData>();
    const decodeJitCompiledFn = createJsonDecoder<JitCompiledFnData>();
    const restoreJitCompiledFn = (dep: unknown) =>
        decodeJitCompiledFn(encodeJitCompiledFn(structuredClone(dep) as JitCompiledFnData)!);

    afterEach(() => resetRouter());

    it('get Remote MiddleFns Only info from id', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const methodIdList = ['auth', 'last']; // all public middleFns
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // middleFn is required
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

    it('get Remote Route info from id, it should also return the middleFns from the ExecutionChain', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const methodIdList = ['users/getUser']; // all public methods
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // middleFn is required (request should be authenticated)
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
                auth: ['token'], // middleFn is required
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

    it('fail when remote method is private or not defined', async () => {
        await initRouter({contextDataFactory: getSharedData});
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const methodIdList = ['parse', 'helloWorld']; // all public methods
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // middleFn is required
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

    const methodsId = MION_ROUTES.methodsMetadataById;
    const emptyRouterOpts: CoreRouterOptions = {basePath: '', suffix: '', autoGenerateErrorId: false};
    const methodsPath = getRoutePath([methodsId], emptyRouterOpts);

    afterEach(() => resetRouter());

    it('should restore jit functions', async () => {
        await initRouter();
        await registerRoutes(routes);
        await registerRoutes(mionClientRoutes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                [methodsId]: [['users/getUser'], true],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const methodsData = response.body[methodsId] as SerializableMethodsData;
    });
});

describe('methodsMetadata middleware should force JSON serialization', () => {
    const metadataKey = MION_ROUTES.methodsMetadata;

    afterEach(() => resetRouter());

    it('should force stringifyJson when route uses default json serializer', async () => {
        const routes = {
            sayHello: route((ctx, name: string): string => `Hello, ${name}!`),
        } satisfies Routes;
        await initMionRouter(routes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                sayHello: ['World'],
                [metadataKey]: [['sayHello']],
            }),
        };
        const response = await dispatchRoute('/sayHello', request.body, request.headers, headersFromRecord({}), request, {});

        expect(response.serializer).toBe(SerializerModes.stringifyJson);
        expect(typeof response.rawBody).toBe('string');
        const parsed = JSON.parse(response.rawBody as string);
        expect(parsed.sayHello).toBe('Hello, World!');
        // stringifyJson serializes union return type as [discriminatorIndex, value]
        const metadataRaw = parsed[metadataKey];
        expect(metadataRaw).toBeDefined();
        const metadata = (Array.isArray(metadataRaw) ? metadataRaw[1] : metadataRaw) as SerializableMethodsData;
        expect(metadata.methods).toHaveProperty('sayHello');
    });

    it('should keep stringifyJson when route already uses stringifyJson serializer', async () => {
        const routes = {
            sayHello: route((ctx, name: string): string => `Hello, ${name}!`, {serializer: 'stringifyJson'}),
        } satisfies Routes;
        await initMionRouter(routes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                sayHello: ['World'],
                [metadataKey]: [['sayHello']],
            }),
        };
        const response = await dispatchRoute('/sayHello', request.body, request.headers, headersFromRecord({}), request, {});

        expect(response.serializer).toBe(SerializerModes.stringifyJson);
        expect(typeof response.rawBody).toBe('string');
        const parsed = JSON.parse(response.rawBody as string);
        expect(parsed.sayHello).toBe('Hello, World!');
        const metadataRaw = parsed[metadataKey];
        expect(metadataRaw).toBeDefined();
        const metadata = (Array.isArray(metadataRaw) ? metadataRaw[1] : metadataRaw) as SerializableMethodsData;
        expect(metadata.methods).toHaveProperty('sayHello');
    });

    it('should force stringifyJson when route uses binary serializer', async () => {
        const routes = {
            sayHello: route((ctx, name: string): string => `Hello, ${name}!`, {serializer: 'binary'}),
        } satisfies Routes;
        await initMionRouter(routes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                sayHello: ['World'],
                [metadataKey]: [['sayHello']],
            }),
        };
        const response = await dispatchRoute('/sayHello', request.body, request.headers, headersFromRecord({}), request, {});

        expect(response.serializer).toBe(SerializerModes.stringifyJson);
        expect(typeof response.rawBody).toBe('string');
        const parsed = JSON.parse(response.rawBody as string);
        expect(parsed.sayHello).toBe('Hello, World!');
        const metadataRaw = parsed[metadataKey];
        expect(metadataRaw).toBeDefined();
        const metadata = (Array.isArray(metadataRaw) ? metadataRaw[1] : metadataRaw) as SerializableMethodsData;
        expect(metadata.methods).toHaveProperty('sayHello');
    });

    it('should keep original serializer when methodsMetadata is not requested', async () => {
        const routes = {
            sayHello: route((ctx, name: string): string => `Hello, ${name}!`),
        } satisfies Routes;
        await initMionRouter(routes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                sayHello: ['World'],
            }),
        };
        const response = await dispatchRoute('/sayHello', request.body, request.headers, headersFromRecord({}), request, {});

        // Default serializer is 'json' (SerializerModes.json)
        expect(response.serializer).toBe(SerializerModes.json);
        expect(response.body.sayHello).toBe('Hello, World!');
    });
});
