import { ServerPureFunctionsOptions, DeepkitTypeOptions, AOTCacheOptions, MionServerConfig } from './types.ts';
export interface MionPluginOptions {
    serverPureFunctions?: ServerPureFunctionsOptions;
    runTypes?: DeepkitTypeOptions;
    aotCaches?: AOTCacheOptions | true;
    server?: MionServerConfig;
}
export declare function mionVitePlugin(options: MionPluginOptions): {
    name: string;
    enforce: "pre";
    config(config: any): void;
    configResolved(config: any): void;
    buildStart(): Promise<void>;
    configureServer(server: any): void;
    resolveId(id: any, importer: any): string | null;
    load(id: any): Promise<string | {
        code: string;
        syntheticNamedExports: boolean;
    } | null>;
    transform(code: string, fileName: string): {
        code: string;
        map: string | undefined;
    } | null;
    buildEnd(): void;
    closeBundle(): Promise<void>;
    handleHotUpdate({ file, server }: {
        file: any;
        server: any;
    }): any[] | undefined;
};
export declare function parseVueModuleId(id: string): {
    basePath: string;
    lang: string | null;
} | null;
export declare function isIncluded(filePath: string, include: string[], exclude: string[]): boolean;
export declare const serverReady: Promise<void>;
