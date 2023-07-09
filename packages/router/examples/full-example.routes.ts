import {registerRoutes, initRouter, StatusCodes, Route} from '@mionkit/router';
import type {Context, RouteError} from '@mionkit/router';
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

type App = typeof myApp;
type SharedData = ReturnType<typeof getSharedData>;
type ServerlessContext = {rawRequest: APIGatewayEvent; rawResponse?: null};
type CallContext = Context<SharedData, ServerlessContext>;

const getUser: Route = (app: App, ctx: CallContext, id) => {
    const user = app.db.getUser(id);
    if (!user) throw {statusCode: 200, message: 'user not found'};
    return user;
};
const createUser = (app: App, ctx: CallContext, newUser: NewUser): User => app.db.createUser(newUser);
const updateUser = (app: App, ctx: CallContext, user: User): User => {
    const updated = app.db.updateUser(user);
    if (!updated) throw {statusCode: 200, message: 'user not found, can not be updated'};
    return updated;
};
const deleteUser = (app: App, ctx: CallContext, id: number): User => {
    const deleted = app.db.deleteUser(id);
    if (!deleted) throw {statusCode: 200, message: 'user not found, can not be deleted'};
    return deleted;
};
const auth = {
    inHeader: true,
    fieldName: 'Authorization',
    canReturnData: false,
    hook: (app: App, ctx: CallContext, token: string): void => {
        if (!app.auth.isAuthorized(token)) throw {statusCode: StatusCodes.FORBIDDEN, message: 'Not Authorized'} as RouteError;
        ctx.shared.me = app.auth.getIdentity(token) as User;
    },
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
};

initRouter(myApp, getSharedData, {prefix: 'api/v1'});
export const apiSpec = registerRoutes(routes);
