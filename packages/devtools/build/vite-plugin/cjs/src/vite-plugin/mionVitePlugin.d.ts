import { Plugin } from 'vite';
import { PureFunctionsPluginOptions, RunTypeOptions, AOTCacheOptions } from './types.ts';
export interface MionPluginOptions {
    pureFunctions?: PureFunctionsPluginOptions;
    runTypes?: RunTypeOptions;
    aotCaches?: AOTCacheOptions;
}
export declare function mionVitePlugin(options: MionPluginOptions): Plugin;
