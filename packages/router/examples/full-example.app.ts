import {RouteError, StatusCodes} from '@mionkit/core';
import {registerRoutes, initRouter, Route} from '@mionkit/router';
import type {CallContext, HeaderHookDef, HookDef, RawHookDef, Routes} from '@mionkit/router';
import type {APIGatewayEvent} from 'aws-lambda';

export interface User {
    id: number;
    name: string;
    surname: string;
}

export type NewUser = Omit<User, 'id'>;

export const memoryStoreService = {
    usersStore: new Map<number, User>(),
    createUser: (user: NewUser): User => {
        const id = memoryStoreService.usersStore.size + 1;
        const newUser: User = {id, ...user};
        memoryStoreService.usersStore.set(id, newUser);
        return newUser;
    },
    getUser: (id: number): User | undefined => memoryStoreService.usersStore.get(id),
    updateUser: (user: User): User | null => {
        if (!memoryStoreService.usersStore.has(user.id)) return null;
        memoryStoreService.usersStore.set(user.id, user);
        return user;
    },
    deleteUser: (id: number): User | null => {
        const user = memoryStoreService.usersStore.get(id);
        if (!user) return null;
        memoryStoreService.usersStore.delete(id);
        return user;
    },
};

// user is authorized if token === 'ABCD'
export const myAuthService = {
    isAuthorized: (token: string): boolean => token === 'ABCD',
    getIdentity: (token: string): User | null => (token === 'ABCD' ? ({id: 0, name: 'admin', surname: 'admin'} as User) : null),
};
export const myApp = {
    store: memoryStoreService,
    auth: myAuthService,
};
export const shared = {
    me: null as any as User,
};
export const getSharedData = (): typeof shared => shared;

export type SharedData = ReturnType<typeof getSharedData>;
export type Context = CallContext<SharedData>;
