/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, initRouter, resetRouter, Routes, dispatchRoute, RawRequest} from '@mionkit/router';
import {clientRoutes} from './client.routes';
import {GET_REMOTE_METHODS_BY_ID, GET_REMOTE_METHODS_BY_PATH, PublicError, getRoutePath} from '@mionkit/core';

describe('Client Routes should', () => {
    const privateHook = (ctx): void => undefined;
    const auth = (ctx, token: string): void => undefined;
    const route1 = () => 'route1';
    const route2 = {
        route() {
            return 'route2';
        },
    };

    const routes = {
        auth: {hook: auth}, // is public as has params
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

    const remoteMethods = {
        'users-getUser': {
            isRoute: true,
            id: 'users-getUser',
            inHeader: false,
            _handler: 'users.getUser',
            handlerSerializedType: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: [['auth'], ['users', 'getUser'], ['last']],
        },
        'users-setUser': {
            isRoute: true,
            id: 'users-setUser',
            inHeader: false,
            _handler: 'users.setUser',
            handlerSerializedType: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: [['auth'], ['users', 'setUser'], ['last']],
        },
        'users-pets-getUserPet': {
            isRoute: true,
            id: 'users-pets-getUserPet',
            inHeader: false,
            _handler: 'users.pets.getUserPet',
            handlerSerializedType: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: [['auth'], ['users', 'pets', 'getUserPet'], ['last']],
        },
        'pets-getPet': {
            isRoute: true,
            id: 'pets-getPet',
            inHeader: false,
            _handler: 'pets.getPet',
            handlerSerializedType: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: [['auth'], ['pets', 'getPet'], ['last']],
        },
        'pets-setPet': {
            isRoute: true,
            id: 'pets-setPet',
            inHeader: false,
            _handler: 'pets.setPet',
            handlerSerializedType: [{kind: 17, parameters: [], return: 1}, {kind: 1}],
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: [['auth'], ['pets', 'setPet'], ['last']],
        },
        auth: {
            isRoute: false,
            id: 'auth',
            inHeader: false,
            _handler: 'auth',
            handlerSerializedType: [
                {kind: 17, parameters: [{kind: 18, name: 'token', type: 1}], return: 2},
                {kind: 5},
                {kind: 3},
            ],
            enableValidation: true,
            enableSerialization: true,
            params: ['token'],
        },
        last: {
            isRoute: false,
            id: 'last',
            inHeader: false,
            _handler: 'last',
            handlerSerializedType: [{kind: 17, parameters: [], return: 1}, {kind: 3}],
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

    it('get Remote Methods info from id', async () => {
        initRouter({sharedDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const methodIdList = ['auth', 'users-getUser', 'users-setUser', 'users-pets-getUserPet', 'last']; // all public methods
        const request: RawRequest = {
            headers: {},
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request, {});
        const expectedResponse = {
            auth: remoteMethods.auth,
            'users-getUser': remoteMethods['users-getUser'],
            'users-setUser': remoteMethods['users-setUser'],
            'users-pets-getUserPet': remoteMethods['users-pets-getUserPet'],
            last: remoteMethods['last'],
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
            headers: {},
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [methodsId]: [methodIdList, getAllRemoteMethods],
            }),
        };
        const response = await dispatchRoute(methodsPath, request, {});
        const expectedResponse = remoteMethods;
        expect(response.body[methodsId]).toEqual(expectedResponse);
    });

    it('get Remote Methods info from route path', async () => {
        initRouter({sharedDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const request: RawRequest = {
            headers: {},
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [routeMethodsId]: ['/users-getUser'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request, {});
        const expectedResponse = {
            auth: remoteMethods.auth,
            'users-getUser': remoteMethods['users-getUser'],
            last: remoteMethods.last,
        };
        expect(response.body[routeMethodsId]).toEqual(expectedResponse);
    });

    it('fail when remote method is private or not defined', async () => {
        initRouter({sharedDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const methodIdList = ['parse', 'helloWorld', 'users-userBefore']; // all public methods
        const request: RawRequest = {
            headers: {},
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [methodsId]: [methodIdList],
            }),
        };
        const response = await dispatchRoute(methodsPath, request, {});
        const expectedResponse = new PublicError({
            message: 'RemoteMethods not found',
            statusCode: 404,
            name: 'Invalid RemoteMethods Request',
            errorData: {
                parse: 'Remote Method parse not found',
                helloWorld: 'Remote Method helloWorld not found',
                'users-userBefore': 'Remote Method users-userBefore not found',
            },
        });
        expect(response.body[methodsId]).toEqual(expectedResponse);
    });

    it('fail when route path is not defined', async () => {
        initRouter({sharedDataFactory: getSharedData});
        registerRoutes(routes);
        registerRoutes(clientRoutes);

        const request: RawRequest = {
            headers: {},
            body: JSON.stringify({
                auth: ['token'], // hook is required
                [routeMethodsId]: ['/abcd'],
            }),
        };
        const response = await dispatchRoute(routeMethodsPath, request, {});
        const expectedResponse = new PublicError({
            message: 'Route /abcd not found',
            statusCode: 404,
            name: 'Invalid RemoteMethods Request',
        });
        expect(response.body[routeMethodsId]).toEqual(expectedResponse);
    });
});
