import {
    SrcCodeCompilerConstants,
    compileAndWriteJitFunctions,
    compileAndWritePureFunctions,
    compileAndWriteRunType,
    compileTypeToJs,
} from './cacheCompiler';
import {PersistedMethods, persistedMethods} from '@mionkit/router';
import {getENV, getFnCaches} from '@mionkit/core';

const IS_TEST_ENV = getENV('NODE_ENV') === 'test';

export const routerCompilerConstants = {
    autoGenMessage: `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\n// NOTE exported constant name must be 'rΦutεs' and file can not contain any other code\n`,
    exportName: 'rΦutεs',
    typeName: 'Routes',
} as const;

export function codifyMethods(compiled: PersistedMethods = persistedMethods, moduleType: 'cjs' | 'esm' = 'esm'): string {
    const constants = {
        ...routerCompilerConstants,
        files: {
            jit: {path: '', module: moduleType},
            pure: {path: '', module: moduleType},
        },
    } satisfies SrcCodeCompilerConstants;
    const code = compileTypeToJs<PersistedMethods>(compiled, constants, moduleType);
    return code;
}
export function compileRouter() {
    const aux = getENV('MION_COMPILE');
    if (typeof process !== 'undefined' && process.env) {
        process.env.MION_COMPILE = 'true';
    }

    // Define file paths for compilation
    const routesCjsFile = './dist/cjs/_autogen/routes.js';
    const routesEsmFile = './dist/esm/_autogen/routes.mjs';
    const jitCjsFile = './dist/cjs/_autogen/jitFunctionsCache.js';
    const jitEsmFile = './dist/esm/_autogen/jitFunctionsCache.mjs';
    const pureCjsFile = './dist/cjs/_autogen/pureFunctionsCache.js';
    const pureEsmFile = './dist/esm/_autogen/pureFunctionsCache.mjs';

    if (!IS_TEST_ENV) {
        console.log('Writing compiled methods...');

        // Compile routes to both CJS and ESM
        compileAndWriteRunType<PersistedMethods>(persistedMethods, {
            ...routerCompilerConstants,
            files: {jit: {path: routesCjsFile, module: 'cjs'}, pure: {path: '', module: 'cjs'}},
        });
        compileAndWriteRunType<PersistedMethods>(persistedMethods, {
            ...routerCompilerConstants,
            files: {jit: {path: routesEsmFile, module: 'esm'}, pure: {path: '', module: 'esm'}},
        });
        console.log(`Compiled methods written to ${routesCjsFile} and ${routesEsmFile}.`);

        const {jitFnsCache, pureFnsCache} = getFnCaches();

        // Compile JIT functions to both CJS and ESM
        compileAndWriteJitFunctions(jitFnsCache, {
            jit: {path: jitCjsFile, module: 'cjs'},
            pure: {path: '', module: 'cjs'},
        });
        compileAndWriteJitFunctions(jitFnsCache, {
            jit: {path: jitEsmFile, module: 'esm'},
            pure: {path: '', module: 'esm'},
        });
        console.log(`Compiled JIT functions written to ${jitCjsFile} and ${jitEsmFile}.`);

        // Compile pure functions to both CJS and ESM
        compileAndWritePureFunctions(pureFnsCache, {
            jit: {path: '', module: 'cjs'},
            pure: {path: pureCjsFile, module: 'cjs'},
        });
        compileAndWritePureFunctions(pureFnsCache, {
            jit: {path: '', module: 'esm'},
            pure: {path: pureEsmFile, module: 'esm'},
        });
        console.log(`Compiled pure functions written to ${pureCjsFile} and ${pureEsmFile}.`);
    } else {
        // For tests, just compile to ESM format
        compileAndWriteRunType<PersistedMethods>(persistedMethods, {
            ...routerCompilerConstants,
            files: {jit: {path: routesEsmFile, module: 'esm'}, pure: {path: '', module: 'esm'}},
        });
        const {jitFnsCache, pureFnsCache} = getFnCaches();
        compileAndWriteJitFunctions(jitFnsCache, {
            jit: {path: jitEsmFile, module: 'esm'},
            pure: {path: '', module: 'esm'},
        });
        compileAndWritePureFunctions(pureFnsCache, {
            jit: {path: '', module: 'esm'},
            pure: {path: pureEsmFile, module: 'esm'},
        });
    }

    if (typeof process !== 'undefined' && process.env) {
        process.env.MION_COMPILE = aux;
    }
}
