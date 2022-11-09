/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MkClient, RemoteHandler, RemoteParams, RemotePrefill, RemoteReturn} from '@mikrokit/client';

// ##### Generated Client Input #####

type User = {id: number; name: string; surname: string};
type Pet = {id: number; race: string; name: string};

export const myAppRoutes = {
    auth: {
        hook: (ctx, token: string): void => {},
    },
    users: {
        getUser: async (ctx, id: number): Promise<User> => ({id, name: 'John', surname: 'Smith'}),
        setUser: {
            route: async (ctx, user: User): Promise<User> => user,
        },
        totalUsers: {
            canReturnData: true,
            hook(): number {
                return 3;
            },
        },
    },
    pets: {
        getPet: async (ctx, id: number): Promise<Pet> => ({id, race: 'Dog', name: 'Lassie'}),
        setPet: async (ctx, pet: Pet): Promise<Pet> => pet,
    },
    getNumber: {
        path: 'utils/getNumber',
        route: async (c, s: string, n: number): Promise<number> => n,
    },
    last: {hook(): void {}},
};

export type MyAppRoutes = typeof myAppRoutes;

// ##### Generated Client Output #####

type UsersGetUserRemoteHandler = RemoteHandler<MyAppRoutes['users']['getUser'], UsersGetUserRequest, UsersGetUserResponse>;
type UsersGetUserRemotePrefill = RemotePrefill<MyAppRoutes['users']['getUser']>;
export type UsersGetUserRequest = {
    auth: RemoteParams<MyAppRoutes['auth']['hook']>;
    '/api/v1/users/getUser.json': RemoteParams<MyAppRoutes['users']['getUser']>;
};
export type UsersGetUserResponse = {
    '/api/v1/users/getUser.json': RemoteReturn<MyAppRoutes['users']['getUser']>;
    totalUsers: RemoteReturn<MyAppRoutes['users']['totalUsers']['hook']>;
};
const usersGetUserHandler: UsersGetUserRemoteHandler = (...args) => MkClient.remote('/user/getUser', ...args);
const usersGetUserPrefill: UsersGetUserRemotePrefill = (...args) => MkClient.prefillData('/user/getUse', ...args);

export const clientRoutes = {
    users: {
        getUser: usersGetUserHandler,
    },
    // other routes and hooks
};
