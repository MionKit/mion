/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, initRouter, resetRouter, Routes, dispatchRoute, RawRequest} from '@mionkit/router';
import {clientRoutes} from './client.routes';
import {PublicError} from '@mionkit/core';

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
        auth: {
            isRoute: false,
            id: 'auth',
            inHeader: false,
            enableValidation: true,
            enableSerialization: true,
            params: ['token'],
            executionPathPointers: null,
            headerName: null,
        },
        'users-getUser': {
            isRoute: true,
            id: 'users-getUser',
            inHeader: false,
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: [['auth'], ['users', 'getUser'], ['last']],
            headerName: null,
        },
        'users-setUser': {
            isRoute: true,
            id: 'users-setUser',
            inHeader: false,
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: [['auth'], ['users', 'setUser'], ['last']],
            headerName: null,
        },
        'users-pets-getUserPet': {
            isRoute: true,
            id: 'users-pets-getUserPet',
            inHeader: false,
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: [['auth'], ['users', 'pets', 'getUserPet'], ['last']],
            headerName: null,
        },
        last: {
            isRoute: false,
            id: 'last',
            inHeader: false,
            enableValidation: true,
            enableSerialization: true,
            params: [],
            executionPathPointers: null,
            headerName: null,
        },
    };

    const methodsPath = '/mionRemoteMethods';
    const methodsId = 'mionRemoteMethods';
    const routeMethodsPath = '/mionGetRouteRemoteMethods';
    const routeMethodsId = 'mionGetRouteRemoteMethods';

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
