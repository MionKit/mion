import { AOTCacheOptions } from './types.ts';
export interface AOTCacheData {
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}
export declare function generateAOTCaches(options: AOTCacheOptions, startScriptOverride?: string): Promise<AOTCacheData>;
export declare function generateJitFnsModule(jitFnsCode: string): string;
export declare function generatePureFnsModule(pureFnsCode: string): string;
export declare function generateRouterCacheModule(routerCacheCode: string): string;
export declare function generateCombinedCachesModule(): string;
export declare function generateNoopModule(comment: string): string;
export declare function generateNoopCombinedModule(): string;
