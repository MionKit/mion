/* ######## EXPECTED GENERATED API from ./myApi.routes.ts ######## */

import {ProcedureType} from '@mionkit/router';

export const PUBLIC_METHODS = {
    myApi: {
        auth: {
            type: ProcedureType.headerHook,
            id: 'auth',
            handler: expect.any(Function),
            serializedTypes: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['token'],
            headerName: 'authorization',
        },
        users: {
            getUser: {
                type: ProcedureType.route,
                id: 'users-getUser',
                handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['id'],
                pathPointers: [['auth'], ['users', 'getUser'], ['users', 'totalUsers']],
                hookIds: ['auth', 'users-totalUsers'],
            },
            setUser: {
                type: ProcedureType.route,
                id: 'users-setUser',
                handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['user', 'user2'],
                pathPointers: [['auth'], ['users', 'setUser'], ['users', 'totalUsers']],
                hookIds: ['auth', 'users-totalUsers'],
            },
            totalUsers: {
                type: ProcedureType.hook,
                id: 'users-totalUsers',
                handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: [],
            },
        },
        pets: {
            getPet: {
                type: ProcedureType.route,
                id: 'pets-getPet',
                handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['id'],
                pathPointers: [['auth'], ['pets', 'getPet']],
                hookIds: ['auth'],
            },
            setPet: {
                type: ProcedureType.route,
                id: 'pets-setPet',
                handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['pet'],
                pathPointers: [['auth'], ['pets', 'setPet']],
                hookIds: ['auth'],
            },
        },
        utils: {
            getNumber: {
                type: ProcedureType.route,
                id: 'utils-getNumber',
                handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['s', 'n'],
                pathPointers: [['auth'], ['utils', 'getNumber']],
                hookIds: ['auth'],
            },
        },
        getItem: {
            type: ProcedureType.route,
            id: 'getItem',
            handler: expect.any(Function),
            serializedTypes: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['item'],
            pathPointers: [['auth'], ['getItem']],
            hookIds: ['auth'],
        },
        getPetOrUser: {
            type: ProcedureType.route,
            id: 'getPetOrUser',
            handler: expect.any(Function),
            serializedTypes: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['item'],
            pathPointers: [['auth'], ['getPetOrUser']],
            hookIds: ['auth'],
        },
    },
    authApi: {
        login: {
            type: ProcedureType.route,
            id: 'login',
            handler: expect.any(Function),
            serializedTypes: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['email', 'pass'],
            pathPointers: [['login']],
            hookIds: [],
        },
    },
};

export const ROUTES = {
    myApi: {
        users: {
            getUser: [PUBLIC_METHODS.myApi.auth, PUBLIC_METHODS.myApi.users.getUser, PUBLIC_METHODS.myApi.users.totalUsers],
            setUser: [PUBLIC_METHODS.myApi.auth, PUBLIC_METHODS.myApi.users.setUser, PUBLIC_METHODS.myApi.users.totalUsers],
        },
        pets: {
            getPet: [PUBLIC_METHODS.myApi.auth, PUBLIC_METHODS.myApi.pets.getPet],
            setPet: [PUBLIC_METHODS.myApi.auth, PUBLIC_METHODS.myApi.pets.setPet],
        },
        utils: {
            getNumber: [PUBLIC_METHODS.myApi.auth, PUBLIC_METHODS.myApi.utils.getNumber],
        },
        getItem: [PUBLIC_METHODS.myApi.auth, PUBLIC_METHODS.myApi.getItem],
        getPetOrUser: [PUBLIC_METHODS.myApi.auth, PUBLIC_METHODS.myApi.getPetOrUser],
    },
    authApi: {
        login: [PUBLIC_METHODS.authApi.login],
    },
};
