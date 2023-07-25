import {RouteError, StatusCodes} from '@mionkit/core';
import {registerRoutes, initRouter, Route} from '@mionkit/router';
import type {CallContext, HeaderHookDef, HookDef, RawHookDef, Routes} from '@mionkit/router';
import type {APIGatewayEvent} from 'aws-lambda';

interface User {
    id: number;
    name: string;
    surname: string;
}

type NewUser = Omit<User, 'id'>;

const myDBService = {
    usersStore: new Map<number, User>(),
    createUser: (user: NewUser): User => {
        const id = myDBService.usersStore.size + 1;
        const newUser: User = {id, ...user};
        myDBService.usersStore.set(id, newUser);
        return newUser;
    },
    getUser: (id: number): User | undefined => myDBService.usersStore.get(id),
    updateUser: (user: User): User | null => {
        if (!myDBService.usersStore.has(user.id)) return null;
        myDBService.usersStore.set(user.id, user);
        return user;
    },
    deleteUser: (id: number): User | null => {
        const user = myDBService.usersStore.get(id);
        if (!user) return null;
        myDBService.usersStore.delete(id);
        return user;
    },
};

// user is authorized if token === 'ABCD'
const myAuthService = {
    isAuthorized: (token: string): boolean => token === 'ABCD',
    getIdentity: (token: string): User | null => (token === 'ABCD' ? ({id: 0, name: 'admin', surname: 'admin'} as User) : null),
};

const myApp = {
    db: myDBService,
    auth: myAuthService,
};
const shared = {
    me: null as any as User,
};
const getSharedData = (): typeof shared => shared;

type SharedData = ReturnType<typeof getSharedData>;
type Context = CallContext<SharedData>;

const getUser: Route = (ctx: Context, id) => {
    const user = myApp.db.getUser(id);
    if (!user) throw {statusCode: 200, message: 'user not found'};
    return user;
};
const createUser = (ctx: Context, newUser: NewUser): User => myApp.db.createUser(newUser);
const updateUser = (ctx: Context, user: User): User => {
    const updated = myApp.db.updateUser(user);
    if (!updated) throw {statusCode: 200, message: 'user not found, can not be updated'};
    return updated;
};
const deleteUser = (ctx: Context, id: number): User => {
    const deleted = myApp.db.deleteUser(id);
    if (!deleted) throw {statusCode: 200, message: 'user not found, can not be deleted'};
    return deleted;
};

const auth = {
    fieldName: 'Authorization',
    canReturnData: false,
    headerHook: (ctx: Context, token: string): void => {
        if (!myApp.auth.isAuthorized(token)) throw {statusCode: StatusCodes.FORBIDDEN, message: 'Not Authorized'} as RouteError;
        ctx.shared.me = myApp.auth.getIdentity(token) as User;
    },
} satisfies HeaderHookDef;

const log: RawHookDef = {
    rawHook: (context) => console.log('rawHook', context.path),
};

const routes = {
    private: {hook: (): null => null},
    auth,
    users: {
        get: getUser, // api/v1/users/get
        create: createUser, // api/v1/users/create
        update: updateUser, // api/v1/users/update
        delete: deleteUser, // api/v1/users/delete
    },
    log,
} satisfies Routes;

initRouter({sharedDataFactory: getSharedData, prefix: 'api/v1'});
export const apiSpec = registerRoutes(routes);
type ApiSpec = typeof apiSpec;
type Auth = ApiSpec['auth'];
type AuthRet = ReturnType<Auth['_handler']>;
