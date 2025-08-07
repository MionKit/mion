/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitCompiledFunctions, JitFunctionsHashes} from '@mionkit/core/src/types';
import {memorize} from '@mionkit/run-types/src/lib/utils';
import {
    compileAndWriteJitFunctions,
    compileAndWritePureFunctions,
    compileAndWriteRunType,
    SrcCodeCompilerConstants,
    runTypeCompilerConstants,
    compileTypeToJs,
} from '@mionkit/run-types/src/persist/jitFnCacheCompiler';
import {NonRawMethod, MethodData} from './types/remoteMethods';
import {AnyHandler} from './types/handlers';
import {IS_TEST_ENV} from './constants';
import {getFnCaches, jitUtils} from '@mionkit/core/src/jitUtils';
import {getENV} from '@mionkit/core/src/utils';
import {rΦutεs} from './_autogen/routes'; // inception 🔁

export type PersistedMethods = Record<string, MethodData>;
let persistedMethods: PersistedMethods = rΦutεs;

export const routerCompilerConstants = {
    autoGenMessage: `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\n// NOTE exported constant name must be 'rΦutεs' and file can not contain any other code\n`,
    exportName: 'rΦutεs',
    packageName: '@mionkit/router',
    files: [`./dist/cjs/_autogen/routes`, `./dist/esm/_autogen/routes`],
    jsFilesExtensions: ['.js', '.mjs', '.cjs', '.jsx'],
    typeName: 'Routes',
} as const satisfies SrcCodeCompilerConstants;

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

export function codifyMethods(compiled: PersistedMethods = persistedMethods, constants = routerCompilerConstants): string {
    const code = compileTypeToJs<PersistedMethods>(compiled, constants);
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
    if (!IS_TEST_ENV) console.log('Writing compiled methods...');
    compileAndWriteRunType<PersistedMethods>(persistedMethods, routerCompilerConstants);
    if (!IS_TEST_ENV) console.log(`Compiled methods written to ${routerCompilerConstants.files}.`);
    const {jitFnsCache, pureFnsCache} = getFnCaches();
    compileAndWriteJitFunctions(jitFnsCache);
    if (!IS_TEST_ENV) console.log(`Compiled JIT functions written to ${runTypeCompilerConstants.jitFunctionsFiles}.`);
    compileAndWritePureFunctions(pureFnsCache);
    if (!IS_TEST_ENV) console.log(`Compiled pure functions written to ${runTypeCompilerConstants.pureFunctionsFiles}.`);
    if (typeof process !== 'undefined' && process.env) {
        process.env.MION_COMPILE = aux;
    }
}

const shouldCompile = memorize(() => getENV('MION_COMPILE') === 'true');
