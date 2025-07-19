/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders} from './types/context';
import {registerRoutes, initRouter, resetRouter, getRouteExecutable} from './router';
import {getRoutePath} from '@mionkit/core/src/core';
import {GET_REMOTE_METHODS_BY_ID, GET_REMOTE_METHODS_BY_PATH} from '@mionkit/core/src/constants';
import {hook, rawHook, route} from './handlers';
import {Routes} from './types/general';
import {HandlerType} from './types/remoteMethods';
import {MethodsData, clientRoutes} from './client.routes';
import {headersFromRecord} from './headers';
import {dispatchRoute} from './dispatch';
import {runType} from '@mionkit/run-types/src/lib/runType';
import {PublicMethod} from '@mionkit/router/src/types/publicMethods'; // do not import type only
import {JitFunctions} from '@mionkit/run-types/src/constants';
import {getSerializableMethod} from '@mionkit/router/src/remoteMethods';
import {RpcError} from '@mionkit/core/src/errors';
import {jitUtils} from '@mionkit/core/src/jitUtils';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('PublicMethods run type functionality', () => {
    const route1 = route((ctx): string => 'something');
    const routes = {route1} satisfies Routes;

    type ClientReturn = MethodsData | RpcError;

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
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(publicMethod)));
        // handler method does not match it's type, so we need to replace it when comparing deserialized values
        roundTrip.handler = () => 'something';
        expect(roundTrip).toEqual({
            ...publicMethod,
            handler: expect.any(Function),
        });
    });

    it('can mot mock PublicMethod because it contains functions', async () => {
        const rt = runType<PublicMethod>();
        await expect(() => rt.mock()).rejects.toThrow();
    });

    it('can validate return type ClientReturn', () => {
        const rt = runType<ClientReturn>();
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(new RpcError({statusCode: 400, publicMessage: 'error', message: 'error'}))).toBe(true);
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
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const removeUnknownKeys = rt.createJitFunction(JitFunctions.stripUnknownKeys);

        console.log('response', response);
        const sanitized = removeUnknownKeys(response);
        console.log('sanitized', sanitized);

        expect(typeErrors(response)).toEqual([]);
        expect(typeErrors(new RpcError({statusCode: 400, publicMessage: 'error', message: 'error'}))).toEqual([]);
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
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const error = new RpcError({statusCode: 400, publicMessage: 'error', message: 'error'});
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(error)));
        expect(roundTrip instanceof RpcError).toBeTruthy();
        expect(roundTrip).toEqual(error);

        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(response)));
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
        'users-getUser': {
            type: HandlerType.route,
            id: 'users-getUser',
            handler: 'users.getUser',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            validateParams: true,
            deserializeParams: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        'users-setUser': {
            type: HandlerType.route,
            id: 'users-setUser',
            handler: 'users.setUser',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            validateParams: true,
            deserializeParams: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        'users-pets-getUserPet': {
            type: HandlerType.route,
            id: 'users-pets-getUserPet',
            handler: 'users.pets.getUserPet',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            validateParams: true,
            deserializeParams: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        'pets-getPet': {
            type: HandlerType.route,
            id: 'pets-getPet',
            handler: 'pets.getPet',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            validateParams: true,
            deserializeParams: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        'pets-setPet': {
            type: HandlerType.route,
            id: 'pets-setPet',
            handler: 'pets.setPet',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            validateParams: true,
            deserializeParams: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        auth: {
            type: HandlerType.hook,
            id: 'auth',
            handler: 'auth',
            serializedTypes: [{kind: 17, parameters: [{kind: 18, name: 'token', type: 1}], return: 2}, {kind: 5}, {kind: 3}],
            validateParams: true,
            deserializeParams: true,
            params: ['token'],
        },
        last: {
            type: HandlerType.hook,
            id: 'last',
            handler: 'last',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 10}],
            validateParams: true,
            deserializeParams: true,
            params: [],
        },
    };

    const methodsId = GET_REMOTE_METHODS_BY_ID;
    const routeMethodsId = GET_REMOTE_METHODS_BY_PATH;
    const methodsPath = getRoutePath([methodsId], {prefix: '', suffix: ''});
    const routeMethodsPath = getRoutePath([routeMethodsId], {prefix: '', suffix: ''});

    afterEach(() => resetRouter());

    it('get Remote Hooks Only info from id', async () => {
        initRouter({sharedDataFactory: getSharedData});
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
        console.log(response.body);
        const expectedResponse = {
            auth: methodsMetadata.auth,
            last: methodsMetadata['last'],
        };
        expect(response.body[methodsId]).toEqual(expectedResponse);
    });

    it('get Remote Route info from id, it should also return the hooks from the execution path', async () => {
        initRouter({sharedDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const methodIdList = ['users-getUser']; // all public methods
        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // hook is required (request should be authenticated)
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedResponse = {
            auth: methodsMetadata.auth,
            'users-getUser': methodsMetadata['users-getUser'],
            last: methodsMetadata['last'],
        };
        expect(response.body[methodsId]).toEqual(expectedResponse);
    });

    it('get All Remote Methods info when getAllRemoteMethods is true', async () => {
        initRouter({sharedDataFactory: getSharedData});
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
        const expectedResponse = methodsMetadata;
        expect(response.body[methodsId]).toEqual(expectedResponse);
    });

    it('get Remote Methods info from route path', async () => {
        initRouter({sharedDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const request: RawRequest = {
            headers: headersFromRecord({}),
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [routeMethodsId]: ['/users-getUser'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request.body, request.headers, headersFromRecord({}), request, {});
        const expectedResponse = {
            auth: methodsMetadata.auth,
            'users-getUser': methodsMetadata['users-getUser'],
            last: methodsMetadata.last,
        };
        expect(response.body[routeMethodsId]).toEqual(expectedResponse);
    });

    it('fail when remote method is private or not defined', async () => {
        initRouter({sharedDataFactory: getSharedData});
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
        const expectedResponse = {
            statusCode: 404,
            name: 'Invalid Metadata Request',
            message: 'Errors getting Remote Methods Metadata',
            errorData: {
                parse: 'Remote Method parse not found',
                helloWorld: 'Remote Method helloWorld not found',
            },
        };
        expect(response.body[methodsId]).toEqual(expectedResponse);
    });

    it('fail when route path is not defined', async () => {
        initRouter({sharedDataFactory: getSharedData});
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
        const expectedResponse = {
            statusCode: 404,
            name: 'Invalid Metadata Request',
            message: 'Route /abcd not found',
        };
        expect(response.body[routeMethodsId]).toEqual(expectedResponse);
    });
});
