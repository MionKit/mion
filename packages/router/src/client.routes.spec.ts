/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders} from './types/context';
import {registerRoutes, initRouter, resetRouter, getRouteExecutable} from './router';
import {getRoutePath, PublicRpcError, SerializableJitHashes} from '@mionkit/core';
import {MION_ROUTES} from '@mionkit/core';
import {hook, rawHook, route} from './handlers';
import {Routes} from './types/general';
import {HandlerType} from './types/remoteMethods';
import {MethodsData, PublicMethods, clientRoutes} from './client.routes';
import {headersFromRecord} from './headers';
import {dispatchRoute} from './dispatch';
import {runType, JitFunctions} from '@mionkit/run-types';
import {PublicMethod} from './types/publicMethods'; // do not import type only
import {getSerializableMethod} from './remoteMethods';
import {RpcError} from '@mionkit/core';
import {JitCompiledFnData} from '@mionkit/core';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

function getExpectedJitHashes(): SerializableJitHashes {
    return {
        isType: expect.any(String),
        typeErrors: expect.any(String),
        prepareForJson: expect.any(String),
        restoreFromJson: expect.any(String),
        jsonStringify: expect.any(String),
        fromBinary: expect.any(String),
        toBinary: expect.any(String),
    };
}

describe('PublicMethods run type functionality', () => {
    const route1 = route((ctx): string => 'something');
    const routes = {route1} satisfies Routes;

    type ClientReturn = MethodsData | RpcError<string>;

    afterEach(() => resetRouter());

    it('can validate PublicMethod', () => {
        initRouter();
        registerRoutes(routes);
        const executable = getRouteExecutable('route1')!;
        const publicMethod = getSerializableMethod(executable!);
        const rt = runType<PublicMethod>();
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(publicMethod)).toBe(true);
    });

    it('can validate PublicMethod  + errors', () => {
        initRouter();
        registerRoutes(routes);
        const executable = getRouteExecutable('route1')!;
        const publicMethod = getSerializableMethod(executable!);
        const rt = runType<PublicMethod>();
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(typeErrors(publicMethod)).toEqual([]);
    });

    it('can serialize/deserialize PublicMethod', () => {
        initRouter();
        registerRoutes(routes);
        const executable = getRouteExecutable('route1')!;
        const publicMethod = getSerializableMethod(executable!);
        const rt = runType<PublicMethod>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const roundTrip = restoreFromJson(JSON.parse(jsonStringify(publicMethod)));
        // handler method does not match it's type, so we need to replace it when comparing deserialized values
        roundTrip.handler = () => 'something';
        expect(roundTrip).toEqual({
            ...publicMethod,
            handler: expect.any(Function),
        });
    });

    it('can mock PublicMethod ignoring handler', async () => {
        const rt = runType<PublicMethod>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const mock = await rt.mock();
        expect(isType(mock)).toEqual(true);
    });

    it('can validate return type ClientReturn', () => {
        const rt = runType<ClientReturn>();
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(new RpcError({statusCode: 400, publicMessage: 'error', message: 'error', type: 'test-error'}))).toBe(
            true
        );
    });

    it('can validate return type ClientReturn + errors', () => {
        initRouter();
        registerRoutes(routes);
        const executable = getRouteExecutable('route1')!;
        const publicMethod = getSerializableMethod(executable!);

        const response: MethodsData = {
            methods: {[publicMethod.id]: publicMethod},
            deps: {},
            purFnDeps: {},
        };

        const rt = runType<ClientReturn>();
        const rtMethodsData = runType<MethodsData>();
        const rtPublicMethod = runType<PublicMethod>();
        const rtPublicMethods = runType<PublicMethods>();
        const typeErrorsMethodsData = rtMethodsData.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsPublicMethod = rtPublicMethod.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsPublicMethods = rtPublicMethods.createJitFunction(JitFunctions.typeErrors);
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrorsPublicMethod(publicMethod)).toEqual([]);
        expect(typeErrorsPublicMethods({hello: publicMethod})).toEqual([]);
        expect(typeErrorsMethodsData(response)).toEqual([]); // seems this is working but not the union type so we need to review runType Union errors
        // also only returning the Error a Union is not usefull, maybe if we detect is one of the types in the union we should return the errors of that type
        expect(typeErrors(response)).toEqual([]);
        expect(typeErrors(new RpcError({statusCode: 400, publicMessage: 'error', message: 'error', type: 'test-error'}))).toEqual(
            []
        );
    });

    it('can serialize/deserialize return type PublicMethods | RpcError>', () => {
        initRouter();
        registerRoutes(routes);
        const executable = getRouteExecutable('route1')!;
        const publicMethod = getSerializableMethod(executable!);
        const response: MethodsData = {
            methods: {[publicMethod.id]: publicMethod},
            deps: {},
            purFnDeps: {},
        };
        const rt = runType<ClientReturn>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const error = new RpcError({statusCode: 400, publicMessage: 'error', message: 'error', type: 'test-error'});
        const errorClone = new RpcError({statusCode: 400, publicMessage: 'error', message: 'error', type: 'test-error'});
        // operations modify the original object so we need to clone it before serializing
        const roundTrip = restoreFromJson(JSON.parse(jsonStringify(errorClone)));
        expect(roundTrip instanceof RpcError).toBeTruthy();
        expect(roundTrip).toEqual(error);

        // operations modify the original object so we need to clone it before serializing
        const responseClone: MethodsData = {
            methods: {[publicMethod.id]: publicMethod},
            deps: {},
            purFnDeps: {},
        };
        const jsonStr = jsonStringify(responseClone);
        const roundTrip2 = restoreFromJson(JSON.parse(jsonStr));
        // we need to remove the function handler before comparing and is not restored after round trip
        delete (publicMethod as any).handler;
        expect(roundTrip2).toEqual(response);
    });
});

describe('Client Routes should', () => {
    const privateHook = hook((ctx): void => undefined);
    const publicHook = hook((ctx): null => null);
    const auth = hook((ctx, token: string): void => undefined);
    const route1 = route((ctx): string => 'route1');
    const route2 = route((ctx): string => 'route2');

    const routes = {
        auth: auth, // is public as has params
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

    const methodsMetadata = {
        'users/getUser': {
            type: HandlerType.route,
            id: 'users/getUser',
            handler: 'users.getUser' as any,
            paramsJitHashes: getExpectedJitHashes(),
            returnJitHashes: getExpectedJitHashes(),
            paramNames: [],
            hookIds: ['auth', 'last'],
        },
        'users/setUser': {
            type: HandlerType.route,
            id: 'users/setUser',
            handler: 'users.setUser' as any,
            paramsJitHashes: getExpectedJitHashes(),
            returnJitHashes: getExpectedJitHashes(),
            paramNames: [],
            hookIds: ['auth', 'last'],
        },
        'users/pets/getUserPet': {
            type: HandlerType.route,
            id: 'users/pets/getUserPet',
            handler: 'users.pets.getUserPet' as any,
            paramsJitHashes: getExpectedJitHashes(),
            returnJitHashes: getExpectedJitHashes(),
            paramNames: [],
            hookIds: ['auth', 'last'],
        },
        'pets/getPet': {
            type: HandlerType.route,
            id: 'pets/getPet',
            handler: 'pets.getPet' as any,
            paramsJitHashes: getExpectedJitHashes(),
            returnJitHashes: getExpectedJitHashes(),
            paramNames: [],
            hookIds: ['auth', 'last'],
        },
        'pets/setPet': {
            type: HandlerType.route,
            id: 'pets/setPet',
            handler: 'pets.setPet' as any,
            paramsJitHashes: getExpectedJitHashes(),
            returnJitHashes: getExpectedJitHashes(),
            paramNames: [],
            hookIds: ['auth', 'last'],
        },
        auth: {
            type: HandlerType.hook,
            id: 'auth',
            handler: 'auth' as any,
            paramsJitHashes: getExpectedJitHashes(),
            returnJitHashes: getExpectedJitHashes(),
            paramNames: ['token'],
        },
        last: {
            type: HandlerType.hook,
            id: 'last',
            handler: 'last' as any,
            paramsJitHashes: getExpectedJitHashes(),
            returnJitHashes: getExpectedJitHashes(),
            paramNames: [],
        },
    } satisfies PublicMethods;

    const methodsId = MION_ROUTES.getRemoteMethodsById;
    const routeMethodsId = MION_ROUTES.getRemoteMethodsByPath;
    const methodsPath = getRoutePath([methodsId], {prefix: '', suffix: ''});
    const routeMethodsPath = getRoutePath([routeMethodsId], {prefix: '', suffix: ''});
    const jitFnRt = runType<JitCompiledFnData>();
    const isJitCompiledFn = jitFnRt.createJitFunction(JitFunctions.isType);
    const restoreJitCompiledFn = jitFnRt.createJitFunction(JitFunctions.restoreFromJson);

    afterEach(() => resetRouter());

    it('get Remote Hooks Only info from id', async () => {
        initRouter({contextDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const methodIdList = ['auth', 'last']; // all public hooks
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedMethods = {
            auth: methodsMetadata.auth,
            last: methodsMetadata['last'],
        };
        const methodsData = response.body[methodsId] as MethodsData; // serializable data for remote methods
        const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
        expect(methodsData.methods).toEqual(expectedMethods);
        Object.values(dependencies).forEach((dep) => {
            expect(isJitCompiledFn(restoreJitCompiledFn(dep))).toBe(true);
        });
    });

    it('get Remote Route info from id, it should also return the hooks from the execution path', async () => {
        initRouter({contextDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const methodIdList = ['users/getUser']; // all public methods
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // hook is required (request should be authenticated)
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedMethods = {
            auth: methodsMetadata.auth,
            'users/getUser': methodsMetadata['users/getUser'],
            last: methodsMetadata['last'],
        };
        const methodsData = response.body[methodsId] as MethodsData; // serializable data for remote methods
        const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
        expect(methodsData.methods).toEqual(expectedMethods);
        Object.values(dependencies).forEach((dep) => {
            const restored = restoreJitCompiledFn(dep); // we need to restore before checking correct type
            expect(isJitCompiledFn(restored)).toBe(true);
        });
    });

    it('get All Remote Methods info when getAllRemoteMethods is true', async () => {
        initRouter({contextDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const methodIdList = ['auth']; // all public methods
        const getAllRemoteMethods = true;
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [methodsId]: [methodIdList, getAllRemoteMethods],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedMethods = methodsMetadata;
        const methodsData = response.body[methodsId] as MethodsData; // serializable data for remote methods
        const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
        expect(methodsData.methods).toEqual(expectedMethods);
        Object.values(dependencies).forEach((dep) => {
            const restored = restoreJitCompiledFn(dep); // we need to restore before checking correct type
            expect(isJitCompiledFn(restored)).toBe(true);
        });
    });

    it('get Remote Methods info from route path', async () => {
        initRouter({contextDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [routeMethodsId]: ['/users/getUser'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedMethods = {
            auth: methodsMetadata.auth,
            'users/getUser': methodsMetadata['users/getUser'],
            last: methodsMetadata.last,
        };
        const methodsData = response.body[routeMethodsId] as MethodsData; // serializable data for remote methods
        const dependencies = methodsData.deps; // serializable data for jit functions that are used by the remote methods
        expect(methodsData.methods).toEqual(expectedMethods);
        Object.values(dependencies).forEach((dep) => {
            const restored = restoreJitCompiledFn(dep); // we need to restore before checking correct type
            expect(isJitCompiledFn(restored)).toBe(true);
        });
    });

    it('fail when remote method is private or not defined', async () => {
        initRouter({contextDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const methodIdList = ['parse', 'helloWorld']; // all public methods
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedResponse: PublicRpcError<'rpc-metadata-not-found'> = {
            'mion:isΣrrθr': true,
            statusCode: 404,
            type: 'rpc-metadata-not-found',
            publicMessage: 'Errors getting Remote Methods Metadata',
            errorData: {
                parse: 'Remote Method parse not found',
                helloWorld: 'Remote Method helloWorld not found',
            },
        };
        expect(response.body[methodsId]).toEqual(expectedResponse);
    });

    it('fail when route path is not defined', async () => {
        initRouter({contextDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [routeMethodsId]: ['/abcd'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedResponse: PublicRpcError<'rpc-metadata-not-found'> = {
            'mion:isΣrrθr': true,
            statusCode: 404,
            type: 'rpc-metadata-not-found',
            publicMessage: 'Route /abcd not found',
        };
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

    const routeMethodsId = MION_ROUTES.getRemoteMethodsByPath;
    const routeMethodsPath = getRoutePath([routeMethodsId], {prefix: '', suffix: ''});

    afterEach(() => resetRouter());

    it('should restore jit functions', async () => {
        initRouter();
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                [routeMethodsId]: ['/users/getUser'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const methodsData = response.body[routeMethodsId] as MethodsData; // serializable data for remote methods
    });
});
