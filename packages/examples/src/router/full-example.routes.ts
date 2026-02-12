import {RpcError, HeadersSubset} from '@mionkit/core';
import {headersFn, rawLinkedFn, linkedFn, Routes, initMionRouter, route} from '@mionkit/router';
import {Context, NewUser, getSharedData, myApp} from './full-example.app.ts';
import {User} from './full-example.app.ts';

const getUser = route((ctx: Context, id: number): User | RpcError<'user-not-found'> => {
    const user = myApp.store.getUser(id);
    if (!user) return new RpcError({publicMessage: 'User not found', type: 'user-not-found'});
    return user;
});

const createUser = route((ctx: Context, newUser: NewUser): User => myApp.store.createUser(newUser));

const updateUser = route((ctx: Context, user: User): User | RpcError<'user-not-found'> => {
    const updated = myApp.store.updateUser(user);
    if (!updated) return new RpcError({publicMessage: 'User not found, can not be updated', type: 'user-not-found'});
    return updated;
});

const deleteUser = route((ctx: Context, id: number): User | RpcError<'user-not-found'> => {
    const deleted = myApp.store.deleteUser(id);
    if (!deleted) return new RpcError({publicMessage: 'User not found, can not be deleted', type: 'user-not-found'});
    return deleted;
});

const auth = headersFn((ctx: Context, {headers}: HeadersSubset<'Authorization'>): void => {
    const token = headers.Authorization;
    if (!myApp.auth.isAuthorized(token))
        throw new RpcError({
            publicMessage: 'Not Authorized',
            type: 'not-authorized',
        });
    ctx.shared.me = myApp.auth.getIdentity(token) as User;
});

const log = rawLinkedFn((context: Context): void => console.log('rawLinkedFn', context.path));

const routes = {
    private: linkedFn((): null => null),
    auth,
    users: {
        get: getUser, // api/v1/users/get
        create: createUser, // api/v1/users/create
        update: updateUser, // api/v1/users/update
        delete: deleteUser, // api/v1/users/delete
    },
    log,
} satisfies Routes;

export const apiSpec = await initMionRouter(routes, {
    contextDataFactory: getSharedData,
    prefix: 'api/v1',
});
export type ApiSpec = typeof apiSpec;
