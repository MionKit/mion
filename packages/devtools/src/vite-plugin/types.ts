/** Serializable registry entry for a single pure function */
export interface PureServerFnRegistryEntry {
    readonly namespace: string;
    /** The function name (optional, for debugging purposes only) */
    readonly fnName?: string;
    readonly paramNames: string[];
    readonly code: string;
    /** Hash of the function body - used as the unique identifier */
    readonly bodyHash: string;
    readonly dependencies: string[];
}

/** The serializable registry shape written to disk (keyed by bodyHash) */
export interface PureServerFnRegistry {
    readonly version: string;
    /** Entries keyed by bodyHash */
    readonly entries: Record<string, PureServerFnRegistryEntry>;
}

/** Plugin options for the server-side Vite plugin */
export interface PureFunctionsPluginOptions {
    /** Path to the client package source directory containing pureServerFn() calls */
    clientSrcPath: string;
    /** Glob patterns for files to scan within clientSrcPath. Defaults to ['**\/*.ts', '**\/*.tsx'] */
    include?: string[];
    /** Glob patterns for files to exclude from scanning */
    exclude?: string[];
}

/** Extracted function data from AST analysis */
export interface ExtractedPureFn {
    /** The function name (optional, for debugging purposes only) */
    fnName?: string;
    paramNames: string[];
    code: string;
    /** Hash of the function body - used as the unique identifier */
    bodyHash: string;
    dependencies: string[];
    sourceFile: string;
}
