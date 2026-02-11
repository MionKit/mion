/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** The namespace used for all pureServerFn functions */
export const PURE_SERVER_FN_NAMESPACE = 'pureServerFn';

/** Virtual module ID for the pure functions registry */
export const VIRTUAL_MODULE_ID = 'virtual:mion-pure-functions';

/** Resolved virtual module ID (with \0 prefix per Vite convention, .ts extension for TypeScript) */
export const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID + '.ts';

/** Reference object returned by pureServerFn() at runtime on the client */
export interface PureServerFnRef<F extends (...args: any[]) => any = (...args: any[]) => any> {
    /** The function name (optional, for debugging purposes only) */
    readonly fnName?: string;
    /** Hash of the function body - used as the unique identifier */
    readonly bodyHash: string;
    /** The original function (available in dev, stripped in production) */
    readonly fn?: F;
}

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
