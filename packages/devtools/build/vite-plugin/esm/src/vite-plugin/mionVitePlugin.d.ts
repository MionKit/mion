import { PluginOptions as TsRuntypesPluginOptions } from '@ts-runtypes/devtools';
import { PluginOption } from 'vite';
export interface MionRunTypesOptions {
    tsConfig?: string;
    binary?: string;
    genDir?: string;
    outDir?: string;
    emitMode?: 'code' | 'both';
    moduleMode?: TsRuntypesPluginOptions['moduleMode'];
    inlineMode?: TsRuntypesPluginOptions['inlineMode'];
    transformMode?: TsRuntypesPluginOptions['transformMode'];
    failOnError?: TsRuntypesPluginOptions['failOnError'];
    patternSampleCount?: TsRuntypesPluginOptions['patternSampleCount'];
    patternSampleRetries?: TsRuntypesPluginOptions['patternSampleRetries'];
    jsRuntime?: TsRuntypesPluginOptions['jsRuntime'];
}
export interface MionServerOptions {
    startScript: string;
    viteConfig?: string;
    runMode?: 'middleware' | 'childProcess';
    waitTimeout?: number;
    env?: Record<string, string>;
    basePath?: string;
    platform?: string;
    exclude?: RegExp[];
    hotReload?: boolean;
}
export interface MionServerMappersOptions {
    emit?: boolean | string;
    injectInto?: string | string[];
    consume?: string | string[];
}
export interface MionPluginOptions {
    runTypes?: MionRunTypesOptions;
    serverMappers?: MionServerMappersOptions;
    server?: MionServerOptions;
}
export declare function resolveRtBinary(explicit?: string): string | undefined;
export declare function mionVitePlugin(options?: MionPluginOptions): PluginOption[];
export declare const serverReady: Promise<void>;
//# sourceMappingURL=mionVitePlugin.d.ts.map