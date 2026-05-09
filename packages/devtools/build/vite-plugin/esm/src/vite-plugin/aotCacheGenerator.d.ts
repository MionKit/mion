import { ChildProcess } from 'child_process';
import { MionServerConfig } from './types.ts';
export interface AOTCacheData {
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}
export interface AOTCacheResult {
    data: AOTCacheData;
    childProcess?: ChildProcess;
    platformReady?: Promise<PlatformReadyData>;
}
export interface PlatformReadyData {
    routerConfig: Record<string, unknown>;
    platformConfig: Record<string, unknown>;
}
export declare function generateAOTCaches(serverConfig: MionServerConfig, startScriptOverride?: string, isClient?: boolean): Promise<AOTCacheResult>;
export type ModuleLoader = (url: string) => Promise<Record<string, any>>;
export declare function loadSSRRouterAndGenerateAOTCaches(loadModule: ModuleLoader, startScript: string, isClient?: boolean): Promise<AOTCacheData>;
export declare function killPersistentChild(child: ChildProcess | null): Promise<void>;
export declare function logAOTCaches(data: AOTCacheData): void;
export declare function generateJitFnsModule(jitFnsCode: string): string;
export declare function generatePureFnsModule(pureFnsCode: string): string;
export declare function generateRouterCacheModule(routerCacheCode: string): string;
export declare function generateCombinedCachesModule(): string;
export declare function waitForPlatformReady(child: ChildProcess, timeoutMs?: number): Promise<{
    routerConfig: Record<string, unknown>;
    platformConfig: Record<string, unknown>;
}>;
//# sourceMappingURL=aotCacheGenerator.d.ts.map