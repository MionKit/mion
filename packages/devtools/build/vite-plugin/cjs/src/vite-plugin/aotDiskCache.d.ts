import { AOTCacheOptions } from './types.ts';
import { AOTCacheData } from './aotCacheGenerator.ts';
export declare function computeSourceHash(options: AOTCacheOptions): string;
export declare function resolveCacheDir(options: AOTCacheOptions, viteCacheDir?: string): string;
export declare function getOrGenerateAOTCaches(options: AOTCacheOptions, cacheDir: string): Promise<AOTCacheData>;
export declare function updateDiskCache(options: AOTCacheOptions, data: AOTCacheData, cacheDir: string): void;
