/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient} from './client';
import {HookSubRequest, RouteSubRequest} from './types';
import {RpcError} from '@mionkit/core';
import {TestServerApi} from '../test/test-server';
import {spawn, ChildProcess} from 'child_process';
import {join} from 'path';

// TODO move this into global jest config file if it is required by more tests
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

// TODO: test & write client
describe('client', () => {
    const someUser = {name: 'John', surname: 'Doe'};
    type MyApi = TestServerApi;

    const port = 8076;
    const baseURL = `http://localhost:${port}`;
    let serverProcess: ChildProcess;

    beforeAll(async () => {
        // Start the server in a separate process using ts-node
        const serverPath = join(__dirname, 'test-server.ts');
        serverProcess = spawn('npx', ['ts-node', serverPath, port.toString()], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: join(__dirname, '..', '..'), // Go to client package root
        });

        // Wait for server to start
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Server startup timeout'));
            }, 10000);

            serverProcess.stdout?.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Test server started')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            serverProcess.stderr?.on('data', (data) => {
                console.error('Server stderr:', data.toString());
            });

            serverProcess.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            serverProcess.on('exit', (code) => {
                if (code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error(`Server process exited with code ${code}`));
                }
            });
        });
    });

    afterAll(async () => {
        if (serverProcess) {
            serverProcess.kill('SIGTERM');

            // Wait for process to exit
            await new Promise<void>((resolve) => {
                serverProcess.on('exit', () => resolve());
                // Force kill after 5 seconds if it doesn't exit gracefully
                setTimeout(() => {
                    if (!serverProcess.killed) {
                        serverProcess.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);
            });
        }
    });

    it('proxy to trap remote methods calls and return MethodRequest data', () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        const expectedAuthSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: ['XWYZ-TOKEN'],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            validate: expect.any(Function),
        };

        const expectedSayHelloSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['sayHello'],
            id: 'sayHello',
            isResolved: false,
            params: [someUser],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            validate: expect.any(Function),
        };

        const expectedSumTwoSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['utils', 'sumTwo'],
            id: 'utils-sumTwo',
            isResolved: false,
            params: [2],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            validate: expect.any(Function),
        };

        expect(hooks.auth('XWYZ-TOKEN')).toEqual(expect.objectContaining(expectedAuthSubRequest));
        expect(routes.sayHello(someUser)).toEqual(expect.objectContaining(expectedSayHelloSubRequest));
        expect(routes.utils.sumTwo(2)).toEqual(expect.objectContaining(expectedSumTwoSubRequest));

        // is a proxy so actually could trap any call even if does not exists in methods and is not strongly typed
        // note bellow code should not be used when using the client
        const expectedUnknownSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['abcd'],
            id: 'abcd',
            isResolved: false,
            params: [1, 'a'],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            validate: expect.any(Function),
        };
        expect((routes as any).abcd(1, 'a')).toEqual(expectedUnknownSubRequest);
        expect((hooks as any).abcd(1, 'a')).toEqual(expectedUnknownSubRequest);
    });

    it('make a route call and get a valid response', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        const response = await routes.sayHello(someUser).call(hooks.auth('XWYZ-TOKEN'));
        expect(response).toEqual(`Hello John Doe`);
    });

    it('throw error if a route call fails', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        let error: any;
        const expectedError = new RpcError({
            message: 'Something fails',
            name: 'UnknownError',
            statusCode: 500,
        });

        try {
            const user = await routes.alwaysFails(someUser).call(hooks.auth('XWYZ-TOKEN'));
            console.log(user);
        } catch (e) {
            console.log(e);
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });

    it('throw error if a route is missing hook data', async () => {
        const {routes} = initClient<MyApi>({baseURL});

        let error: any;
        const expectedError = new RpcError({
            message: `Invalid params for Route or Hook 'auth', validation failed.`,
            name: 'Validation Error',
            statusCode: 400,
        });

        try {
            await routes.sayHello(someUser).call();
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });

    it('validate parameters', async () => {
        const {routes} = initClient<MyApi>({baseURL});

        const responseOk = await routes.sayHello(someUser).validate();

        expect(responseOk).toEqual({
            errors: [[]],
            hasErrors: false,
            totalErrors: 0,
        });

        let error: any;
        const expectedError = new RpcError({
            message: `Invalid params for Route or Hook 'sayHello', validation failed.`,
            name: 'Validation Error',
            statusCode: 400,
            errorData: {
                errors: [[{code: 'type', message: 'Not an object', path: ''}]],
                hasErrors: true,
                totalErrors: 1,
            },
        });

        try {
            await routes.sayHello('invalid-param' as any).validate();
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.errorData).toEqual(expectedError.errorData);
    });

    it('prefill and remove prefill from a request', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        const request = hooks.auth('ABYWZ-TOKEN');
        await request.prefill();
        // note auth has been prefilled and is not required to be sent in the call

        let response: any;
        try {
            response = await routes.sayHello(someUser).call();
        } catch (e) {
            console.trace(e);
        }
        expect(response).toEqual(`Hello John Doe`);

        // same call should fail after removing the prefill

        request.removePrefill();

        let error: any;
        const expectedError = new RpcError({
            message: `Invalid params for Route or Hook 'auth', validation failed.`,
            name: 'Validation Error',
            statusCode: 400,
        });

        try {
            await routes.sayHello(someUser).call();
        } catch (e) {
            error = e;
        }
        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });
});
