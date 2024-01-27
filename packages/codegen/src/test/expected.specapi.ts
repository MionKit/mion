/* ######## EXPECTED GENERATED API from ./myApi.routes.ts ######## */

import {ExecutableType} from '@mionkit/router';

export const PUBLIC_METHODS = {
    myApi: {
        auth: {
            type: ExecutableType.headerHook,
            id: 'auth',
            _handler: expect.any(Function),
            serializedTypes: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['token'],
            headerName: 'authorization',
        },
        users: {
            getUser: {
                type: ExecutableType.route,
                id: 'users-getUser',
                _handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['id'],
                pathPointers: [['auth'], ['users', 'getUser'], ['users', 'totalUsers']],
                hookIds: ['auth', 'users-totalUsers'],
            },
            setUser: {
                type: ExecutableType.route,
                id: 'users-setUser',
                _handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['user', 'user2'],
                pathPointers: [['auth'], ['users', 'setUser'], ['users', 'totalUsers']],
                hookIds: ['auth', 'users-totalUsers'],
            },
            totalUsers: {
                type: ExecutableType.hook,
                id: 'users-totalUsers',
                _handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: [],
            },
        },
        pets: {
            getPet: {
                type: ExecutableType.route,
                id: 'pets-getPet',
                _handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['id'],
                pathPointers: [['auth'], ['pets', 'getPet']],
                hookIds: ['auth'],
            },
            setPet: {
                type: ExecutableType.route,
                id: 'pets-setPet',
                _handler: expect.any(Function),
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
                type: ExecutableType.route,
                id: 'utils-getNumber',
                _handler: expect.any(Function),
                serializedTypes: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['s', 'n'],
                pathPointers: [['auth'], ['utils', 'getNumber']],
                hookIds: ['auth'],
            },
        },
        getItem: {
            type: ExecutableType.route,
            id: 'getItem',
            _handler: expect.any(Function),
            serializedTypes: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['item'],
            pathPointers: [['auth'], ['getItem']],
            hookIds: ['auth'],
        },
        getPetOrUser: {
            type: ExecutableType.route,
            id: 'getPetOrUser',
            _handler: expect.any(Function),
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
            type: ExecutableType.route,
            id: 'login',
            _handler: expect.any(Function),
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
