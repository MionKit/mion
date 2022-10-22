/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {Context, Hook, MkRequest, Route, StatusCodes, MkRouter} from '@mikrokit/router';
import fetch from 'node-fetch'; // must be node-fetch v2 as v3 is a node module non compatible whit current setup
import {initHttpApp} from './mikrokitHttp';

describe('serverless router should', () => {
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

    const {emptyContext, startHttpServer} = initHttpApp(app, getSharedData, {prefix: 'api/'});
    type CallContext = typeof emptyContext;

    const changeUserName: Route = (context: CallContext, user: SimpleUser) => {
        return context.app.db.changeUserName(user);
    };

    const getDate: Route = (context: CallContext, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date()};
    };

    let server;

    MkRouter.addRoutes({changeUserName, getDate});

    beforeAll(async () => {
        server = await startHttpServer({port: 8083});
        console.log('SERVER STARTED ======> port 8083');
    });

    afterAll(
        async () =>
            new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    console.log('SERVER CLOSED ======> port 8083');
                    if (err) reject();
                    else resolve();
                });
            }),
    );

    it('should get a response from a route', async () => {
        const response = await fetch('http://127.0.0.1:8083/api/getDate', {method: 'POST'});
        const json = await response.json();
        console.log(response.headers);
        console.log(json);
    });

    it('create bindings for aws lambda', () => {});

    it('create bindings for azure functions', () => {});

    it('create bindings for google cloud functions', async () => {});
});
