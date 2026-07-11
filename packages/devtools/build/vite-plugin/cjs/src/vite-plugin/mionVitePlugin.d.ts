import { PluginOptions as TsRuntypesPluginOptions } from '@ts-runtypes/devtools';
export interface MionRunTypesOptions {
    tsConfig?: string;
    binary?: string;
    outDir?: string;
    emitMode?: TsRuntypesPluginOptions['emitMode'];
    moduleMode?: TsRuntypesPluginOptions['moduleMode'];
    inlineMode?: TsRuntypesPluginOptions['inlineMode'];
    transformMode?: TsRuntypesPluginOptions['transformMode'];
    compilerOptions?: unknown;
    include?: string | string[];
    exclude?: string | string[];
    reflectionMode?: unknown;
}
export interface MionPluginOptions {
    runTypes?: MionRunTypesOptions;
    serverPureFunctions?: unknown;
    aotCaches?: unknown;
    server?: unknown;
}
export declare function resolveRtBinary(explicit?: string): string | undefined;
export declare function deriveRuntypesTsconfig(tsConfigPath: string | undefined, cwd?: string): string | undefined;
export declare function mionVitePlugin(options?: MionPluginOptions): import('vite').Plugin<any> | import('vite').Plugin<any>[];
export declare const serverReady: Promise<void>;
//# sourceMappingURL=mionVitePlugin.d.ts.map