/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {compileTypeToJs} from './cacheCompiler';
import {AOTConfig} from './types';
import {
    JitCompiledFn,
    RpcError,
    SrcCodeJITCompiledFnsCache,
    SrcCodePureFunctionsCache,
    getJitFnCaches,
    getJitUtils,
    resetJitFnCaches,
    MethodsCache,
    HeadersSubset,
    MethodWithOptions,
} from '@mionkit/core';
import {BaseRunType, JitFunctions, registerPureFnClosure, runType} from '@mionkit/run-types';
import {getPersistedMethods, headersHook, initRouter, registerRoutes, route, Routes} from '@mionkit/router';

afterEach(() => resetJitFnCaches());

it('should compile JIT functions cache to code', () => {
    // a real scenario would use compileAndWriteJitFunctions instead compileTypeToJs to persis to fileSystem

    // Create AOT config for JIT functions
    const aotConfig: AOTConfig = {
        module: 'esm',
        caches: {
            jit: {path: '/test/path/jitFunctionsCache.esm.js', exportName: 'jitFnsCache'},
            pure: {path: '/test/path/pureFunctionsCache.esm.js', exportName: 'pureFnsCache'},
            router: {path: '/test/path/routerCache.esm.js', exportName: 'routerCache'},
        },
    };

    type User = {name: string; age: number};
    const rt = runType<User>() as BaseRunType;
    const isTypeFn: JitCompiledFn = rt.createJitCompiledFunction(JitFunctions.isType.id);

    const {jitFnsCache} = getJitFnCaches();
    const mockCache = {isUser: isTypeFn};

    function compileCacheESM() {
        // Call the function under test
        const compiledMock = compileTypeToJs<SrcCodeJITCompiledFnsCache>(mockCache as any, aotConfig, aotConfig.caches.jit);

        // Check that the file code contains the ESM export statement
        const esmExportPattern = `export const ${aotConfig.caches.jit.exportName} =`;
        expect(compiledMock).toContain(esmExportPattern);
        const evalCode = compiledMock.replace(esmExportPattern, '').replace(/;\s*$/, '').trim();
        const evalResult = eval(`(${evalCode})`);
        evalResult['isUser'].fn = evalResult['isUser'].createJitFn(getJitUtils());
        const isUser = evalResult['isUser'].fn;
        expect(isUser({name: 'Karol', age: 30})).toBe(true);
        expect(isUser({name: 'Karol', age: '30'})).toBe(false);

        // guarantees cache in core package can be compiled
        // this contains any jit functions that are used by core package or mion packages
        const compiledCorePackage = compileTypeToJs<SrcCodeJITCompiledFnsCache>(
            jitFnsCache as any,
            aotConfig,
            aotConfig.caches.jit
        );
        expect(compiledCorePackage).toContain(esmExportPattern);
        const realEvalCode = compiledCorePackage.replace(esmExportPattern, '').replace(/;\s*$/, '').trim();
        expect(() => eval(`(${realEvalCode})`)).not.toThrow();

        // console.log('compiledMock ESM:', compiledMock);
        // console.log('compiledCorePackage ESM:', compiledCorePackage);
    }

    function compileCacheCJS() {
        // Create CJS config
        const cjsConfig: AOTConfig = {...aotConfig, module: 'cjs'};

        // Call the function under test
        const compiledMock = compileTypeToJs<SrcCodeJITCompiledFnsCache>(mockCache as any, cjsConfig, cjsConfig.caches.jit);

        // Check that the file code contains the CJS export statement
        const cjsExportPattern = `module.exports = { ${cjsConfig.caches.jit.exportName}:`;
        expect(compiledMock).toContain(cjsExportPattern);
        // Extract the code part from: module.exports = { exportName: <code> };
        const startIndex = compiledMock.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const endIndex = compiledMock.lastIndexOf(' };');
        const evalCode = compiledMock.substring(startIndex, endIndex).trim();
        const evalResult = eval(`(${evalCode})`);
        evalResult['isUser'].fn = evalResult['isUser'].createJitFn(getJitUtils());
        const isUser = evalResult['isUser'].fn;
        expect(isUser({name: 'Karol', age: 30})).toBe(true);
        expect(isUser({name: 'Karol', age: '30'})).toBe(false);

        // guarantees cache in core package can be compiled
        // this contains any jit functions that are used by core package or mion packages
        const compiledCorePackage = compileTypeToJs<SrcCodeJITCompiledFnsCache>(
            jitFnsCache as any,
            cjsConfig,
            cjsConfig.caches.jit
        );
        expect(compiledCorePackage).toContain(cjsExportPattern);
        const coreStartIndex = compiledCorePackage.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const coreEndIndex = compiledCorePackage.lastIndexOf(' };');
        const realEvalCode = compiledCorePackage.substring(coreStartIndex, coreEndIndex).trim();
        expect(() => eval(`(${realEvalCode})`)).not.toThrow();

        // console.log('compiledMock CJS:', compiledMock);
        // console.log('compiledCorePackage CJS:', compiledCorePackage);
    }

    compileCacheESM();
    compileCacheCJS();
});

it('should compile pure functions cache to code', () => {
    // a real scenario would use compileAndSaveTypeToJs instead compileTypeToJs to persis to fileSystem

    // Create AOT config for pure functions
    const aotConfig: AOTConfig = {
        module: 'esm',
        caches: {
            jit: {path: '/test/path/jitFunctionsCache.esm.js', exportName: 'jitFnsCache'},
            pure: {path: '/test/path/pureFunctionsCache.esm.js', exportName: 'pureFnsCache'},
            router: {path: '/test/path/routerCache.esm.js', exportName: 'routerCache'},
        },
    };

    /** @reflection never */
    function pureFnWIthContext() {
        return function addNumbers(a: number, b: number) {
            return a + b;
        };
    }

    const compiledPureFn = registerPureFnClosure(pureFnWIthContext);
    const mockCache = {addNumbers: compiledPureFn};
    const {pureFnsCache} = getJitFnCaches();

    function compilePureESM() {
        // Call the function under test
        const compiledMock = compileTypeToJs<SrcCodePureFunctionsCache>(mockCache as any, aotConfig, aotConfig.caches.pure);
        // Check that the file code contains the export statement with the correct export name
        expect(compiledMock).toContain(`export const ${aotConfig.caches.pure.exportName} =`);

        // Verify the code can be evaluated and contains our mock cache
        const evalCode = compiledMock
            .replace(`export const ${aotConfig.caches.pure.exportName} =`, '')
            .replace(/;\s*$/, '')
            .trim();
        const evalResult = eval(`(${evalCode})`);
        evalResult['addNumbers'].fn = evalResult['addNumbers'].createJitFn(getJitUtils());
        expect(evalResult.addNumbers.fn(1, 2)).toBe(3);

        // guarantees (real cache) in core package can be compiled
        // this contains any pure functions that are used by core package or mion packages
        const compiledCorePackage = compileTypeToJs<SrcCodePureFunctionsCache>(
            pureFnsCache as any,
            aotConfig,
            aotConfig.caches.pure
        );
        expect(compiledCorePackage).toContain(`export const ${aotConfig.caches.pure.exportName} =`);
        const realEvalCode = compiledCorePackage
            .replace(`export const ${aotConfig.caches.pure.exportName} =`, '')
            .replace(/;\s*$/, '')
            .trim();
        expect(() => eval(`(${realEvalCode})`)).not.toThrow();

        // console.log('compiledMock ESM:', compiledMock);
        // console.log('compiledCorePackage ESM:', compiledCorePackage);
    }

    function compilePureCJS() {
        // Create CJS config
        const cjsConfig: AOTConfig = {...aotConfig, module: 'cjs'};

        // Call the function under test
        const compiledMock = compileTypeToJs<SrcCodePureFunctionsCache>(mockCache as any, cjsConfig, cjsConfig.caches.pure);

        // Check that the file code contains the CJS export statement
        const cjsExportPattern = `module.exports = { ${cjsConfig.caches.pure.exportName}:`;
        expect(compiledMock).toContain(cjsExportPattern);

        // Extract the code part from: module.exports = { exportName: <code> };
        const startIndex = compiledMock.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const endIndex = compiledMock.lastIndexOf(' };');
        const evalCode = compiledMock.substring(startIndex, endIndex).trim();
        const evalResult = eval(`(${evalCode})`);
        evalResult['addNumbers'].fn = evalResult['addNumbers'].createJitFn(getJitUtils());
        expect(evalResult.addNumbers.fn(1, 2)).toBe(3);

        // guarantees (real cache) in core package can be compiled
        const compiledCorePackage = compileTypeToJs<SrcCodePureFunctionsCache>(
            pureFnsCache as any,
            cjsConfig,
            cjsConfig.caches.pure
        );
        expect(compiledCorePackage).toContain(cjsExportPattern);
        const coreStartIndex = compiledCorePackage.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const coreEndIndex = compiledCorePackage.lastIndexOf(' };');
        const coreEvalCode = compiledCorePackage.substring(coreStartIndex, coreEndIndex).trim();
        expect(() => eval(`(${coreEvalCode})`)).not.toThrow();

        // console.log('compiledMock CJS:', compiledMock);
        // console.log('compiledCorePackage CJS:', compiledCorePackage);
    }

    compilePureESM();
    compilePureCJS();
});

it('should compile router methods cache to code', async () => {
    const originalCompile = process.env.MION_COMPILE;
    process.env.MION_COMPILE = 'true';
    // a real scenario would use compileAndWriteRouterMethods instead compileTypeToJs to persis to fileSystem

    type User = {name: string; age: number};
    const testRoutes = {
        auth: headersHook(
            (
                ctx,
                h: HeadersSubset<'Authorization'>, // testing headers serialization
                userid: string // ensure we accept extra regular params
            ): HeadersSubset<'x-user-id'> => {
                const token = h.headers.Authorization;
                if (!token) throw new RpcError({message: 'Not Authorized', type: 'not-authorized'});
                return new HeadersSubset({'x-user-id': userid});
            }
        ),
        getUser: route((_ctx: any, name: string): User => ({name, age: 30})),
    } satisfies Routes;

    // Initialize router and register routes to create persisted methods
    await initRouter();
    await registerRoutes(testRoutes);

    // Verify that methods were persisted
    const persistedMethods = getPersistedMethods();
    const authMethodMetadata = persistedMethods.auth;
    const getUserMethodMetadata = persistedMethods.getUser;
    const mockCache = {auth: authMethodMetadata, getUser: getUserMethodMetadata};
    const expectedAuthMethodData: MethodWithOptions = {
        type: 3,
        id: 'auth',
        nestLevel: 0,
        hasReturnData: true,
        isAsync: false,
        pointer: ['auth'],
        paramNames: ['userid'],
        paramsJitHash: expect.any(String),
        returnJitHash: expect.any(String),
        headersParam: {
            headerNames: ['Authorization'],
            jitHash: expect.any(String),
        },
        headersReturn: {
            headerNames: ['x-user-id'],
            jitHash: expect.any(String),
        },
        options: {
            runOnError: false,
            validateParams: true,
            validateReturn: false,
        },
    };
    const expectedGetUserMethodData: MethodWithOptions = {
        type: 1,
        id: 'getUser',
        nestLevel: 0,
        hasReturnData: true,
        isAsync: false,
        pointer: ['getUser'],
        paramNames: ['name'],
        paramsJitHash: expect.any(String),
        returnJitHash: expect.any(String),
        options: {
            runOnError: false,
            validateParams: true,
            validateReturn: false,
            serializer: 'json',
        },
    };

    // Create AOT config for router methods
    const aotConfig: AOTConfig = {
        module: 'esm',
        caches: {
            jit: {path: '/test/path/jitFunctionsCache.esm.js', exportName: 'jitFnsCache'},
            pure: {path: '/test/path/pureFunctionsCache.esm.js', exportName: 'pureFnsCache'},
            router: {path: '/test/path/routerMethodsCache.esm.js', exportName: 'routerCache'},
        },
    };

    function compileRouterESM() {
        // Call the function under test
        const compiledMock = compileTypeToJs<MethodsCache>(mockCache as any, aotConfig, aotConfig.caches.router);

        // Check that the file code contains the ESM export statement
        const esmExportPattern = `export const ${aotConfig.caches.router.exportName} =`;
        expect(compiledMock).toContain(esmExportPattern);
        const evalCode = compiledMock.replace(esmExportPattern, '').replace(/;\s*$/, '').trim();
        const evalResult = eval(`(${evalCode})`);
        expect(evalResult.auth).toEqual(expectedAuthMethodData);
        expect(evalResult.getUser).toEqual(expectedGetUserMethodData);

        // guarantees cache in core package can be compiled
        // this contains any router methods that are used by core package or mion packages
        const compiledCorePackage = compileTypeToJs<MethodsCache>(persistedMethods as any, aotConfig, aotConfig.caches.router);
        expect(compiledCorePackage).toContain(esmExportPattern);
        const realEvalCode = compiledCorePackage.replace(esmExportPattern, '').replace(/;\s*$/, '').trim();
        expect(() => eval(`(${realEvalCode})`)).not.toThrow();

        // console.log('compiledMock ESM:', compiledMock);
        // console.log('compiledCorePackage ESM:', compiledCorePackage);
    }

    function compileRouterCJS() {
        // Create CJS config
        const cjsConfig: AOTConfig = {...aotConfig, module: 'cjs'};

        // Call the function under test
        const compiledMock = compileTypeToJs<MethodsCache>(mockCache as any, cjsConfig, cjsConfig.caches.router);

        // Check that the file code contains the CJS export statement
        const cjsExportPattern = `module.exports = { ${cjsConfig.caches.router.exportName}:`;
        expect(compiledMock).toContain(cjsExportPattern);
        // Extract the code part from: module.exports = { exportName: <code> };
        const startIndex = compiledMock.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const endIndex = compiledMock.lastIndexOf(' };');
        const evalCode = compiledMock.substring(startIndex, endIndex).trim();
        const evalResult = eval(`(${evalCode})`);
        expect(evalResult.auth).toEqual(expectedAuthMethodData);
        expect(evalResult.getUser).toEqual(expectedGetUserMethodData);

        // guarantees cache in core package can be compiled
        const compiledCorePackage = compileTypeToJs<MethodsCache>(persistedMethods as any, cjsConfig, cjsConfig.caches.router);
        expect(compiledCorePackage).toContain(cjsExportPattern);
        const coreStartIndex = compiledCorePackage.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const coreEndIndex = compiledCorePackage.lastIndexOf(' };');
        const coreEvalCode = compiledCorePackage.substring(coreStartIndex, coreEndIndex).trim();
        expect(() => eval(`(${coreEvalCode})`)).not.toThrow();

        // console.log('compiledMock CJS:', compiledMock);
        // console.log('compiledCorePackage CJS:', compiledCorePackage);
    }

    compileRouterESM();
    compileRouterCJS();
    process.env.MION_COMPILE = originalCompile;
});
