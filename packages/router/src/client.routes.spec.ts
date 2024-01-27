/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders} from './types/context';
import {registerRoutes, initRouter, resetRouter} from './router';
import {GET_REMOTE_METHODS_BY_ID, GET_REMOTE_METHODS_BY_PATH, getRoutePath} from '@mionkit/core';
import {hook, rawHook, route} from './initFunctions';
import {Routes} from './types/general';
import {ProcedureType} from './types/procedures';
import {clientRoutes} from './client.routes';
import {headersFromRecord} from './headers';
import {dispatchRoute} from './dispatch';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('Client Routes should', () => {
    const privateHook = hook((ctx): void => undefined);
    const publicHook = hook((ctx): null => null);
    const auth = hook((ctx, token: string): void => undefined);
    const route1 = route(() => 'route1');
    const route2 = route(() => 'route2');

    const routes = {
        auth: auth, // is public as has params
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

    const methodsMetadata = {
        'users-getUser': {
            type: ProcedureType.route,
            id: 'users-getUser',
            handler: 'users.getUser',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        'users-setUser': {
            type: ProcedureType.route,
            id: 'users-setUser',
            handler: 'users.setUser',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        'users-pets-getUserPet': {
            type: ProcedureType.route,
            id: 'users-pets-getUserPet',
            handler: 'users.pets.getUserPet',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        'pets-getPet': {
            type: ProcedureType.route,
            id: 'pets-getPet',
            handler: 'pets.getPet',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        'pets-setPet': {
            type: ProcedureType.route,
            id: 'pets-setPet',
            handler: 'pets.setPet',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            hookIds: ['auth', 'last'],
        },
        auth: {
            type: ProcedureType.hook,
            id: 'auth',
            handler: 'auth',
            serializedTypes: [{kind: 17, parameters: [{kind: 18, name: 'token', type: 1}], return: 2}, {kind: 5}, {kind: 3}],
            enableValidation: true,
            enableSerialization: true,
            params: ['token'],
        },
        last: {
            type: ProcedureType.hook,
            id: 'last',
            handler: 'last',
            serializedTypes: [{kind: 17, parameters: [], return: 1}, {kind: 10}],
            enableValidation: true,
            enableSerialization: true,
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
