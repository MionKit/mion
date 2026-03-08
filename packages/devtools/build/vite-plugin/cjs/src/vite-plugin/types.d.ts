import { CompilerOptions } from 'typescript';
export interface AOTCacheOptions {
    startServerScript?: string;
    serverViteConfig?: string;
    excludedFns?: string[];
    excludedPureFns?: string[];
    cache?: boolean | string;
    excludeReflection?: boolean;
    writeToDisk?: string | false;
    writeToDiskId?: string;
}
export interface PureServerFnRegistryEntry {
    readonly namespace: string;
    readonly fnName: string;
    readonly paramNames: string[];
    readonly code: string;
    readonly bodyHash: string;
    readonly dependencies: Set<string>;
    readonly isFactory: boolean;
}
export interface PureServerFnRegistry {
    readonly version: string;
    readonly entries: Record<string, PureServerFnRegistryEntry>;
}
export interface ServerPureFunctionsOptions {
    clientSrcPath: string;
    include?: string[];
    exclude?: string[];
}
export interface ExtractedPureFn {
    namespace: string;
    fnName: string;
    paramNames: string[];
    fnBody: string;
    bodyHash: string;
    dependencies: Set<string>;
    sourceFile: string;
    isFactory: boolean;
}
export interface ParsedFactoryFn {
    readonly bodyHash: string;
    readonly paramNames: string[];
    readonly code: string;
}
export type ReflectionMode = 'default' | 'explicit' | 'never';
export interface DeepkitTypeOptions {
    include?: string | string[];
    exclude?: string | string[];
    tsConfig?: string;
    reflection?: ReflectionMode;
    compilerOptions?: CompilerOptions;
}
