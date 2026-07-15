import { PluginOptions as TsRuntypesPluginOptions } from '@ts-runtypes/devtools';
export interface MionRunTypesOptions {
    tsConfig?: string;
    binary?: string;
    outDir?: string;
    emitMode?: TsRuntypesPluginOptions['emitMode'];
    moduleMode?: TsRuntypesPluginOptions['moduleMode'];
    inlineMode?: TsRuntypesPluginOptions['inlineMode'];
    transformMode?: TsRuntypesPluginOptions['transformMode'];
    failOnError?: TsRuntypesPluginOptions['failOnError'];
    allowUncheckedPatterns?: TsRuntypesPluginOptions['allowUncheckedPatterns'];
    compilerOptions?: unknown;
    include?: string | string[];
    exclude?: string | string[];
    reflectionMode?: unknown;
}
export interface MionServerOptions {
    startScript: string;
    viteConfig?: string;
    runMode?: 'childProcess' | 'middleware' | 'buildOnly';
    waitTimeout?: number;
    env?: Record<string, string>;
}
export interface MionPluginOptions {
    runTypes?: MionRunTypesOptions;
    serverPureFunctions?: unknown;
    aotCaches?: unknown;
    server?: MionServerOptions;
}
export declare function resolveRtBinary(explicit?: string): string | undefined;
export declare function mionVitePlugin(options?: MionPluginOptions): import('vite').Plugin<any> | (import('vite').Plugin<any> | import('vite').Plugin<any>[] | {
    name: string;
    buildStart(): void;
})[];
export declare const serverReady: Promise<void>;
//# sourceMappingURL=mionVitePlugin.d.ts.map