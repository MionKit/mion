/* ######## EXPECTED GENERATED API from ./myApi.routes.ts ######## */

export const PUBLIC_METHODS = {
    myApi: {
        auth: {
            isRoute: false,
            id: 'Authorization',
            inHeader: true,
            _handler: expect.any(Function),
            handlerSerializedType: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['token'],
        },
        users: {
            getUser: {
                isRoute: true,
                id: 'users-getUser',
                inHeader: false,
                _handler: expect.any(Function),
                handlerSerializedType: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['id'],
            },
            setUser: {
                isRoute: true,
                id: 'users-setUser',
                inHeader: false,
                _handler: expect.any(Function),
                handlerSerializedType: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['user', 'user2'],
            },
            totalUsers: {
                isRoute: false,
                id: 'users-totalUsers',
                inHeader: false,
                _handler: expect.any(Function),
                handlerSerializedType: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: [],
            },
        },
        pets: {
            getPet: {
                isRoute: true,
                id: 'pets-getPet',
                inHeader: false,
                _handler: expect.any(Function),
                handlerSerializedType: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['id'],
            },
            setPet: {
                isRoute: true,
                id: 'pets-setPet',
                inHeader: false,
                _handler: expect.any(Function),
                handlerSerializedType: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['pet'],
            },
        },
        utils: {
            getNumber: {
                isRoute: true,
                id: 'utils-getNumber',
                inHeader: false,
                _handler: expect.any(Function),
                handlerSerializedType: expect.any(Object),
                enableValidation: true,
                enableSerialization: true,
                params: ['s', 'n'],
            },
        },
        getItem: {
            isRoute: true,
            id: 'getItem',
            inHeader: false,
            _handler: expect.any(Function),
            handlerSerializedType: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['item'],
        },
        getPetOrUser: {
            isRoute: true,
            id: 'getPetOrUser',
            inHeader: false,
            _handler: expect.any(Function),
            handlerSerializedType: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['item'],
        },
    },
    authApi: {
        login: {
            isRoute: true,
            id: 'login',
            inHeader: false,
            _handler: expect.any(Function),
            handlerSerializedType: expect.any(Object),
            enableValidation: true,
            enableSerialization: true,
            params: ['email', 'pass'],
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
