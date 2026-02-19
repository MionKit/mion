import { Plugin } from 'vite';
import { PureFunctionsPluginOptions, DeepkitTypeOptions } from './types.ts';
export interface MionPluginOptions {
    pureFunctions?: PureFunctionsPluginOptions;
    deepkitType?: DeepkitTypeOptions;
}
export declare function mionVitePlugin(options: MionPluginOptions): Plugin;
