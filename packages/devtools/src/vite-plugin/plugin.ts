/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Plugin} from 'vite';
import {readFileSync, readdirSync, statSync} from 'fs';
import {join, resolve} from 'path';
import {PureFunctionsPluginOptions, ExtractedPureFn} from './types.ts';
import {RESOLVED_VIRTUAL_MODULE_ID} from './constants.ts';
import {VIRTUAL_MODULE_ID} from './constants.ts';
import {extractPureFnsFromSource} from './extractPureFn.ts';
import {generateVirtualModule} from './virtualModule.ts';

/**
 * Creates the mion pure server functions Vite plugin.
 * This plugin scans client source code to extract pure functions and makes them available on the server.
 *
 * @example
 * ```ts
 * // vite.config.ts (server)
 * import {pureFunctionsPlugin} from '@mionkit/server-pure-functions';
 *
 * export default defineConfig({
 *   plugins: [
 *     pureFunctionsPlugin({
 *       clientSrcPath: '../client/src'
 *     })
 *   ]
 * });
 * ```
 */
export function pureFunctionsPlugin(options: PureFunctionsPluginOptions): Plugin {
    const include = options.include || ['**/*.ts', '**/*.tsx'];
    const exclude = options.exclude || ['**/node_modules/**', '**/.dist/**', '**/dist/**'];

    let extractedFns: ExtractedPureFn[] | null = null;

    /** Scans the client source directory and extracts all pure functions */
    function scanClientSource(): ExtractedPureFn[] {
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

    return {
        name: 'mion-pure-functions',
        enforce: 'pre',

        resolveId(id) {
            if (id === VIRTUAL_MODULE_ID) {
                return RESOLVED_VIRTUAL_MODULE_ID;
            }
            return null;
        },

        load(id) {
            if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                // Lazily scan client source on first load
                if (!extractedFns) {
                    extractedFns = scanClientSource();
                }
                return generateVirtualModule(extractedFns);
            }
            return null;
        },

        handleHotUpdate({file, server}) {
            // In dev mode, re-scan when client source changes
            const clientSrcPath = resolve(options.clientSrcPath);
            if (!file.startsWith(clientSrcPath)) return;
            if (!isIncluded(file, include, exclude)) return;

            // Clear cache and invalidate virtual module
            extractedFns = null;
            const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
            if (mod) {
                server.moduleGraph.invalidateModule(mod);
                return [mod];
            }
        },
    };
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
