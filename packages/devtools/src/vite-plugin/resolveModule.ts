/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Inlined from @mionjs/core/src/utils.ts to avoid the vite plugin depending on core.
 * Keep in sync with the original implementation.
 */

import {resolve} from 'path/posix';
import {fileURLToPath} from 'url';

/** Resolves a module path in both CJS and ESM environments. */
export async function resolveModule(moduleName: string, callerDir?: string): Promise<string> {
    const resolvedPath = moduleName.startsWith('.') && callerDir ? resolve(callerDir, moduleName) : moduleName;
    const metaResolve = getImportMetaResolve();
    if (metaResolve) {
        const resolved = await metaResolve(resolvedPath);
        if (resolved) return resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved;
    }

    try {
        if (typeof require !== 'undefined' && typeof require.resolve === 'function') return require.resolve(resolvedPath);
    } catch {
        // Ignore and fall back to createRequire
    }

    try {
        const {createRequire} = await import('module');
        const basePath = callerDir ? resolve(callerDir, 'noop.js') : resolve(process.cwd(), 'noop.js');
        const requireFn = createRequire(basePath);
        return requireFn.resolve(resolvedPath);
    } catch (err) {
        throw new Error(`Failed to resolve module "${moduleName}": ${err instanceof Error ? err.message : String(err)}`);
    }
}

function getImportMetaResolve(): ((specifier: string) => string | Promise<string> | undefined) | undefined {
    try {
        // eslint-disable-next-line no-new-func
        return new Function('specifier', 'return import.meta.resolve?.(specifier);') as (
            specifier: string
        ) => string | Promise<string> | undefined;
    } catch {
        return undefined;
    }
}
