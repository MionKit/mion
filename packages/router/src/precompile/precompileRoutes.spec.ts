/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {hook, route} from '../handlers';
import {getRouteExecutable, initMionRouter, resetRouter} from '../router';
import {Routes} from '../types/general';
import {getPersistedMethods, routerCompilerConstants, setPersistedMethods} from '../methodsCache';
import {codifyMethods} from './precompileRoutes';
import {dispatchRoute} from '../dispatch';
import {headersFromRecord} from '../headers';
import {MionHeaders} from '../types/context';
import {MethodData} from '../types/remoteMethods';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

process.env.MION_COMPILE = 'true';

describe('persistedMethods', () => {
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

    const userId = 'users-updateUser';
    const sayHelloId = 'sayHello';

    function callUpdateUser() {
        const userRequest = getDefaultRequest(userId, [
            {name: 'Leo', age: 21, lastActivity: new Date('2022-04-10T02:13:00.000Z')},
        ]);
        return dispatchRoute('/users-updateUser', userRequest.body, userRequest.headers, headersFromRecord({}), userRequest, {});
    }

    function callSayHello() {
        const sayHelloRequest = getDefaultRequest(sayHelloId, ['John']);
        return dispatchRoute(
            '/sayHello',
            sayHelloRequest.body,
            sayHelloRequest.headers,
            headersFromRecord({}),
            sayHelloRequest,
            {}
        );
    }

    beforeEach(() => resetRouter());

    it('should compile and restore methods', async () => {
        // compiled methods should be empty first time
        expect(getPersistedMethods()).toEqual({});
        initMionRouter(routes);
        const firstCreatedMethods = getPersistedMethods();
        const userResponse = await callUpdateUser();
        const sayHelloResponse = await callSayHello();

        const userRouteExec = getRouteExecutable('users-updateUser') as any;
        const sayHelloRouteExec = getRouteExecutable('sayHello') as any;
        expect(userRouteExec.isRestored).toBeUndefined();
        expect(sayHelloRouteExec.isRestored).toBeUndefined();

        const compiledCode = codifyMethods();

        expect(compiledCode).toContain(`export const ${routerCompilerConstants.exportName} =`);
        const evalCode = compiledCode.replace(`export const ${routerCompilerConstants.exportName} =`, '');
        const evalResult = eval(`(${evalCode})`);

        // console.log('compiledCode:', compiledCode);
        // console.log('evalCode:', evalCode);
        // console.log('evalResult:', evalResult);

        resetRouter();
        setPersistedMethods(evalResult);
        // when we using compiled methods should not be empty so router uses them
        expect(getPersistedMethods()).not.toEqual({});
        initMionRouter(routes);
        const restoredMethods = getPersistedMethods();
        expect(getPersistedMethods()).toEqual(evalResult);

        const userRouteExec2 = getRouteExecutable('users-updateUser') as any;
        const sayHelloRouteExec2 = getRouteExecutable('sayHello') as any;
        expect(userRouteExec2.isRestored).toBe(true);
        expect(sayHelloRouteExec2.isRestored).toBe(true);

        const userResponse2 = await callUpdateUser();
        const sayHelloResponse2 = await callSayHello();
        expect(userResponse2.body).toEqual(userResponse.body);
        expect(sayHelloResponse2.body).toEqual(sayHelloResponse.body);

        function checkMethodData(first: MethodData, second: MethodData) {
            expect(first.id).toEqual(second.id);
            expect(first.type).toEqual(second.type);
            expect(first.nestLevel).toEqual(second.nestLevel);
            expect(first.paramsJitHashes).toEqual(second.paramsJitHashes);
            expect(first.returnJitHashes).toEqual(second.returnJitHashes);
            expect(first.options).toEqual(second.options);

            expect(first.paramsJitHashes).not.toBe(second.paramsJitHashes);
            expect(first.returnJitHashes).not.toBe(second.returnJitHashes);
            expect(first.options).not.toBe(second.options);
        }

        checkMethodData(firstCreatedMethods[userId], restoredMethods[userId]);
        checkMethodData(firstCreatedMethods[sayHelloId], restoredMethods[sayHelloId]);
    });
});
