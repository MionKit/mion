/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitCompiledFunctions, JitFunctionsHashes} from '@mionkit/core';
import {
    memorize,
    compileAndWriteJitFunctions,
    compileAndWritePureFunctions,
    compileAndWriteRunType,
    SrcCodeCompilerConstants,
    compileTypeToJs,
} from '@mionkit/run-types';
import {NonRawMethod, MethodData} from '../types/remoteMethods';
import {AnyHandler} from '../types/handlers';
import {IS_TEST_ENV} from '../constants';
import {getFnCaches, jitUtils} from '@mionkit/core';
import {getENV} from '@mionkit/core';
import {rΦutεs} from '../_autogen/routes'; // inception 🔁

export type PersistedMethods = Record<string, MethodData>;
let persistedMethods: PersistedMethods = rΦutεs;

export const routerCompilerConstants = {
    autoGenMessage: `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\n// NOTE exported constant name must be 'rΦutεs' and file can not contain any other code\n`,
    exportName: 'rΦutεs',
    typeName: 'Routes',
} as const;

// ############# PUBLIC METHODS #############

export function addToPersistedMethods(id: string, method: NonRawMethod) {
    if (!shouldCompile() || !!persistedMethods[id]) return;
    persistedMethods[id] = method;
}

export function getPersistedMethod(id: string, handler: AnyHandler): NonRawMethod | undefined {
    const method = persistedMethods?.[id];
    if (!method) return;
    return restorePersistedMethod(method, handler);
}

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

export function getPersistedMethods(): Readonly<PersistedMethods> {
    return persistedMethods;
}

export function setPersistedMethods(newCompiled: PersistedMethods) {
    persistedMethods = newCompiled;
}

export function resetPersistedMethods() {
    persistedMethods = rΦutεs;
}

function restorePersistedMethod(method: MethodData, handler: AnyHandler): NonRawMethod {
    const restored = method as any as NonRawMethod;
    if (restored.paramsJitFns && restored.returnJitFns && restored.paramNames && !!restored.handler)
        return method as NonRawMethod;
    restored.handler = handler;
    restored.paramsJitFns = restorePersistedJitFunctions(method.paramsJitHashes);
    restored.returnJitFns = restorePersistedJitFunctions(method.returnJitHashes);
    if (IS_TEST_ENV) (restored as any).isRestored = true;
    return restored;
}

function restorePersistedJitFunctions(jitFns: JitFunctionsHashes): JitCompiledFunctions {
    const isType = jitUtils.getJIT(jitFns.isType);
    const typeErrors = jitUtils.getJIT(jitFns.typeErrors);
    const toJsonVal = jitUtils.getJIT(jitFns.toJsonVal);
    const fromJsonVal = jitUtils.getJIT(jitFns.fromJsonVal);
    const jsonStringify = jitUtils.getJIT(jitFns.jsonStringify);
    if (!isType || !typeErrors || !toJsonVal || !fromJsonVal || !jsonStringify) {
        throw new Error(`Can't restore persisted JIT functions, some jit functions are missing: ${JSON.stringify(jitFns)}`);
    }
    return {isType, typeErrors, toJsonVal, fromJsonVal, jsonStringify};
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

const shouldCompile = memorize(() => getENV('MION_COMPILE') === 'true');
