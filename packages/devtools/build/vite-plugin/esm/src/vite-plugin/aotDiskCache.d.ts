import { AOTCacheOptions, MionServerConfig } from './types.ts';
import { AOTCacheData, AOTCacheResult } from './aotCacheGenerator.ts';
export declare function computeSourceHash(serverConfig: MionServerConfig, aotOptions?: AOTCacheOptions): string;
export declare function resolveCacheDir(options: AOTCacheOptions, viteCacheDir?: string): string;
export declare function getOrGenerateAOTCaches(serverConfig: MionServerConfig, aotOptions: AOTCacheOptions | undefined, cacheDir: string): Promise<AOTCacheResult>;
export declare function updateDiskCache(serverConfig: MionServerConfig, aotOptions: AOTCacheOptions | undefined, data: AOTCacheData, cacheDir: string): void;
