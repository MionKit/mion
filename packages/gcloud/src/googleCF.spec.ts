/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, registerRoutes, resetRouter, route, getRouteExecutionPath} from '@mionkit/router';
import {googleCFHandler, resetGoogleCFOpts, setGoogleCFOpts} from './googleCF';
import type {CallContext, Route} from '@mionkit/router';
import {
    MION_ROUTES,
    PublicRpcError,
    StatusCodes,
    serializeBinaryBody,
    deserializeBinaryBody,
    MethodWithJitFns,
} from '@mionkit/core';
import {Server} from 'http';
import {getTestServer} from '@google-cloud/functions-framework/testing';
import * as functions from '@google-cloud/functions-framework';

describe('serverless router', () => {
    type SimpleUser = {
        name: string;
        surname: string;
    };
    type DataPoint = {
        date: Date;
    };
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

    const changeUserName: Route = route((ctx: Context, user: SimpleUser): SimpleUser => {
        return myApp.db.changeUserName(user);
    });

    const getDate: Route = route((ctx: Context, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
    });

    const updateHeaders: Route = route((context: Context): void => {
        context.response.headers.set('x-something', 'true');
        context.response.headers.set('server', 'my-server');
    });

    // fake express server passing the request and response to the google cloud function handler
    const port = 8087;
    let server: Server;
    async function initServer(portToUse: number) {
        return new Promise<Server>((resolve, reject) => {
            functions.http('HelloTests', googleCFHandler);
            const expressServer = getTestServer('HelloTests');
            expressServer.listen(portToUse, () => resolve(expressServer));
        });
    }

    const closeServer = (s: Server) => {
        return new Promise<void>((resolve, reject) => {
            s.close((err) => {
                if (err) reject();
                else resolve();
            });
        });
    };

    describe('with useJitStringify=true (default)', () => {
        beforeAll(async () => {
            resetGoogleCFOpts();
            resetRouter();
            await initRouter({contextDataFactory: getSharedData, prefix: 'api/'});
            await registerRoutes({changeUserName, getDate, updateHeaders});
            server = await initServer(port);
        });

        afterAll(async () => closeServer(server));

        it('get an ok response from a route', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
            const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
                method: 'POST',
                body: JSON.stringify(requestData),
            });

            const reply = await response.json();
            const headers = Object.fromEntries(response.headers.entries());

            expect(reply).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
            expect(headers['connection']).toEqual('keep-alive');
            expect(headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(headers['content-length']).toEqual('47');
            expect(headers['server']).toEqual('@mionkit');
        });

        it('get an ok response from a route when content type is json', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
            const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(requestData),
            });

            const reply = await response.json();
            const headers = Object.fromEntries(response.headers.entries());

            expect(reply).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
            expect(headers['connection']).toEqual('keep-alive');
            expect(headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(headers['content-length']).toEqual('47');
            expect(headers['server']).toEqual('@mionkit');
        });

        it('get an error when sending invalid parameters', async () => {
            const requestData = {getDate: ['NOT A DATE POINT']};
            const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
                method: 'POST',
                body: JSON.stringify(requestData),
            });
            const reply = await response.json();
            const headers = Object.fromEntries(response.headers.entries());

            const expectedError: PublicRpcError<'validation-error'> = {
                'mion@isΣrrθr': true,
                publicMessage: `Invalid params in 'getDate', validation failed.`,
                type: 'validation-error',
                errorData: {typeErrors: expect.anything()},
                statusCode: StatusCodes.UNEXPECTED_ERROR,
            };
            expect(reply[MION_ROUTES.thrownErrors]).toEqual({getDate: expectedError});
            expect(headers['connection']).toEqual('keep-alive');
            expect(headers['content-type']).toEqual('application/json; charset=utf-8');
            // TODO: seems that deepkit error type are slightly different when running on bun and node so length is different
            // bun: getDate.errorData.message = 'Cannot convert NOT A DATE POINT to UnknownTypeName:() => __\\u{3a9}DataPoint'
            // node: getDate.errorData.message = 'Cannot convert NOT A DATE POINT to DataPoint'
            expect(headers['content-length']).toEqual('224');
            expect(headers['server']).toEqual('@mionkit');
        });

        it('set response headers from route response', async () => {
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

        it('get default headers', async () => {
            const smallPort = port + 1;
            const routerOpts = {
                contextDataFactory: getSharedData,
                prefix: 'api/',
            };
            const httpOpts = {
                abcd: 'hello',
                defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
            };
            resetGoogleCFOpts();
            resetRouter();
            setGoogleCFOpts(httpOpts);
            await initRouter(routerOpts);
            await registerRoutes({changeUserName, getDate, updateHeaders});
            const smallServer = await initServer(smallPort);
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
                const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
                const response = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {
                    method: 'POST',
                    body: JSON.stringify(requestData),
                });
                const headers = Object.fromEntries(response.headers.entries());

                expect(headers['x-app-name']).toEqual('MyApp');
                expect(headers['x-instance-id']).toEqual('3089');
                expect(headers['connection']).toEqual('keep-alive');
                expect(headers['content-type']).toEqual('application/json; charset=utf-8');
                expect(headers['content-length']).toEqual('47');
                expect(headers['server']).toEqual('@mionkit');
            } catch (e) {
                err = e;
            }

            await closeSmallServer();

            // Restore router state for the main server
            resetGoogleCFOpts();
            resetRouter();
            await initRouter({contextDataFactory: getSharedData, prefix: 'api/'});
            await registerRoutes({changeUserName, getDate, updateHeaders});

            if (err) throw err;
        });
    });

    describe('with useJitStringify=false', () => {
        const port2 = 8088;
        let server2: Server;
        async function initServer2(portToUse: number) {
            return new Promise<Server>((resolve, reject) => {
                functions.http('HelloTestsNoJit', googleCFHandler);
                const expressServer = getTestServer('HelloTestsNoJit');
                expressServer.listen(portToUse, () => resolve(expressServer));
            });
        }

        beforeAll(async () => {
            resetGoogleCFOpts();
            resetRouter();
            await initRouter({contextDataFactory: getSharedData, prefix: 'api/', useJitStringify: false});
            await registerRoutes({changeUserName, getDate});
            server2 = await initServer2(port2);
        });

        afterAll(async () => closeServer(server2));

        it('get an ok response from a route with Date objects (body type O)', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
            const response = await fetch(`http://127.0.0.1:${port2}/api/getDate`, {
                method: 'POST',
                body: JSON.stringify(requestData),
            });

            const reply = await response.json();
            const headers = Object.fromEntries(response.headers.entries());

            expect(reply).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
            expect(headers['connection']).toEqual('keep-alive');
            expect(headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(headers['content-length']).toEqual('47');
            expect(headers['server']).toEqual('@mionkit');
        });

        it('get an ok response from a route with complex objects (body type O)', async () => {
            const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
            const response = await fetch(`http://127.0.0.1:${port2}/api/changeUserName`, {
                method: 'POST',
                body: JSON.stringify(requestData),
            });

            const reply = await response.json();
            const headers = Object.fromEntries(response.headers.entries());

            expect(reply).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
            expect(headers['connection']).toEqual('keep-alive');
            expect(headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(headers['server']).toEqual('@mionkit');
        });
    });

    describe('with serialize=binary', () => {
        const port3 = 8090;
        let server3: Server;

        /** Helper to build a methods map from an execution path */
        function buildMethodsMap(executionPath: MethodWithJitFns[]): Map<string, MethodWithJitFns> {
            const map = new Map<string, MethodWithJitFns>();
            for (const method of executionPath) map.set(method.id, method);
            return map;
        }

        async function initServer3(portToUse: number) {
            return new Promise<Server>((resolve, reject) => {
                functions.http('HelloTestsBinary', googleCFHandler);
                const expressServer = getTestServer('HelloTestsBinary');
                expressServer.listen(portToUse, () => resolve(expressServer));
            });
        }

        beforeAll(async () => {
            resetGoogleCFOpts();
            resetRouter();
            await initRouter({contextDataFactory: getSharedData, serializer: 'binary'});
            await registerRoutes({changeUserName, getDate});
            server3 = await initServer3(port3);
        });

        afterAll(async () => closeServer(server3));

        it('should send binary request and receive binary response with Date objects', async () => {
            const executionPath = getRouteExecutionPath('/getDate')!.methods;
            const methodsMap = buildMethodsMap(executionPath);

            // Serialize request body to binary
            const requestBody = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
            const {buffer: requestBuffer} = serializeBinaryBody('/getDate', executionPath, requestBody, false);

            const response = await fetch(`http://127.0.0.1:${port3}/getDate`, {
                method: 'POST',
                headers: {'content-type': 'application/octet-stream'},
                body: Buffer.from(requestBuffer),
            });
            const headers = Object.fromEntries(response.headers.entries());
            const responseBuffer = await response.arrayBuffer();

            // Deserialize binary response
            const {body: responseBody} = deserializeBinaryBody('/getDate', methodsMap, responseBuffer, true);

            expect(responseBody.getDate).toBeDefined();
            expect(responseBody.getDate.date).toEqual(new Date('2022-04-22T00:17:00.000Z'));
            expect(headers['content-type']).toEqual('application/octet-stream');
            expect(headers['server']).toEqual('@mionkit');
        });

        it('should send binary request and receive binary response with complex objects', async () => {
            const executionPath = getRouteExecutionPath('/changeUserName')!.methods;
            const methodsMap = buildMethodsMap(executionPath);

            // Serialize request body to binary
            const requestBody = {changeUserName: [{name: 'John', surname: 'Doe'}]};
            const {buffer: requestBuffer} = serializeBinaryBody('/changeUserName', executionPath, requestBody, false);

            const response = await fetch(`http://127.0.0.1:${port3}/changeUserName`, {
                method: 'POST',
                headers: {'content-type': 'application/octet-stream'},
                body: Buffer.from(requestBuffer),
            });
            const headers = Object.fromEntries(response.headers.entries());
            const responseBuffer = await response.arrayBuffer();

            // Deserialize binary response
            const {body: responseBody} = deserializeBinaryBody('/changeUserName', methodsMap, responseBuffer, true);

            expect(responseBody.changeUserName).toBeDefined();
            expect(responseBody.changeUserName.name).toEqual('NewName');
            expect(responseBody.changeUserName.surname).toEqual('Doe');
            expect(headers['content-type']).toEqual('application/octet-stream');
            expect(headers['server']).toEqual('@mionkit');
        });

        it('should handle optional parameters in binary mode', async () => {
            const executionPath = getRouteExecutionPath('/getDate')!.methods;
            const methodsMap = buildMethodsMap(executionPath);

            // Serialize request body with no params (optional dataPoint)
            const requestBody = {getDate: [undefined]};
            const {buffer: requestBuffer} = serializeBinaryBody('/getDate', executionPath, requestBody, false);

            const response = await fetch(`http://127.0.0.1:${port3}/getDate`, {
                method: 'POST',
                headers: {'content-type': 'application/octet-stream'},
                body: Buffer.from(requestBuffer),
            });
            const headers = Object.fromEntries(response.headers.entries());
            const responseBuffer = await response.arrayBuffer();

            // Deserialize binary response - should return default date
            const {body: responseBody} = deserializeBinaryBody('/getDate', methodsMap, responseBuffer, true);

            expect(responseBody.getDate).toBeDefined();
            expect(responseBody.getDate.date).toEqual(new Date('2022-04-10T02:13:00.000Z'));
            expect(headers['content-type']).toEqual('application/octet-stream');
        });
    });
});
