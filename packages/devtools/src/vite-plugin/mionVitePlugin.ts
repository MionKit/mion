/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Plugin} from 'vite';
import {readFileSync, readdirSync, statSync} from 'fs';
import {join, resolve} from 'path';
import {createDeepkitTransform} from './deepkit-type.ts';
import {ServerPureFunctionsPluginOptions, ExtractedPureFn, DeepkitTypeOptions, AOTCacheOptions} from './types.ts';
import {extractPureFnsFromSource} from './extractPureFn.ts';
import {generateVirtualModule} from './virtualModule.ts';
import {
    VIRTUAL_MODULE_ID,
    RESOLVED_VIRTUAL_MODULE_ID,
    VIRTUAL_AOT_JIT_FNS,
    VIRTUAL_AOT_PURE_FNS,
    VIRTUAL_AOT_ROUTER_CACHE,
    VIRTUAL_AOT_CACHES,
    RESOLVED_AOT_JIT_FNS,
    RESOLVED_AOT_PURE_FNS,
    RESOLVED_AOT_ROUTER_CACHE,
    RESOLVED_AOT_CACHES,
} from './constants.ts';
import {
    generateAOTCaches,
    logAOTCaches,
    generateJitFnsModule,
    generatePureFnsModule,
    generateRouterCacheModule,
    generateCombinedCachesModule,
    generateNoopModule,
    generateNoopCombinedModule,
    AOTCacheData,
} from './aotCacheGenerator.ts';
import {getOrGenerateAOTCaches, updateDiskCache, resolveCacheDir} from './aotDiskCache.ts';

export interface MionPluginOptions {
    /** Options for pure function extraction - omit to disable */
    serverPureFunctions?: ServerPureFunctionsPluginOptions;
    /** Options for deepkit type transformation - omit to disable */
    runTypes?: DeepkitTypeOptions;
    /** Options for AOT cache generation - omit to disable */
    aotCaches?: AOTCacheOptions;
}

/** Scans the client source directory and extracts all pure functions */
function scanClientSource(options: ServerPureFunctionsPluginOptions): ExtractedPureFn[] {
    const include = options.include || ['**/*.ts', '**/*.tsx'];
    const exclude = options.exclude || ['**/node_modules/**', '**/.dist/**', '**/dist/**'];
    const clientSrcPath = resolve(options.clientSrcPath);
    const fns: ExtractedPureFn[] = [];

    function scanDir(dir: string) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                // Skip excluded directories
                if (!isIncluded(fullPath + '/', include, exclude)) continue;
                scanDir(fullPath);
            } else if (stat.isFile()) {
                // Only process included files
                if (!isIncluded(fullPath, include, exclude)) continue;

                try {
                    const code = readFileSync(fullPath, 'utf-8');
                    // Quick check: does this file contain pureServerFn?
                    if (!code.includes('pureServerFn')) continue;

                    const extracted = extractPureFnsFromSource(code, fullPath);
                    fns.push(...extracted);
                } catch (err: any) {
                    // Log but don't fail - some files might not be parseable
                    console.warn(`[mion-pure-functions] Warning: Could not parse ${fullPath}: ${err.message}`);
                }
            }
        }
    }

    scanDir(clientSrcPath);
    return fns;
}

/** Checks if a file path matches the include/exclude patterns */
function isIncluded(filePath: string, include: string[], exclude: string[]): boolean {
    // Simple pattern matching - check file extension
    const isTs = /\.(ts|tsx|js|jsx)$/.test(filePath);
    const isDir = filePath.endsWith('/');
    if (!isTs && !isDir) return false;

    // Check exclude patterns
    for (const pattern of exclude) {
        if (matchGlob(filePath, pattern)) return false;
    }

    return true;
}

/** Simple glob matching for common patterns */
function matchGlob(filePath: string, pattern: string): boolean {
    // Handle **/ prefix
    if (pattern.startsWith('**/')) {
        const suffix = pattern.slice(3);
        return filePath.includes(suffix.replace(/\*/g, ''));
    }
    // Handle simple wildcard
    const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
    return regex.test(filePath);
}

/**
 * Creates the unified mion Vite plugin.
 * This plugin combines pure function extraction, deepkit type transformation,
 * and AOT cache generation in a single plugin with correct execution order.
 *
 * Execution order:
 * 1. Extract pure functions from original TypeScript source
 * 2. Apply deepkit type transformations to the code
 *
 * This ensures pure function extraction happens on clean, untransformed TypeScript.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import {mionPlugin} from '@mionkit/devtools/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     mionPlugin({
 *       runTypes: {
 *         tsConfig: './tsconfig.json',
 *       },
 *       pureFunctions: {
 *         clientSrcPath: '../client/src',
 *       },
 *       aotCaches: {
 *         startServerScript: '../server/src/init.ts',
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function mionVitePlugin(options: MionPluginOptions): Plugin {
    let extractedFns: ExtractedPureFn[] | null = null;
    const pureFnOptions = options.serverPureFunctions;
    const deepkitOptions = options.runTypes;
    const aotOptions = options.aotCaches;
    const deepkitTransform = deepkitOptions ? createDeepkitTransform(deepkitOptions) : null;

    // AOT cache data - populated during buildStart if AOT is enabled
    let aotData: AOTCacheData | null = null;
    let aotGenerationPromise: Promise<AOTCacheData> | null = null;

    // Resolved cache directory from Vite's config — set in configResolved
    let aotCacheDir = '';

    return {
        name: 'mion',
        enforce: 'pre',

        configResolved(config) {
            if (aotOptions) {
                aotCacheDir = resolveCacheDir(aotOptions, config.cacheDir);
            }
        },

        async buildStart() {
            // Generate AOT caches if enabled
            if (aotOptions) {
                try {
                    console.log('[mion] Generating AOT caches...');
                    aotGenerationPromise = getOrGenerateAOTCaches(aotOptions, aotCacheDir);
                    aotData = await aotGenerationPromise;
                    console.log('[mion] AOT caches generated successfully');
                    logAOTCaches(aotData);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    throw new Error(`[mion] Failed to generate AOT caches: ${message}`);
                }
            }
        },

        resolveId(id) {
            // Pure functions virtual module
            if (pureFnOptions && id === VIRTUAL_MODULE_ID) {
                return RESOLVED_VIRTUAL_MODULE_ID;
            }

            // AOT virtual modules
            if (id === VIRTUAL_AOT_JIT_FNS) return RESOLVED_AOT_JIT_FNS;
            if (id === VIRTUAL_AOT_PURE_FNS) return RESOLVED_AOT_PURE_FNS;
            if (id === VIRTUAL_AOT_ROUTER_CACHE) return RESOLVED_AOT_ROUTER_CACHE;
            if (id === VIRTUAL_AOT_CACHES) return RESOLVED_AOT_CACHES;

            return null;
        },

        load(id) {
            // Pure functions virtual module
            if (pureFnOptions && id === RESOLVED_VIRTUAL_MODULE_ID) {
                // Lazily scan client source on first load
                if (!extractedFns) {
                    extractedFns = scanClientSource(pureFnOptions);
                }
                return generateVirtualModule(extractedFns);
            }

            // AOT JIT functions + pure functions module
            if (id === RESOLVED_AOT_JIT_FNS) {
                if (!aotData) {
                    return generateNoopModule('No-op: AOT JIT caches not generated');
                }
                return generateJitFnsModule(aotData.jitFnsCode);
            }

            // AOT pure functions module (standalone)
            if (id === RESOLVED_AOT_PURE_FNS) {
                if (!aotData) {
                    return generateNoopModule('No-op: AOT pure fns not generated');
                }
                return generatePureFnsModule(aotData.pureFnsCode);
            }

            // AOT router cache module
            if (id === RESOLVED_AOT_ROUTER_CACHE) {
                if (!aotData) {
                    return generateNoopModule('No-op: AOT router cache not generated');
                }
                return generateRouterCacheModule(aotData.routerCacheCode);
            }

            // Combined AOT caches module (imports all 3 above, registers and re-exports)
            if (id === RESOLVED_AOT_CACHES) {
                if (!aotData) {
                    return generateNoopCombinedModule();
                }
                return generateCombinedCachesModule();
            }

            return null;
        },

        transform(code: string, fileName: string) {
            // Step 1: Extract pure functions BEFORE any transformation
            if (pureFnOptions) {
                try {
                    const fns = extractPureFnsFromSource(code, fileName);
                    // Store extracted functions - they will be available via virtual module
                    // Note: This is for inline extraction, main extraction happens in load()
                    if (fns.length > 0) {
                        // In a real implementation, we might want to merge these with the registry
                        // For now, the main extraction in scanClientSource handles the full scan
                    }
                } catch (err) {
                    // Log but don't fail - extraction errors shouldn't break the build
                    console.warn(`[mion] Warning: Could not extract pure functions from ${fileName}: ${err}`);
                }
            }

            // Step 2: Apply deepkit transformation
            if (deepkitTransform) {
                return deepkitTransform(code, fileName);
            }

            return null;
        },

        handleHotUpdate({file, server}) {
            // In dev mode, re-scan when client source changes (for pure functions)
            if (pureFnOptions) {
                const clientSrcPath = resolve(pureFnOptions.clientSrcPath);
                if (file.startsWith(clientSrcPath)) {
                    const include = pureFnOptions.include || ['**/*.ts', '**/*.tsx'];
                    const exclude = pureFnOptions.exclude || ['**/node_modules/**', '**/.dist/**', '**/dist/**'];
                    if (isIncluded(file, include, exclude)) {
                        // Clear cache and invalidate virtual module
                        extractedFns = null;
                        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
                        if (mod) {
                            server.moduleGraph.invalidateModule(mod);
                            return [mod];
                        }
                    }
                }
            }

            // In dev mode, regenerate AOT caches when server source changes
            // Only if a custom startServerScript is provided (default routes don't change)
            if (aotOptions && aotOptions.startServerScript) {
                // Check if the changed file is in the server directory
                const serverDir = resolve(aotOptions.startServerScript, '..');
                if (file.startsWith(serverDir)) {
                    // Regenerate AOT caches asynchronously (always fresh, then update disk cache)
                    generateAOTCaches(aotOptions)
                        .then((data) => {
                            aotData = data;
                            logAOTCaches(data);
                            updateDiskCache(aotOptions, data, aotCacheDir);
                            // Invalidate all 3 AOT virtual modules
                            const modulesToInvalidate = [RESOLVED_AOT_JIT_FNS, RESOLVED_AOT_PURE_FNS, RESOLVED_AOT_ROUTER_CACHE];
                            const invalidatedMods: any[] = [];
                            for (const vmId of modulesToInvalidate) {
                                const mod = server.moduleGraph.getModuleById(vmId);
                                if (mod) {
                                    server.moduleGraph.invalidateModule(mod);
                                    invalidatedMods.push(mod);
                                }
                            }
                            if (invalidatedMods.length > 0) {
                                console.log('[mion] AOT caches regenerated, invalidating virtual modules');
                            }
                        })
                        .catch((err) => {
                            console.error('[mion] Failed to regenerate AOT caches:', err.message);
                        });
                }
            }

            return undefined;
        },
    };
}
