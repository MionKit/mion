/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {hook, route} from './handlers';
import {getHookExecutable, getRouteExecutable, initMionRouter, resetRouter} from './router';
import {Routes} from './types/general';
import fs from 'fs';
import path from 'path';
import {setCompiledProcedures, writeCompiledProcedures} from './compiler';
import {dispatchRoute} from './dispatch';
import {headersFromRecord} from './headers';
import {MionHeaders} from './types/context';
import {rΦutεs} from './_compiled/routes';
import {getProceduresToCodeFn} from '@mionkit/router/src/reflection';
import {NonRawProcedure} from '@mionkit/router/src/types/procedures';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

const originalFile = `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\nexport const rΦutεs = {};\n`;
process.env.MION_COMPILE = 'true';

describe('compiler', () => {
    const lastActivity = new Date();
    interface User {
        name: string;
        age: number;
        lastActivity: Date;
    }

    const routes = {
        users: {
            updateUser: route((ctx, user: User): User => ({...user, lastActivity})),
        },
        sayHello: route((ctx, name: string): string => `Hello, ${name}!`),
        logs: hook((ctx): void => {}),
    } satisfies Routes;

    const getDefaultRequest = (path: string, params?): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    it('should compile code', async () => {
        initMionRouter(routes);

        const currentContent = fs.readFileSync(path.join(__dirname, '_compiled.ts'), 'utf8');
        expect(currentContent).toEqual(originalFile);

        expect(rΦutεs['users-updateUser']).toEqual(serializedUpdateUser);
        expect(rΦutεs['sayHello']).toEqual(serializedSayHello);
        expect(rΦutεs['logs']).toEqual(restoredLogs);

        const compiledCode = writeCompiledProcedures(false);
        const restoredCompiled = new Function('return ' + compiledCode)();

        resetRouter();
        setCompiledProcedures(restoredCompiled); // set mock compiled procedures
        initMionRouter(routes);
        const updateUserProcedure = getRouteExecutable('users-updateUser') as any;
        const sayHelloProcedure = getRouteExecutable('sayHello') as any;
        const logsProcedure = getHookExecutable('logs') as any;
        expect(updateUserProcedure.restored).toEqual(true);
        expect(sayHelloProcedure.restored).toEqual(true);
        expect(logsProcedure.restored).toEqual(true);

        // should work properly after restore procedures from compiled
        const request = getDefaultRequest('users-updateUser', [{name: 'Leo', age: 33, lastActivity}]);
        const response = await dispatchRoute(
            '/users-updateUser',
            request.body,
            request.headers,
            headersFromRecord({}),
            request,
            {}
        );
        expect(response.body['users-updateUser']).toEqual({name: 'Leo', age: 33, lastActivity});
    });

    it('should crete a function to write compiled procedures', () => {
        const proceduresToCode = getProceduresToCodeFn();
        initMionRouter(routes);

        const code = proceduresToCode(rΦutεs);
        expect(code).toEqual(expect.any(String));
        // TODO finish functionality

        // console.log(rΦutεs);
        // const codeAfter = proceduresToCode(rΦutεs);
        // console.log('codeAfter', codeAfter);
        // expect(codeAfter).toEqual(expect.any(String));
    });
});

const restoredLogs = {
    id: 'logs',
    type: 2,
    nestLevel: 0,
    handler: expect.any(Function),
    paramsJitFns: {
        isType: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        typeErrors: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        toJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        fromJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        jsonStringify: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
    },
    returnJitFns: {
        isType: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        typeErrors: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        toJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        fromJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        jsonStringify: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
    },
    paramNames: [],
    pointer: ['logs'],
    headerNames: undefined,
    options: {
        runOnError: false,
        hasReturnData: false,
        validateParams: true,
        deserializeParams: false,
        validateReturn: false,
        serializeReturn: false,
        description: undefined,
        isAsync: false,
    },
};

const serializedSayHello = {
    id: 'sayHello',
    type: 1,
    nestLevel: 0,
    handler: expect.any(Function),
    paramsJitFns: {
        isType: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        typeErrors: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        toJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        fromJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        jsonStringify: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
    },
    returnJitFns: {
        isType: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        typeErrors: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        toJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        fromJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        jsonStringify: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
    },
    paramNames: ['name'],
    pointer: ['sayHello'],
    options: {
        runOnError: false,
        hasReturnData: true,
        validateParams: true,
        deserializeParams: false,
        validateReturn: false,
        serializeReturn: false,
        description: undefined,
        isAsync: false,
    },
};

const serializedUpdateUser = {
    id: 'users-updateUser',
    type: 1,
    nestLevel: 1,
    handler: expect.any(Function),
    paramsJitFns: {
        isType: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        typeErrors: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        toJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        fromJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        jsonStringify: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
    },
    returnJitFns: {
        isType: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        typeErrors: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        toJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        fromJsonVal: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
        jsonStringify: {
            varNames: ['vλluε0'],
            code: expect.any(String),
            fn: expect.any(Function),
        },
    },
    paramNames: ['user'],
    pointer: ['users', 'updateUser'],
    options: {
        runOnError: false,
        hasReturnData: true,
        validateParams: true,
        deserializeParams: true,
        validateReturn: false,
        serializeReturn: false,
        description: undefined,
        isAsync: false,
    },
};
