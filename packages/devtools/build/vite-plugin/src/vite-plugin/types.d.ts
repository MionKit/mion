export interface PureServerFnRegistryEntry {
    readonly namespace: string;
    readonly fnName?: string;
    readonly paramNames: string[];
    readonly code: string;
    readonly bodyHash: string;
    readonly dependencies: string[];
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
    fnName?: string;
    paramNames: string[];
    code: string;
    bodyHash: string;
    dependencies: string[];
    sourceFile: string;
}
