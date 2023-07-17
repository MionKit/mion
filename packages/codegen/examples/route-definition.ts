/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MkSpec, RemoteHandler, RemoteParams, RemotePrefill, RemoteReturn} from '@mionkit/client';
import {Routes} from '@mionkit/router';

// ##### Generated Spec Input #####

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
} satisfies Routes;

export type MyAppRoutes = typeof myAppRoutes;

// ##### Generated Spec Output #####

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
const usersGetUserHandler: UsersGetUserRemoteHandler = (...args) => MkSpec.remote('/user/getUser', ...args);
const usersGetUserPrefill: UsersGetUserRemotePrefill = (...args) => MkSpec.prefillData('/user/getUse', ...args);

export const specRoutes = {
    users: {
        getUser: usersGetUserHandler,
    },
    // other routes and hooks
};
