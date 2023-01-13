import {Router, Context, Route, Routes, Hook, MkError, StatusCodes} from '@mikrokit/router';
import {APIGatewayEvent} from 'aws-lambda';

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

const app = {
    db: myDBService,
    auth: myAuthService,
};
const shared = {
    me: null as any as User,
};
const getSharedData = (): typeof shared => shared;

type App = typeof app;
type SharedData = ReturnType<typeof getSharedData>;
type CallContext = Context<App, SharedData, APIGatewayEvent>;

const getUser: Route = (ctx: CallContext, id: number): User => {
    const user = ctx.app.db.getUser(id);
    if (!user) throw {statusCode: 200, message: 'user not found'};
    return user;
};
const createUser: Route = (ctx: CallContext, newUser: NewUser): User => ctx.app.db.createUser(newUser);
const updateUser: Route = (ctx: CallContext, user: User): User => {
    const updated = ctx.app.db.updateUser(user);
    if (!updated) throw {statusCode: 200, message: 'user not found, can not be updated'};
    return updated;
};
const deleteUser: Route = (ctx: CallContext, id: number): User => {
    const deleted = ctx.app.db.deleteUser(id);
    if (!deleted) throw {statusCode: 200, message: 'user not found, can not be deleted'};
    return deleted;
};
const auth: Hook = {
    inHeader: true,
    fieldName: 'Authorization',
    hook: (ctx: CallContext, token: string): void => {
        const {auth} = ctx.app;
        if (!auth.isAuthorized(token)) throw {statusCode: StatusCodes.FORBIDDEN, message: 'Not Authorized'} as MkError;
        ctx.shared.me = auth.getIdentity(token) as User;
    },
};

const routes: Routes = {
    auth,
    users: {
        get: getUser, // api/v1/users/get
        create: createUser, // api/v1/users/create
        update: updateUser, // api/v1/users/update
        delete: deleteUser, // api/v1/users/delete
    },
};

Router.initRouter(app, getSharedData, {prefix: 'api/v1'});
Router.addRoutes(routes);
