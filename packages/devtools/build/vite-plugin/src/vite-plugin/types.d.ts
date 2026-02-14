export interface PureServerFnRegistryEntry {
    readonly namespace: string;
    readonly fnName: string;
    readonly paramNames: string[];
    readonly code: string;
    readonly bodyHash: string;
    readonly dependencies: string[];
    readonly isFactory: boolean;
}
export interface PureServerFnRegistry {
    readonly version: string;
    readonly entries: Record<string, PureServerFnRegistryEntry>;
}
export interface PureFunctionsPluginOptions {
    clientSrcPath: string;
    include?: string[];
    exclude?: string[];
}
export interface ExtractedPureFn {
    namespace: string;
    fnName: string;
    paramNames: string[];
    code: string;
    bodyHash: string;
    dependencies: string[];
    sourceFile: string;
    isFactory: boolean;
}
export type ReflectionMode = 'default' | 'explicit' | 'never';
export interface DeepkitTypeOptions {
    include?: string | string[];
    exclude?: string | string[];
    tsConfig?: string;
    reflection?: ReflectionMode;
}
