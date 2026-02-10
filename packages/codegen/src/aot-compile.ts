/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resolve, join, dirname} from 'path';
import {existsSync, cpSync} from 'fs';
import {compileAndWriteJitFunctions, compileAndWritePureFunctions, compileAndWriteRouterMethods} from './cacheCompiler';
import {getJitFnCaches, getJitUtils, JitFunctionsCache, PureFunctionsCache, routesCache} from '@mionkit/core';
import {getPersistedMethods} from '@mionkit/router';
import {isTest} from './constants';
import {JitFnID, JitFunctions} from '@mionkit/run-types';

export interface CacheData {
    jitFnsCache: Record<string, any>;
    pureFnsCache: Record<string, any>;
    routerCache: Record<string, any>;
}

export interface AOTCompileOptions {
    startScriptPath: string;
    aotDir: string;
    /** Path to the mion-aot-template directory */
    templateDir: string;
}

export const EXCLUDED_FNS: JitFnID[] = [JitFunctions.toJSCode.id];
export const EXCLUDED_PURE_FNS: string[] = ['sanitizeCompiledFn'];

/**
 * Reset cache files by copying original template files to the target AOT directory.
 * This ensures a clean slate before each compilation run.
 */
function resetCacheFiles(templateDir: string, aotDir: string): void {
    const moduleFormats = ['cjs', 'esm'] as const;

    for (const moduleFormat of moduleFormats) {
        const templateBuildDir = join(templateDir, 'build', moduleFormat, 'src');
        const targetBuildDir = join(aotDir, 'build', moduleFormat, 'src');

        if (!existsSync(templateBuildDir)) {
            throw new Error(`Template build directory not found: ${templateBuildDir}`);
        }

        if (!existsSync(targetBuildDir)) {
            throw new Error(`Target build directory not found: ${targetBuildDir}. Run 'mion-init-aot' first.`);
        }

        // Copy all files from template to target, overwriting existing files
        cpSync(templateBuildDir, targetBuildDir, {recursive: true});
    }
}

/**
 * Register ts-node to allow importing TypeScript files at runtime.
 * Looks for tsconfig.json in the script's directory or parent directories.
 */
function registerTsNode(scriptPath: string): void {
    const scriptDir = dirname(scriptPath);

    // Look for tsconfig.json starting from script directory
    let tsconfigPath: string | undefined;
    let currentDir = scriptDir;

    while (currentDir !== dirname(currentDir)) {
        const candidate = join(currentDir, 'tsconfig.json');
        if (existsSync(candidate)) {
            tsconfigPath = candidate;
            break;
        }
        currentDir = dirname(currentDir);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tsNode = require('ts-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('tsconfig-paths/register');

    tsNode.register({
        project: tsconfigPath,
        transpileOnly: true,
        compilerOptions: {
            module: 'commonjs',
        },
    });
}

/**
 * AOT Compilation Function
 *
 * This function is executed as part of the AOT build process.
 * It runs the user's start script with MION_COMPILE=true to populate caches,
 * then compiles and writes those caches to the AOT package files.
 */
export async function compileAOT(
    options: AOTCompileOptions,
    excludedFns: JitFnID[] = EXCLUDED_FNS,
    excludedPureFns: string[] = EXCLUDED_PURE_FNS
): Promise<void> {
    const {startScriptPath, aotDir, templateDir} = options;

    const resolvedStartScript = resolve(startScriptPath);
    const isTypeScript = resolvedStartScript.endsWith('.ts') || resolvedStartScript.endsWith('.tsx');

    if (!isTest) {
        console.log(`AOT Compilation starting...`);
        console.log(`Start script: ${resolvedStartScript}`);
        console.log(`AOT directory: ${aotDir}`);
        if (isTypeScript) {
            console.log(`TypeScript file detected, using ts-node...`);
        }
    }

    // Reset cache files to original template state before compilation
    if (!isTest) {
        console.log('Resetting cache files to original template state...');
    }
    resetCacheFiles(templateDir, aotDir);
    // Register ts-node for TypeScript files
    if (isTypeScript) {
        registerTsNode(resolvedStartScript);
    }
    // Set compilation mode
    process.env.MION_COMPILE = 'true';
    enableCompileTracking();
    if (!isTest) console.log('Running start script to populate caches...');
    // Import and run the original start script (only dynamic import needed)
    try {
        const module = await import(resolvedStartScript);
        // If the module exports a promise (e.g., testApiPromise from async initMionRouter),
        // we need to await it to ensure the router is fully initialized
        const promiseExports = Object.values(module).filter((value): value is Promise<unknown> => value instanceof Promise);
        if (promiseExports.length > 0) {
            await Promise.all(promiseExports);
        }
        if (!isTest) console.log('Start script completed, caches populated');
    } catch (error) {
        console.error('Error running start script:', (error as Error).message);
        throw error;
    }
    if (!isTest) console.log('Compiling and writing AOT caches...');
    // Get the populated caches
    const {jitFnsCache, pureFnsCache} = getJitFnCaches();
    const routerCache = getPersistedMethods();
    // Write the caches to files
    writeAOTCachesToFiles({jitFnsCache, pureFnsCache, routerCache}, aotDir, excludedFns, excludedPureFns);
    if (!isTest) {
        console.log('✅ AOT compilation completed successfully!');
        console.log(`
Cache files updated in both CJS and ESM formats:
  - ${join(aotDir, 'build', 'cjs', '*.cache.js')}
  - ${join(aotDir, 'build', 'esm', '*.cache.js')}
`);
    }
}

export interface Cacheable {
    _used?: boolean;
}

let compileTrackingEnabled = false;
let originalJitUtilsBackup: Record<string, any> | null = null;
let originalRoutesCacheBackup: Record<string, any> | null = null;

/** Reset compile tracking state - for testing purposes only */
export function resetCompileTracking(): void {
    if (originalJitUtilsBackup) {
        const jitUtils = getJitUtils();
        Object.assign(jitUtils, originalJitUtilsBackup);
        originalJitUtilsBackup = null;
    }
    if (originalRoutesCacheBackup) {
        Object.assign(routesCache, originalRoutesCacheBackup);
        originalRoutesCacheBackup = null;
    }
    compileTrackingEnabled = false;
}

function enableCompileTracking(): void {
    // Prevent double-wrapping when compileAOT is called multiple times
    if (compileTrackingEnabled) return;
    compileTrackingEnabled = true;

    const jitUtils = getJitUtils();
    originalJitUtilsBackup = {
        addToJitCache: jitUtils.addToJitCache,
        addPureFn: jitUtils.addPureFn,
        getJIT: jitUtils.getJIT,
        getJitFn: jitUtils.getJitFn,
        getPureFn: jitUtils.getPureFn,
        getCompiledPureFn: jitUtils.getCompiledPureFn,
        usePureFn: jitUtils.usePureFn,
    };
    const originalJitUtils = originalJitUtilsBackup;

    jitUtils.addToJitCache = (comp) => {
        (comp as Cacheable)._used = true;
        originalJitUtils.addToJitCache(comp);
    };
    jitUtils.addPureFn = (namespace, compiledFn) => {
        (compiledFn as Cacheable)._used = true;
        return originalJitUtils.addPureFn(namespace, compiledFn);
    };
    jitUtils.getJIT = (jitFnHash) => {
        const comp = originalJitUtils.getJIT(jitFnHash);
        if (comp) (comp as Cacheable)._used = true;
        return comp;
    };
    jitUtils.getJitFn = (jitFnHash) => {
        const comp = originalJitUtils.getJIT(jitFnHash);
        if (comp) (comp as Cacheable)._used = true;
        return originalJitUtils.getJitFn(jitFnHash);
    };
    jitUtils.getPureFn = (namespace, fnHash) => {
        const compiled = originalJitUtils.getCompiledPureFn(namespace, fnHash);
        if (!compiled) return;
        (compiled as Cacheable)._used = true;
        return originalJitUtils.getPureFn(namespace, fnHash);
    };
    jitUtils.getCompiledPureFn = (namespace, fnHash) => {
        const compiled = originalJitUtils.getCompiledPureFn(namespace, fnHash);
        if (compiled) (compiled as Cacheable)._used = true;
        return compiled;
    };
    jitUtils.usePureFn = (namespace, fnHash) => {
        const compiled = originalJitUtils.getCompiledPureFn(namespace, fnHash);
        if (compiled) (compiled as Cacheable)._used = true;
        return originalJitUtils.usePureFn(namespace, fnHash);
    };

    originalRoutesCacheBackup = {
        getMetadata: routesCache.getMetadata,
        getMethodJitFns: routesCache.getMethodJitFns,
        setMetadata: routesCache.setMetadata,
        setMethodJitFns: routesCache.setMethodJitFns,
    };
    const originalRoutesCache = originalRoutesCacheBackup;

    routesCache.getMetadata = (id) => {
        const metadata = originalRoutesCache.getMetadata(id);
        if (metadata) metadata._used = true;
        return metadata;
    };
    routesCache.getMethodJitFns = (id) => {
        const method = originalRoutesCache.getMethodJitFns(id);
        if (method) method._used = true;
        return method;
    };
    routesCache.setMetadata = (id, methodData) => {
        (methodData as Cacheable)._used = true;
        originalRoutesCache.setMetadata(id, methodData);
    };
    routesCache.setMethodJitFns = (id, method) => {
        (method as Cacheable)._used = true;
        originalRoutesCache.setMethodJitFns(id, method);
    };
}

/**
 * Write cache data to AOT package files
 * Separated from compileAOT for testing purposes
 */
export function writeAOTCachesToFiles(
    cacheData: CacheData,
    aotDir: string,
    excludedFns: JitFnID[] = EXCLUDED_FNS,
    excludedPureFns: string[] = EXCLUDED_PURE_FNS
): void {
    const {jitFnsCache, pureFnsCache, routerCache} = cacheData;
    const filteredJitFnsCache = filterJitFns(filterUsedJitFns(jitFnsCache), excludedFns);
    const filteredPureFnsCache = filterPureFns(filterUsedPureFns(pureFnsCache), excludedPureFns);
    const filteredRouterCache = filterUsedRouterCache(routerCache);

    // Write to both CJS and ESM builds
    const moduleFormats = ['cjs', 'esm'] as const;

    for (const moduleFormat of moduleFormats) {
        if (!isTest) {
            console.log(`Writing ${moduleFormat.toUpperCase()} cache files...`);
        }

        const buildDir = join(aotDir, 'build', moduleFormat, 'src');

        // Create AOT configuration for this module format
        const aotConfig = {
            module: moduleFormat,
            caches: {
                router: {
                    path: join(buildDir, 'router.cache.js'),
                    exportName: 'routerCache',
                },
                jit: {
                    path: join(buildDir, 'jitFns.cache.js'),
                    exportName: 'jitFnsCache',
                },
                pure: {
                    path: join(buildDir, 'pureFns.cache.js'),
                    exportName: 'pureFnsCache',
                },
            },
        };

        if (!isTest) {
            console.log(`Writing JIT functions cache (${moduleFormat})...`);
        }
        compileAndWriteJitFunctions(filteredJitFnsCache, aotConfig);

        if (!isTest) {
            console.log(`Writing pure functions cache (${moduleFormat})...`);
        }
        compileAndWritePureFunctions(filteredPureFnsCache, aotConfig);

        if (!isTest) {
            console.log(`Writing router methods cache (${moduleFormat})...`);
        }
        compileAndWriteRouterMethods(filteredRouterCache, aotConfig);
    }
}

export function filterUsedJitFns(jitFnsCache: JitFunctionsCache): JitFunctionsCache {
    return Object.fromEntries(
        Object.entries(jitFnsCache)
            .filter(([, value]) => (value as Cacheable)._used === true)
            .map(([key, value]) => [key, {...value, _used: undefined}])
    ) as JitFunctionsCache;
}

export function filterUsedPureFns(pureFnsCache: PureFunctionsCache): PureFunctionsCache {
    return Object.fromEntries(
        Object.entries(pureFnsCache).map(([namespace, nsCache]) => [
            namespace,
            Object.fromEntries(
                Object.entries(nsCache)
                    .filter(([, value]) => (value as Cacheable)._used === true)
                    .map(([key, value]) => [key, {...value, _used: undefined}])
            ),
        ])
    ) as PureFunctionsCache;
}

export function filterUsedRouterCache(routerCache: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
        Object.entries(routerCache)
            .filter(([, value]) => (value as Cacheable)?._used === true)
            .map(([key, value]) => [key, {...value, _used: undefined}])
    );
}

export function filterJitFns(jitFnsCache: JitFunctionsCache, excludedFns: JitFnID[] = EXCLUDED_FNS) {
    if (!excludedFns.length) return jitFnsCache;
    return Object.fromEntries(
        Object.entries(jitFnsCache).filter(([, value]) => !excludedFns.includes(value.fnID as JitFnID))
    ) as JitFunctionsCache;
}

export function filterPureFns(pureFnsCache: PureFunctionsCache, excludedPureFns: string[] = EXCLUDED_PURE_FNS) {
    if (!excludedPureFns.length) return pureFnsCache;
    return Object.fromEntries(
        Object.entries(pureFnsCache).map(([namespace, nsCache]) => [
            namespace,
            Object.fromEntries(Object.entries(nsCache).filter(([, value]) => !excludedPureFns.includes(value.pureFnHash))),
        ])
    ) as PureFunctionsCache;
}
