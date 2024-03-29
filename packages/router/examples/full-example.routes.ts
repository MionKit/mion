import {RpcError, StatusCodes} from '@mionkit/core';
import {initMionRouter, route} from '@mionkit/router';
import {headersHook, rawHook, hook, Routes} from '@mionkit/router';
import {Context, NewUser, getSharedData, myApp} from './full-example.app';
import {User} from '@mionkit/codegen/src/test/myApi.types';

const getUser = route((ctx: Context, id: number): User => {
    const user = myApp.store.getUser(id);
    if (!user) throw {statusCode: 200, message: 'user not found'};
    return user;
});

const createUser = route((ctx: Context, newUser: NewUser): User => myApp.store.createUser(newUser));

const updateUser = route((ctx: Context, user: User): User => {
    const updated = myApp.store.updateUser(user);
    if (!updated) throw {statusCode: 200, message: 'user not found, can not be updated'};
    return updated;
});

const deleteUser = route((ctx: Context, id: number): User => {
    const deleted = myApp.store.deleteUser(id);
    if (!deleted) throw {statusCode: 200, message: 'user not found, can not be deleted'};
    return deleted;
});

const auth = headersHook('Authorization', (ctx: Context, token: string): void => {
    if (!myApp.auth.isAuthorized(token)) throw {statusCode: StatusCodes.FORBIDDEN, message: 'Not Authorized'} as RpcError;
    ctx.shared.me = myApp.auth.getIdentity(token) as User;
});

const log = rawHook((context): void => console.log('rawHook', context.path));

const routes = {
    private: hook((): null => null),
    auth,
    users: {
        get: getUser, // api/v1/users/get
        create: createUser, // api/v1/users/create
        update: updateUser, // api/v1/users/update
        delete: deleteUser, // api/v1/users/delete
    },
    log,
} satisfies Routes;

export const apiSpec = initMionRouter(routes, {
    sharedDataFactory: getSharedData,
    prefix: 'api/v1',
});
export type ApiSpec = typeof apiSpec;
