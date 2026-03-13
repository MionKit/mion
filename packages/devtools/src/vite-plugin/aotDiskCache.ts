/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {createHash} from 'crypto';
import {readFileSync, writeFileSync, mkdirSync, readdirSync, statSync} from 'fs';
import {join, resolve, dirname, relative} from 'path';
import {AOTCacheOptions, MionServerConfig} from './types.ts';
import {generateAOTCaches, AOTCacheData, AOTCacheResult} from './aotCacheGenerator.ts';

/** Schema for the on-disk cache file */
interface AOTDiskCacheFile {
    cacheVersion: string;
    hash: string;
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** Bump when mion internals change in a way that invalidates cached output */
const AOT_DISK_CACHE_VERSION = '2';

/** Cache file name */
const CACHE_FILENAME = 'mion-aot-cache.json';

/** Directories to skip when walking the server source tree */
const SKIP_DIRS = new Set(['node_modules', '.dist', 'dist', '.git', '.vite', 'build', 'coverage', '.coverage']);

/** File extensions to include in hash computation */
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;

/** Test file patterns to exclude from hash computation */
const TEST_FILE_PATTERN = /\.(spec|test)\.(ts|tsx)$/;

/** Read the devtools package version (cached after first call) */
let devtoolsVersion: string | null = null;
function getDevtoolsVersion(): string {
    if (devtoolsVersion) return devtoolsVersion;
    try {
        const pkgPath = resolve(dirname(new URL(import.meta.url).pathname), '../../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        devtoolsVersion = pkg.version || '0.0.0';
    } catch {
        devtoolsVersion = '0.0.0';
    }
    return devtoolsVersion as string;
}

/** Recursively collect file stats (relativePath:mtimeMs:size) for source files */
function collectFileStats(dir: string, baseDir: string): string[] {
    const entries: string[] = [];
    let files: string[];
    try {
        files = readdirSync(dir);
    } catch {
        return entries;
    }
    for (const file of files) {
        const fullPath = join(dir, file);
        let stat;
        try {
            stat = statSync(fullPath);
        } catch {
            continue;
        }
        if (stat.isDirectory()) {
            if (SKIP_DIRS.has(file)) continue;
            entries.push(...collectFileStats(fullPath, baseDir));
        } else if (SOURCE_EXTENSIONS.test(file) && !TEST_FILE_PATTERN.test(file)) {
            const relativePath = relative(baseDir, fullPath);
            entries.push(`${relativePath}:${stat.mtimeMs}:${stat.size}`);
        }
    }
    return entries;
}

/** Compute a SHA-256 hash of the server source directory + options */
export function computeSourceHash(serverConfig: MionServerConfig, aotOptions?: AOTCacheOptions): string {
    const serverDir = dirname(resolve(serverConfig.startServerScript));
    const fileStats = collectFileStats(serverDir, serverDir);
    fileStats.sort();

    const hashInput = [
        ...fileStats,
        `cacheVersion:${AOT_DISK_CACHE_VERSION}`,
        `devtoolsVersion:${getDevtoolsVersion()}`,
        `excludedFns:${JSON.stringify((aotOptions?.excludedFns || []).slice().sort())}`,
        `excludedPureFns:${JSON.stringify((aotOptions?.excludedPureFns || []).slice().sort())}`,
    ].join('\n');

    return createHash('sha256').update(hashInput).digest('hex');
}

/** Read and validate the disk cache file. Returns null on any error. */
function readDiskCache(cacheDir: string): AOTDiskCacheFile | null {
    const cachePath = join(cacheDir, CACHE_FILENAME);
    try {
        const raw = readFileSync(cachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (
            typeof parsed.cacheVersion === 'string' &&
            typeof parsed.hash === 'string' &&
            typeof parsed.jitFnsCode === 'string' &&
            typeof parsed.pureFnsCode === 'string' &&
            typeof parsed.routerCacheCode === 'string'
        ) {
            return parsed as AOTDiskCacheFile;
        }
        return null;
    } catch {
        return null;
    }
}

/** Write cache data to disk. Best-effort — logs warning on failure. */
function writeDiskCache(cacheDir: string, hash: string, data: AOTCacheData): void {
    const cachePath = join(cacheDir, CACHE_FILENAME);
    try {
        mkdirSync(cacheDir, {recursive: true});
        const cacheFile: AOTDiskCacheFile = {
            cacheVersion: AOT_DISK_CACHE_VERSION,
            hash,
            jitFnsCode: data.jitFnsCode,
            pureFnsCode: data.pureFnsCode,
            routerCacheCode: data.routerCacheCode,
        };
        writeFileSync(cachePath, JSON.stringify(cacheFile), 'utf-8');
    } catch (err) {
        console.warn(`[mion] Warning: Could not write AOT disk cache: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** Resolve the cache directory from options and Vite's cacheDir */
export function resolveCacheDir(options: AOTCacheOptions, viteCacheDir?: string): string {
    if (options.cache === false) return '';
    if (typeof options.cache === 'string') return resolve(options.cache);
    return viteCacheDir || resolve(process.cwd(), 'node_modules/.vite');
}

/** Load AOT caches from disk if valid, otherwise generate fresh and save to disk. */
export async function getOrGenerateAOTCaches(
    serverConfig: MionServerConfig,
    aotOptions: AOTCacheOptions | undefined,
    cacheDir: string
): Promise<AOTCacheResult> {
    const forceRegenerate = process.env.MION_AOT_FORCE === 'true';
    // IPC mode always needs a live child process (the server), so skip disk caching entirely
    const isIPCMode = serverConfig.mode === 'IPC';
    const cachingEnabled = cacheDir !== '' && !forceRegenerate && !isIPCMode;

    let hash = '';
    if (cachingEnabled) {
        hash = computeSourceHash(serverConfig, aotOptions);
        const cached = readDiskCache(cacheDir);
        if (cached && cached.cacheVersion === AOT_DISK_CACHE_VERSION && cached.hash === hash) {
            console.log('[mion] AOT caches loaded from disk cache (source unchanged)');
            return {
                data: {
                    jitFnsCode: cached.jitFnsCode,
                    pureFnsCode: cached.pureFnsCode,
                    routerCacheCode: cached.routerCacheCode,
                },
            };
        }
    }

    // Cache miss or caching disabled — generate fresh
    const result = await generateAOTCaches(serverConfig);

    if (cachingEnabled) {
        if (!hash) hash = computeSourceHash(serverConfig, aotOptions);
        writeDiskCache(cacheDir, hash, result.data);
        console.log('[mion] AOT caches saved to disk cache');
    }

    return result;
}

/** Update the disk cache after HMR regeneration */
export function updateDiskCache(
    serverConfig: MionServerConfig,
    aotOptions: AOTCacheOptions | undefined,
    data: AOTCacheData,
    cacheDir: string
): void {
    if (!cacheDir || aotOptions?.cache === false) return;
    const hash = computeSourceHash(serverConfig, aotOptions);
    writeDiskCache(cacheDir, hash, data);
}
