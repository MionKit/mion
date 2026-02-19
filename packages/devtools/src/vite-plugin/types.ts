import {CompilerOptions} from 'typescript';

/** Serializable registry entry for a single pure function */
export interface PureServerFnRegistryEntry {
    readonly namespace: string;
    /** The function name (required for lookup) */
    readonly fnName: string;
    readonly paramNames: string[];
    readonly code: string;
    /** Hash of the function body - used for version validation */
    readonly bodyHash: string;
    readonly dependencies: Set<string>;
    /** Indicates if this is a factory function that receives jitUtils */
    readonly isFactory: boolean;
}

/** The serializable registry shape written to disk (keyed by namespace::fnName) */
export interface PureServerFnRegistry {
    readonly version: string;
    /** Entries keyed by namespace::fnName */
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
    /** The namespace this pure function belongs to */
    namespace: string;
    /** The function name (required for lookup via namespace::fnName) */
    fnName: string;
    paramNames: string[];
    code: string;
    /** Hash of the function body - used for version validation */
    bodyHash: string;
    /** Dependencies in format "namespace::fnName" */
    dependencies: Set<string>;
    sourceFile: string;
    /** Indicates if this is a factory function that receives jitUtils */
    isFactory: boolean;
}

/** Reflection mode for deepkit type compiler */
export type ReflectionMode = 'default' | 'explicit' | 'never';

/** Options for deepkit type transformation */
export interface DeepkitTypeOptions {
    /** Glob patterns to include. Defaults to ['**\/*.tsx', '**\/*.ts'] */
    include?: string | string[];

    /**  Glob patterns to exclude. Defaults to 'node_modules/**' */
    exclude?: string | string[];
    /**  Path to tsconfig.json. If not provided, will search from project root. */
    tsConfig?: string;
    /**
     * Override reflection mode. If not set, uses tsconfig's reflection option.
     * Set to 'default' to enable reflection for all files regardless of tsconfig.
     * Useful for simple projects without explicit tsconfig reflection configuration.
     */
    reflection?: ReflectionMode;
    /** Additional compiler options to merge with tsconfig.json */
    compilerOptions?: CompilerOptions;
}
