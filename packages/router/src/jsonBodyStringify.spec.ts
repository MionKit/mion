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
        // stringify number seem to be the best scenario for JitStringify
        extra?: {
            a: number;
            b: number;
            c: number;
            d: number;
            e: number;
            f: number;
            g: number;
            h: number;
            i: number;
            j: number;
        };
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
        expect(bodyStringify(body)).toEqual(expectedString);
    });

    it('should return the stringify function for the execution path of "sayHello" route', () => {
        initMionRouter(routes);
        const bodyStringify = getStringifyFnForExecutionPath('/sayHello');
        const body = {sayHello: 'Hello, Jack!'};
        const expectedString = '{"sayHello":"Hello, Jack!"}';
        expect(bodyStringify(body)).toEqual(expectedString);
    });

    it('should be faster than JSON.stringify', () => {
        initMionRouter(routes);
        const bodyStringify = getStringifyFnForExecutionPath('/users-updateUser');

        const body = {
            'users-updateUser': {
                name: 'John',
                age: 30,
                lastActivity,
                extra: {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10},
            },
        };

        const iterations = 50_000;

        // Measure the time taken by bodyStringify.stringify
        const bodyStringifyStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            bodyStringify(body);
        }
        const bodyStringifyEnd = performance.now();
        const bodyStringifyTime = bodyStringifyEnd - bodyStringifyStart;

        // Measure the time taken by JSON.stringify
        const jsonStringifyStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            JSON.stringify(body);
        }
        const jsonStringifyEnd = performance.now();
        const jsonStringifyTime = jsonStringifyEnd - jsonStringifyStart;

        // console.log(`stringifyTime: ${bodyStringifyTime}, JSON.stringify: ${jsonStringifyTime}`);

        // Assert that bodyStringify.stringify is faster than JSON.stringify
        // TODO sometimes test fails so disabling it for now
        expect(bodyStringifyTime).toBeLessThan(jsonStringifyTime);
    });
});
