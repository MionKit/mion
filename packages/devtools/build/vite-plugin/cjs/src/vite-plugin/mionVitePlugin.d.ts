import { Plugin } from 'vite';
import { ServerPureFunctionsOptions, DeepkitTypeOptions, AOTCacheOptions } from './types.ts';
export interface MionPluginOptions {
    serverPureFunctions?: ServerPureFunctionsOptions;
    runTypes?: DeepkitTypeOptions;
    aotCaches?: AOTCacheOptions;
}
export declare function isIncluded(filePath: string, include: string[], exclude: string[]): boolean;
export declare function mionVitePlugin(options: MionPluginOptions): Plugin;
