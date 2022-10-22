/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {Context, Hook, MkRequest, Route, StatusCodes, MkRouter} from '@mikrokit/router';
import fetch from 'node-fetch'; // must be node-fetch v2 as v3 is a node module non compatible whit current setup
import {initHttpApp} from '@mikrokit/serverless';

type SimpleUser = {
    name: string;
    surname: string;
};
type DataPoint = {
    date: Date;
};
const app = {
    cloudLogs: {
        log: () => null,
        error: () => null,
    },
    db: {
        changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
    },
};
const getSharedData = () => ({auth: {me: null as any}});

const {emptyContext, startHttpServer} = initHttpApp(app, getSharedData);
type CallContext = typeof emptyContext;

const changeUserName: Route = (context: CallContext, user: SimpleUser) => {
    return context.app.db.changeUserName(user);
};

const getSameDate: Route = (context: CallContext, data: DataPoint): DataPoint => {
    return data;
};

MkRouter.addRoutes({changeUserName, getSameDate});

let server;
startHttpServer({port: 8083}).then((srv) => {
    console.log('SERVER STARTED ======> port 8083', srv);
    server = srv;
});

process.on('SIGINT', function () {
    console.log('CLOSING SERVER');
    if (server)
        server.close((err) => {
            console.log('SERVER CLOSED ======> port 8083');
            process.exit();
        });
});
