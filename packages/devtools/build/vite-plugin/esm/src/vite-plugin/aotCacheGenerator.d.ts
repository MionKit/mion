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
}
export declare function generateAOTCaches(serverConfig: MionServerConfig, startScriptOverride?: string): Promise<AOTCacheResult>;
export type ModuleLoader = (url: string) => Promise<Record<string, any>>;
export declare function loadSSRRouterAndGenerateAOTCaches(loadModule: ModuleLoader, startServerScript: string): Promise<AOTCacheData>;
export declare function killPersistentChild(child: ChildProcess | null): Promise<void>;
export declare function logAOTCaches(data: AOTCacheData): void;
export declare function generateJitFnsModule(jitFnsCode: string): string;
export declare function generatePureFnsModule(pureFnsCode: string): string;
export declare function generateRouterCacheModule(routerCacheCode: string): string;
export declare function generateCombinedCachesModule(): string;
export declare function generateNoopModule(comment: string): string;
export declare function waitForServer(port: number, timeoutMs?: number): Promise<void>;
export declare function generateNoopCombinedModule(): string;
