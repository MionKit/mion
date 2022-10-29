/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {Route, MkRouter} from '@mikrokit/router';
import fetch from 'node-fetch'; // must be node-fetch v2 as v3 is a node module non compatible whit current setup
import {initHttpApp} from './mikrokitHttp';

describe('serverless router should', () => {
    // MkRouter.forceConsoleLogs();
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
        return dataPoint || {date: new Date('December 17, 2020 03:24:00')};
    };

    const updateHeaders: Route = (context: CallContext): void => {
        context.response.headers['x-something'] = true;
        context.response.headers['server'] = 'my-server';
    };

    let server;

    MkRouter.addRoutes({changeUserName, getDate, updateHeaders});

    const port = 8075;
    beforeAll(async () => {
        server = await startHttpServer({port});
    });

    afterAll(
        async () =>
            new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) reject();
                    else resolve();
                });
            }),
    );

    it('should get an ok response from a route', async () => {
        const requestData = {'/api/getDate': [{date: new Date('April 10, 2022 03:24:00')}]};
        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });
        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        expect(reply).toEqual({'/api/getDate': {date: '2022-04-10T01:24:00.000Z'}});
        expect(headers['connection']).toEqual('close');
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('52');
        expect(headers['server']).toEqual('@mikrokit/http');
    });

    it('should get an error when sending invalid parameters', async () => {
        const requestData = {'/api/getDate': ['NOT A DATE POINT']};
        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });
        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        const expectedError = {
            message: `Invalid input '/api/getDate', can not deserialize. Parameters might be of the wrong type.`,
            statusCode: 400,
        };
        expect(reply).toEqual({errors: [expectedError]});
        expect(headers['connection']).toEqual('close');
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('133');
        expect(headers['server']).toEqual('@mikrokit/http');
    });

    fit('should set response headers', async () => {
        const response = await fetch(`http://127.0.0.1:${port}/api/updateHeaders`, {
            method: 'POST',
            body: '{}',
        });
        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        expect(reply).toEqual({});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('2');
        expect(headers['server']).toEqual('my-server');
        expect(headers['x-something']).toEqual('true');
    });

    it('should get an error when body size is too large, get default headers and call allowExceedMaxBodySize', async () => {
        const smallPort = port + 1;
        let isCalled = false;
        const httpOptions = {
            port: smallPort,
            maxBodySize: 1,
            defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
            allowExceedMaxBodySize: () => {
                isCalled = true;
                return false;
            },
        };
        const smallServer = await startHttpServer(httpOptions);
        const closeSmallServer = () => {
            return new Promise<void>((resolve, reject) => {
                smallServer.close((err) => {
                    if (err) reject();
                    else resolve();
                });
            });
        };
        let err;
        try {
            const requestData = {'/api/getDate': [{date: new Date('April 10, 2022 03:24:00')}]};
            const response = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {
                method: 'POST',
                body: JSON.stringify(requestData),
            });
            const headers = Object.fromEntries(response.headers.entries());
            const reply = await response.json();

            const expectedError = {
                message: `Request Payload Too Large`,
                statusCode: 413,
            };
            expect(reply).toEqual({errors: [expectedError]});
            expect(headers['x-app-name']).toEqual('MyApp');
            expect(headers['x-instance-id']).toEqual('3089');
            expect(headers['connection']).toEqual('close');
            expect(headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(headers['content-length']).toEqual('69');
            expect(headers['server']).toEqual('@mikrokit/http');
            expect(isCalled).toEqual(true);
        } catch (e) {
            err = e;
        }

        await closeSmallServer();
        if (err) throw err;
    });
});
