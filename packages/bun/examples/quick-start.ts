import {registerRoutes} from '@mionkit/router';
import {initBunHttpRouter, startBunHttpServer} from '../src/bunHttp';
import type {CallContext, Route} from '@mionkit/router';
// import {AnonymRpcError} from '@mionkit/core';

type SimpleUser = {name: string; surname: string};
type DataPoint = {date: Date};
type MySharedData = ReturnType<typeof getSharedData>;
type Context = CallContext<MySharedData>;

const myApp = {
    cloudLogs: {
        log: () => null,
        error: () => null,
    },
    db: {
        changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
    },
};
const getSharedData = () => ({auth: {me: null as any}});

const changeUserName: Route = (context: Context, user: SimpleUser) => {
    return myApp.db.changeUserName(user);
};

const getDate: Route = (context: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
};

const updateHeaders: Route = (context: Context): void => {
    context.response.headers.set('x-something', 'true');
    context.response.headers.set('server', 'my-server');
};
const port = 8079;
initBunHttpRouter({sharedDataFactory: getSharedData, prefix: 'api/', port});
registerRoutes({changeUserName, getDate, updateHeaders});
const server = startBunHttpServer();
console.log('server', server);
