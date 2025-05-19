/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {compileTypeToJs, compilerConstants, findJSFile} from './compiler';
import {
    JitCompiledFn,
    CompiledPureFunction,
    SrcCodeJITCompiledFnsCache,
    SrcCodePureFunctionsCache,
} from '@mionkit/core/src/types';
import {JitFunctions} from '../constants';
import {cΦmpilεd as jitFnsCache} from '@mionkit/core/src/compiled/jitFunctionsCache';
import {cΦmpilεd as pureFnsCache} from '@mionkit/core/src/compiled/pureFunctionsCache';
import {jitUtils} from '@mionkit/core/src/jitUtils';

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
        body: 'return a + b;',
        name: 'addNumbers',
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

it('should find .dist files in @mionkit/core package', () => {
    const fullFileNames = compilerConstants.jitFunctionsFiles.map((file) =>
        findJSFile(compilerConstants.corePackageName, file)
    ) as string[];
    expect(fullFileNames.every(Boolean)).toBe(true);
});
