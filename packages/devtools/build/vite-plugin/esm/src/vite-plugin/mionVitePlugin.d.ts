import { Plugin } from 'vite';
import { PureFunctionsPluginOptions, DeepkitTypeOptions, AOTCacheOptions } from './types.ts';
export interface MionPluginOptions {
    pureFunctions?: PureFunctionsPluginOptions;
    deepkitType?: DeepkitTypeOptions;
    aotCaches?: AOTCacheOptions;
}
export declare function mionVitePlugin(options: MionPluginOptions): Plugin;
