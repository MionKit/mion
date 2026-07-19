import { PluginOptions as TsRuntypesPluginOptions } from '@ts-runtypes/devtools';
export interface MionRunTypesOptions {
    tsConfig?: string;
    binary?: string;
    genDir?: string;
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
export interface MionServerMappersOptions {
    emit?: boolean | string;
    consume?: string | string[];
}
export interface MionPluginOptions {
    runTypes?: MionRunTypesOptions;
    serverMappers?: MionServerMappersOptions;
    serverPureFunctions?: unknown;
    aotCaches?: unknown;
    server?: MionServerOptions;
}
export declare function resolveRtBinary(explicit?: string): string | undefined;
export declare function mionVitePlugin(options?: MionPluginOptions): unknown[] | import('vite').Plugin<any>;
export declare const serverReady: Promise<void>;
//# sourceMappingURL=mionVitePlugin.d.ts.map