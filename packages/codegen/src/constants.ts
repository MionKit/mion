/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AOTConfig} from './types';

/**
 * Default AOT configuration shared across all mion packages
 */
export const DEFAULT_AOT_CONFIG_ESM: AOTConfig = {
    fileHeader: `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\n`,
    outputDir: './dist/esm/mion-cache',
    module: 'esm',
    caches: {
        router: {path: 'router.cache.mjs', exportName: 'routerCache'},
        jit: {path: 'jitFns.cache.mjs', exportName: 'jitFnsCache'},
        pure: {path: 'pureFns.cache.mjs', exportName: 'pureFnsCache'},
    },
};

export const DEFAULT_AOT_CONFIG_CJS: AOTConfig = {
    fileHeader: `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY\n`,
    outputDir: './dist/cjs/mion-cache',
    module: 'cjs',
    caches: {
        router: {path: 'router.cache.js', exportName: 'routerCache'},
        jit: {path: 'jitFns.cache.js', exportName: 'jitFnsCache'},
        pure: {path: 'pureFns.cache.js', exportName: 'pureFnsCache'},
    },
};
export function getDefaultAOTConfig(config: Partial<AOTConfig>): AOTConfig {
    const defaultConf = config?.module === 'cjs' ? DEFAULT_AOT_CONFIG_CJS : DEFAULT_AOT_CONFIG_ESM;
    return {
        ...defaultConf,
        caches: {
            ...defaultConf.caches,
            ...(config?.caches || {}),
        },
    };
}
