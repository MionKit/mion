import {MkRouter, Context, Route, Routes, Hook, MkError, StatusCodes} from '@mikrokit/router';
import {APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';

interface User {
    id: number;
    name: string;
    surname: string;
}

type NewUser = Omit<User, 'id'>;

const myDBService = {
    usersStore: new Map<number, User>(),
    createUser: (user: NewUser) => {
        const id = myDBService.usersStore.size + 1;
        const newUser: User = {id, ...user};
        myDBService.usersStore.set(id, newUser);
        return newUser;
    },
    getUser: (id: number) => myDBService.usersStore.get(id),
    updateUser: (user: User) => {
        if (!myDBService.usersStore.has(user.id)) return null;
        myDBService.usersStore.set(user.id, user);
        return user;
    },
    deleteUser: (id: number) => {
        const user = myDBService.usersStore.get(id);
        if (!user) return null;
        myDBService.usersStore.delete(id);
        return user;
    },
};

// user is authorized if token === 'ABCD'
const myAuthService = {
    isAuthorized: (token: string) => token === 'ABCD',
    getIdentity: (token: string) => (token === 'ABCD' ? ({id: 0, name: 'admin', surname: 'admin'} as User) : null),
};

const app = {
    db: myDBService,
    auth: myAuthService,
};
const getSharedData = () => ({
    me: null as any as User,
});

type App = typeof app;
type SharedData = ReturnType<typeof getSharedData>;
type CallContext = Context<App, SharedData, APIGatewayEvent>;

const getUser: Route = (ctx: CallContext, id: number) => ctx.app.db.getUser(id);
const createUser: Route = (ctx: CallContext, newUser: NewUser) => ctx.app.db.createUser(newUser);
const updateUser: Route = (ctx: CallContext, user: User) => ctx.app.db.updateUser(user);
const deleteUser: Route = (ctx: CallContext, id: number) => ctx.app.db.deleteUser(id);

const auth: Hook = {
    inHeader: true,
    fieldName: 'Authorization',
    hook: (ctx: CallContext, token: string) => {
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

MkRouter.initRouter(app, getSharedData, {prefix: 'api/v1'});
MkRouter.addRoutes(routes);
