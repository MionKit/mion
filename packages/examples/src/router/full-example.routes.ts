import {RpcError, HeadersSubset} from '@mionjs/core';
import {Routes} from '@mionjs/router';
import {mion, NewUser, myApp} from './full-example.app.ts';
import {User} from './full-example.app.ts';

// ctx.shared is typed from the contextDataFactory given to createMionRouter
const getUser = mion.route(
  (ctx, id: number): User | RpcError<'user-not-found'> => {
    const user = myApp.store.getUser(id);
    if (!user)
      return new RpcError({
        publicMessage: 'User not found',
        type: 'user-not-found',
      });
    return user;
  }
);

const createUser = mion.route(
  (ctx, newUser: NewUser): User => myApp.store.createUser(newUser)
);

const updateUser = mion.route(
  (ctx, user: User): User | RpcError<'user-not-found'> => {
    const updated = myApp.store.updateUser(user);
    if (!updated)
      return new RpcError({
        publicMessage: 'User not found, can not be updated',
        type: 'user-not-found',
      });
    return updated;
  }
);

const deleteUser = mion.route(
  (ctx, id: number): User | RpcError<'user-not-found'> => {
    const deleted = myApp.store.deleteUser(id);
    if (!deleted)
      return new RpcError({
        publicMessage: 'User not found, can not be deleted',
        type: 'user-not-found',
      });
    return deleted;
  }
);

const auth = mion.headersFn(
  (ctx, {headers}: HeadersSubset<'Authorization'>): void => {
    const token = headers.Authorization;
    if (!myApp.auth.isAuthorized(token))
      throw new RpcError({
        publicMessage: 'Not Authorized',
        type: 'not-authorized',
      });
    ctx.shared.me = myApp.auth.getIdentity(token) as User;
  }
);

const log = mion.rawMiddleFn((ctx): void =>
  console.log('rawMiddleFn', ctx.path)
);

const routes = {
  private: mion.middleFn((): null => null),
  auth,
  users: {
    get: getUser, // api/v1/users/get
    create: createUser, // api/v1/users/create
    update: updateUser, // api/v1/users/update
    delete: deleteUser, // api/v1/users/delete
  },
  log,
} satisfies Routes;

export const apiSpec = await mion.initRoutes(routes);
export type ApiSpec = typeof apiSpec;
