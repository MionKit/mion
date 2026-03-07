import {CompilerOptions} from 'typescript';

/** AOT cache generation options for the Vite plugin */
export interface AOTCacheOptions {
    /**
     * Path to the server start script that initializes the router.
     *
     * If provided, the plugin will run this script to generate AOT caches for ALL routes
     * (internal mion routes + your custom routes).
     *
     * If NOT provided, the plugin will automatically use the built-in defaultRoutes.ts
     * from @mionjs/router to generate caches for internal mion routes only.
     * Your custom routes will be fetched at runtime via fetchRemoteMethodsMetadata().
     *
     * For best performance, provide your server's start script to pre-cache all routes.
     */
    startServerScript?: string;

    /**
     * Path to the server's vite.config.ts file.
     * Used by vite-node to run the start script with proper transformations
     * If not provided, vite-node will auto-discover the config from the
     * startServerScript's directory.
     */
    serverViteConfig?: string;

    /** Excluded JIT function IDs */
    excludedFns?: string[];

    /** Excluded pure function names */
    excludedPureFns?: string[];

    /**
     * Disk caching for AOT compilation results.
     * Caches the compiled output so subsequent builds skip the expensive vite-node compile step
     * when server source hasn't changed.
     * - true (default): Cache in Vite's cacheDir (node_modules/.vite/)
     * - string: Custom cache directory path
     * - false: Disable disk caching
     *
     * Set env MION_AOT_FORCE=true to force regeneration regardless of this setting.
     */
    cache?: boolean | string;

    /**
     * Stub out @mionjs/run-types and @deepkit/* modules during the bundle build.
     * When AOT caches are pre-compiled, these modules are not needed at runtime
     * and can be replaced with empty stubs to reduce bundle size.
     * Useful for edge runtime builds where bundle size matters.
     *
     * Only applies to the parent build process — the AOT child process (MION_COMPILE=true)
     * always uses the real modules to generate caches.
     */
    excludeReflection?: boolean;
}

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
export interface ServerPureFunctionsOptions {
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
    /** The normalized function body code */
    fnBody: string;
    /** Hash of the function body - used for version validation */
    bodyHash: string;
    /** Dependencies in format "namespace::fnName" */
    dependencies: Set<string>;
    sourceFile: string;
    /** Indicates if this is a factory function that receives jitUtils */
    isFactory: boolean;
}

/** Pre-parsed factory function data injected at build time by the mion vite plugin (duplicated from core, can't share types) */
export interface ParsedFactoryFn {
    /** Hash of the function body */
    readonly bodyHash: string;
    /** The names of the factory function parameters */
    readonly paramNames: string[];
    /** The normalized function body code */
    readonly code: string;
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
