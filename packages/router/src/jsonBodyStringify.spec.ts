/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {headersHook, hook, route} from './initFunctions';
import {getStringifyFnForExecutionPath} from './jsonBodyStringify';
import {initMionRouter, resetRouter} from './router';
import {Routes} from './types/general';
describe('getStringifyFnForExecutionPath', () => {
    const lastActivity = new Date();
    interface User {
        name: string;
        age: number;
        lastActivity: Date;
    }

    const routes = {
        auth: headersHook(['auth'], (ctx, token: string) => {}),
        users: {
            updateUser: route((ctx, user: User): User => ({...user, lastActivity})),
        },
        sayHello: route((ctx, name: string): string => `Hello, ${name}!`),
        logs: hook((ctx): void => {}),
    } satisfies Routes;

    beforeEach(() => resetRouter());

    it('should return the stringify function for the execution path of "updateUser" route', () => {
        initMionRouter(routes);
        const bodyStringify = getStringifyFnForExecutionPath('/users-updateUser');
        const body = {'users-updateUser': {name: 'John', age: 30, lastActivity}};
        const expectedString =
            '{"users-updateUser":{"name":"John","age":30,"lastActivity":"' + lastActivity.toISOString() + '"}}';
        expect(bodyStringify.stringify(body)).toEqual(expectedString);
    });

    it('should return the stringify function for the execution path of "sayHello" route', () => {
        initMionRouter(routes);
        const bodyStringify = getStringifyFnForExecutionPath('/sayHello');
        const body = {sayHello: 'Hello, Jack!'};
        const expectedString = '{"sayHello":"Hello, Jack!"}';
        expect(bodyStringify.stringify(body)).toEqual(expectedString);
    });

    it('should be faster than JSON.stringify', () => {
        initMionRouter(routes);
        const bodyStringify = getStringifyFnForExecutionPath('/users-updateUser');

        const body = {'users-updateUser': {name: 'John', age: 30, lastActivity}};
        const iterations = 1000;

        //  warm up the JIT compiler
        for (let i = 0; i < 100; i++) {
            bodyStringify.stringify(body);
        }

        // Measure the time taken by bodyStringify.stringify
        const bodyStringifyStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            bodyStringify.stringify(body);
        }
        const bodyStringifyEnd = performance.now();
        const bodyStringifyTime = bodyStringifyEnd - bodyStringifyStart;

        //  warm up JSON (Not really sure this is doing anything, but just in case)
        for (let i = 0; i < 100; i++) {
            JSON.stringify(body);
        }

        // Measure the time taken by JSON.stringify
        const jsonStringifyStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            JSON.stringify(body);
        }
        const jsonStringifyEnd = performance.now();
        const jsonStringifyTime = jsonStringifyEnd - jsonStringifyStart;

        // console.log(`stringifyTime: ${bodyStringifyTime}, JSON.stringify: ${jsonStringifyTime}`);

        // Assert that bodyStringify.stringify is faster than JSON.stringify
        expect(bodyStringifyTime).toBeLessThan(jsonStringifyTime);
    });
});
