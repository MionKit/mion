import { Plugin } from 'vite';
import { ServerPureFunctionsPluginOptions, DeepkitTypeOptions, AOTCacheOptions } from './types.ts';
export interface MionPluginOptions {
    serverPureFunctions?: ServerPureFunctionsPluginOptions;
    runTypes?: DeepkitTypeOptions;
    aotCaches?: AOTCacheOptions;
}
export declare function mionVitePlugin(options: MionPluginOptions): Plugin;
