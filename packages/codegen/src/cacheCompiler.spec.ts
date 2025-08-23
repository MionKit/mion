/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SrcCodeCompilerConstants, compileTypeToJs, routerCompilerConstants, runTypeCompilerConstants} from './cacheCompiler';
import {
    JitCompiledFn,
    SrcCodeJITCompiledFnsCache,
    SrcCodePureFunctionsCache,
    getFnCaches,
    jitUtils,
    resetFnCaches,
} from '@mionkit/core';
import {getPersistedMethods, initRouter, MethodsCache, registerRoutes, route, Routes} from '@mionkit/router';
import {BaseRunType, JitFunctions, registerPureFnClosure, runType} from '@mionkit/run-types';

afterEach(() => resetFnCaches());

it('should compile JIT functions cache to code', () => {
    // a real scenario would use compileAndWriteJitFunctions instead compileTypeToJs to persis to fileSystem

    // Create a mock JitFunctionsCache
    const compOpts = {
        ...runTypeCompilerConstants,
        typeName: 'JIT functions',
        files: {
            jit: {path: '/test/path/jitFunctionsCache.esm.js', module: 'esm'},
            pure: {path: '', module: 'esm'},
        },
        opts: {isJitFnCode: true},
    } satisfies SrcCodeCompilerConstants;

    type User = {name: string; age: number};
    const rt = runType<User>() as BaseRunType;
    const isTypeFn: JitCompiledFn = rt.createJitCompiledFunction(JitFunctions.isType.id);

    const {jitFnsCache} = getFnCaches();
    const mockCache = {isUser: isTypeFn};

    function compileCacheESM() {
        // Call the function under test
        const compiledMock = compileTypeToJs<SrcCodeJITCompiledFnsCache>(mockCache as any, compOpts, 'esm');

        // Check that the file code contains the ESM export statement
        const esmExportPattern = `export const ${compOpts.exportName} =`;
        expect(compiledMock).toContain(esmExportPattern);
        const evalCode = compiledMock.replace(esmExportPattern, '').trim();
        const evalResult = eval(`(${evalCode})`);
        evalResult['isUser'].fn = evalResult['isUser'].closureFn(jitUtils);
        const isUser = evalResult['isUser'].fn;
        expect(isUser({name: 'Karol', age: 30})).toBe(true);
        expect(isUser({name: 'Karol', age: '30'})).toBe(false);

        // guarantees cache in core package can be compiled
        // this contains any jit functions that are used by core package or mion packages
        const compiledCorePackage = compileTypeToJs<SrcCodeJITCompiledFnsCache>(jitFnsCache as any, compOpts, 'esm');
        expect(compiledCorePackage).toContain(esmExportPattern);
        const realEvalCode = compiledCorePackage.replace(esmExportPattern, '').trim();
        expect(() => eval(`(${realEvalCode})`)).not.toThrow();

        // console.log('compiledMock ESM:', compiledMock);
        // console.log('compiledCorePackage ESM:', compiledCorePackage);
    }

    function compileCacheCJS() {
        // Call the function under test
        const compiledMock = compileTypeToJs<SrcCodeJITCompiledFnsCache>(mockCache as any, compOpts, 'cjs');

        // Check that the file code contains the CJS export statement
        const cjsExportPattern = `module.exports = { ${compOpts.exportName}:`;
        expect(compiledMock).toContain(cjsExportPattern);
        // Extract the code part from: module.exports = { exportName: <code> };
        const startIndex = compiledMock.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const endIndex = compiledMock.lastIndexOf(' };');
        const evalCode = compiledMock.substring(startIndex, endIndex).trim();
        const evalResult = eval(`(${evalCode})`);
        evalResult['isUser'].fn = evalResult['isUser'].closureFn(jitUtils);
        const isUser = evalResult['isUser'].fn;
        expect(isUser({name: 'Karol', age: 30})).toBe(true);
        expect(isUser({name: 'Karol', age: '30'})).toBe(false);

        // guarantees cache in core package can be compiled
        // this contains any jit functions that are used by core package or mion packages
        const compiledCorePackage = compileTypeToJs<SrcCodeJITCompiledFnsCache>(jitFnsCache as any, compOpts, 'cjs');
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

    // Create a mock PureFunctionsCache
    const compOpts = {
        ...runTypeCompilerConstants,
        typeName: 'Pure functions',
        files: {
            jit: {path: '', module: 'esm'},
            pure: {path: '/test/path/pureFunctionsCache.esm.js', module: 'esm'},
        },
        opts: {isPureFnCode: true},
    } satisfies SrcCodeCompilerConstants;

    /** @reflection never */
    function pureFnWIthContext() {
        return function addNumbers(a: number, b: number) {
            return a + b;
        };
    }

    const compiledPureFn = registerPureFnClosure(pureFnWIthContext);
    const mockCache = {addNumbers: compiledPureFn};
    const {pureFnsCache} = getFnCaches();

    function compilePureESM() {
        // Call the function under test
        const compiledMock = compileTypeToJs<SrcCodePureFunctionsCache>(mockCache as any, compOpts, 'esm');
        // Check that the file code contains the export statement with the correct export name
        expect(compiledMock).toContain(`export const ${compOpts.exportName} =`);

        // Verify the code can be evaluated and contains our mock cache
        const evalCode = compiledMock.replace(`export const ${compOpts.exportName} =`, '');
        const evalResult = eval(`(${evalCode})`);
        evalResult['addNumbers'].fn = evalResult['addNumbers'].closureFn(jitUtils);
        expect(evalResult.addNumbers.fn(1, 2)).toBe(3);

        // guarantees (real cache) in core package can be compiled
        // this contains any pure functions that are used by core package or mion packages
        const compiledCorePackage = compileTypeToJs<SrcCodePureFunctionsCache>(pureFnsCache as any, compOpts, 'esm');
        expect(compiledCorePackage).toContain(`export const ${compOpts.exportName} =`);
        const realEvalCode = compiledCorePackage.replace(`export const ${compOpts.exportName} =`, '');
        expect(() => eval(`(${realEvalCode})`)).not.toThrow();

        // console.log('compiledMock ESM:', compiledMock);
        // console.log('compiledCorePackage ESM:', compiledCorePackage);
    }

    function compilePureCJS() {
        // Call the function under test
        const compiledMock = compileTypeToJs<SrcCodePureFunctionsCache>(mockCache as any, compOpts, 'cjs');

        // Check that the file code contains the CJS export statement
        const cjsExportPattern = `module.exports = { ${compOpts.exportName}:`;
        expect(compiledMock).toContain(cjsExportPattern);

        // Extract the code part from: module.exports = { exportName: <code> };
        const startIndex = compiledMock.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const endIndex = compiledMock.lastIndexOf(' };');
        const evalCode = compiledMock.substring(startIndex, endIndex).trim();
        const evalResult = eval(`(${evalCode})`);
        evalResult['addNumbers'].fn = evalResult['addNumbers'].closureFn(jitUtils);
        expect(evalResult.addNumbers.fn(1, 2)).toBe(3);

        // guarantees (real cache) in core package can be compiled
        const compiledCorePackage = compileTypeToJs<SrcCodePureFunctionsCache>(pureFnsCache as any, compOpts, 'cjs');
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

it('should compile router methods cache to code', () => {
    const originalCompile = process.env.MION_COMPILE;
    process.env.MION_COMPILE = 'true';
    // a real scenario would use compileAndWriteRouterMethods instead compileTypeToJs to persis to fileSystem

    type User = {name: string; age: number};
    const testRoutes = {
        getUser: route((ctx, name: string): User => ({name, age: 30})),
    } satisfies Routes;

    // Initialize router and register routes to create persisted methods
    initRouter();
    registerRoutes(testRoutes);

    // Verify that methods were persisted
    const persistedMethods = getPersistedMethods();
    const getUserMethodMetadata = persistedMethods.getUser;
    const mockCache = {getUser: getUserMethodMetadata};
    const expectedMethodData = {
        paramNames: ['name'],
        type: 1,
        id: 'getUser',
        pointer: ['getUser'],
        nestLevel: 0,
        options: {
            runOnError: false,
            hasReturnData: true,
            validateParams: true,
            deserializeParams: false,
            validateReturn: false,
            serializeReturn: false,
            isAsync: false,
        },
        paramsJitHashes: {
            isType: expect.any(String),
            typeErrors: expect.any(String),
            toJsonVal: expect.any(String),
            fromJsonVal: expect.any(String),
            jsonStringify: expect.any(String),
        },
        returnJitHashes: {
            isType: expect.any(String),
            typeErrors: expect.any(String),
            toJsonVal: expect.any(String),
            fromJsonVal: expect.any(String),
            jsonStringify: expect.any(String),
        },
    };

    const compOpts = {
        ...routerCompilerConstants,
        files: {
            jit: {path: '/test/path/routerMethodsCache.esm.js', module: 'esm'},
            pure: {path: '', module: 'esm'},
        },
        opts: {},
    } satisfies SrcCodeCompilerConstants;

    function compileRouterESM() {
        // Call the function under test
        const compiledMock = compileTypeToJs<MethodsCache>(mockCache as any, compOpts, 'esm');

        // Check that the file code contains the ESM export statement
        const esmExportPattern = `export const ${compOpts.exportName} =`;
        expect(compiledMock).toContain(esmExportPattern);
        const evalCode = compiledMock.replace(esmExportPattern, '').trim();
        const evalResult = eval(`(${evalCode})`);
        expect(evalResult.getUser).toEqual(expectedMethodData);

        // guarantees cache in core package can be compiled
        // this contains any router methods that are used by core package or mion packages
        const compiledCorePackage = compileTypeToJs<MethodsCache>(persistedMethods as any, compOpts, 'esm');
        expect(compiledCorePackage).toContain(esmExportPattern);
        const realEvalCode = compiledCorePackage.replace(esmExportPattern, '').trim();
        expect(() => eval(`(${realEvalCode})`)).not.toThrow();

        // console.log('compiledMock ESM:', compiledMock);
        // console.log('compiledCorePackage ESM:', compiledCorePackage);
    }

    function compileRouterCJS() {
        // Call the function under test
        const compiledMock = compileTypeToJs<MethodsCache>(mockCache as any, compOpts, 'cjs');

        // Check that the file code contains the CJS export statement
        const cjsExportPattern = `module.exports = { ${compOpts.exportName}:`;
        expect(compiledMock).toContain(cjsExportPattern);
        // Extract the code part from: module.exports = { exportName: <code> };
        const startIndex = compiledMock.indexOf(cjsExportPattern) + cjsExportPattern.length;
        const endIndex = compiledMock.lastIndexOf(' };');
        const evalCode = compiledMock.substring(startIndex, endIndex).trim();
        const evalResult = eval(`(${evalCode})`);
        expect(evalResult.getUser).toEqual(expectedMethodData);

        // guarantees cache in core package can be compiled
        const compiledCorePackage = compileTypeToJs<MethodsCache>(persistedMethods as any, compOpts, 'cjs');
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
