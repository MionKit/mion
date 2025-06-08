/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {compileTypeToJs, compilerConstants, findJSFile} from './cacheCompiler';
import {
    JitCompiledFn,
    CompiledPureFunction,
    SrcCodeJITCompiledFnsCache,
    SrcCodePureFunctionsCache,
} from '@mionkit/core/src/types';
import {JitFunctions} from '../constants';
import {cΦmpilεdCachε as jitFnsCache} from '@mionkit/core/src/_autogen/jitFunctionsCache';
import {cΦmpilεdCachε as pureFnsCache} from '@mionkit/core/src/_autogen/pureFunctionsCache';
import {jitUtils} from '@mionkit/core/src/jitUtils';
import {existsSync, mkdirSync, unlinkSync, writeFileSync} from 'fs';
import {join} from 'path';

it('should compile JIT functions cache to code', () => {
    // Create a mock JitFunctionsCache
    const mockCache = {};

    // Add a mock JIT function to the cache
    const mockJitFn: JitCompiledFn = {
        fnID: JitFunctions.isType.id,
        jitFnHash: 'sayHello',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return typeof v === "string";',
        dependenciesSet: new Set<string>(),
        pureFnDependencies: new Set<string>(),
        fn: (name: string) => 'Hello ' + name,
        closureFn: (utl) => (name: string) => 'Hello ' + name,
    };
    mockCache['sayHello'] = mockJitFn;

    // Call the function under test
    const result = compileTypeToJs<SrcCodeJITCompiledFnsCache>(mockCache);
    result.replace(compilerConstants.autoGenMessage, ''); // removes unnecessary comments
    // Check that the file code contains the export statement with the correct export name
    expect(result).toContain(`export const ${compilerConstants.exportName} =`);
    const evalCode = result.replace(`export const ${compilerConstants.exportName} =`, '');
    const evalResult = eval(`(${evalCode})`);
    evalResult['sayHello'].fn = evalResult['sayHello'].closureFn(jitUtils);
    expect(evalResult['sayHello'].fn('Karol')).toBe('Hello Karol');

    // guarantees real cache can be compiled
    const realCache = compileTypeToJs<SrcCodeJITCompiledFnsCache>(jitFnsCache);
    realCache.replace(compilerConstants.autoGenMessage, ''); // removes unnecessary comment

    expect(realCache).toContain(`export const ${compilerConstants.exportName} =`);
    const realEvalCode = realCache.replace(`export const ${compilerConstants.exportName} =`, '');
    expect(() => eval(`(${realEvalCode})`)).not.toThrow();
});

it('should compile pure functions cache to code', () => {
    // Create a mock PureFunctionsCache
    const mockCache = {};

    // Add a mock pure function to the cache
    const mockPureFn: CompiledPureFunction = {
        closureFn: (jitUtils) => (a: number, b: number) => a + b,
        fn: (a: number, b: number) => a + b,
        paramNames: ['a', 'b'],
        code: 'return a + b;',
        fnHash: 'addNumbers',
        dependencies: new Set<string>(),
    };
    mockCache['addNumbers'] = mockPureFn;

    // Call the function under test
    const result = compileTypeToJs<SrcCodePureFunctionsCache>(mockCache);
    result.replace(compilerConstants.autoGenMessage, ''); // removes unnecessary comment

    // Check that the file code contains the export statement with the correct export name
    expect(result).toContain(`export const ${compilerConstants.exportName} =`);

    // Verify the code can be evaluated and contains our mock cache
    const evalCode = result.replace(`export const ${compilerConstants.exportName} =`, '');
    const evalResult = eval(`(${evalCode})`);
    evalResult['addNumbers'].fn = evalResult['addNumbers'].closureFn(jitUtils);
    expect(evalResult.addNumbers.fn(1, 2)).toBe(3);

    // guarantees real cache can be compiled
    const realCache = compileTypeToJs<SrcCodePureFunctionsCache>(pureFnsCache);
    realCache.replace(compilerConstants.autoGenMessage, ''); // removes unnecessary comment

    expect(realCache).toContain(`export const ${compilerConstants.exportName} =`);
    const realEvalCode = realCache.replace(`export const ${compilerConstants.exportName} =`, '');
    expect(() => eval(`(${realEvalCode})`)).not.toThrow();
});

function createDirAndWriteFile(dir: string, file: string) {
    if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
    const filePath = join(dir, file);
    writeFileSync(filePath, 'export const cΦmpilεdCachε = {};\n', 'utf8');
}

function deleteFile(dir: string, file: string) {
    const filePath = join(dir, file);
    if (existsSync(filePath)) {
        unlinkSync(filePath);
    }
}

it('should find .dist files in @mionkit/core package', () => {
    // compileAndWriteJitFunctions and compileAndWritePureFunctions work only after code gets compiled
    // for testing lets find fe files in the core package as test
    const dirCjs = join(__dirname, '../../../core/dist/cjs/_autogen');
    const dirEsm = join(__dirname, '../../../core/dist/esm/_autogen');
    const filesCjs = ['jitFunctionsCache.js', 'pureFunctionsCache.js'];
    const filesEsm = ['jitFunctionsCache.mjs', 'pureFunctionsCache.mjs'];

    filesCjs.forEach((file) => createDirAndWriteFile(dirCjs, file));
    filesEsm.forEach((file) => createDirAndWriteFile(dirEsm, file));

    const packageName = '@mionkit/core';
    const files = [
        './dist/cjs/_autogen/jitFunctionsCache',
        './dist/cjs/_autogen/pureFunctionsCache',
        './dist/esm/_autogen/jitFunctionsCache',
        './dist/esm/_autogen/pureFunctionsCache',
    ];
    const fullFileNames = files.map((file) => findJSFile(packageName, file)) as string[];
    expect(fullFileNames.every(Boolean)).toBe(true);

    filesCjs.forEach((file) => deleteFile(dirCjs, file));
    filesEsm.forEach((file) => deleteFile(dirEsm, file));
});
