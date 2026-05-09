import { ExtractedPureFn, ServerPureFunctionsOptions } from './types.ts';
import { FileVisitor } from './sourceWalker.ts';
export declare function extractVueScriptContent(source: string): {
    content: string;
    lang: string;
} | null;
export interface FilePureFnsCache {
    pureServerFns: ExtractedPureFn[];
    mapFromFns: ExtractedPureFn[];
}
export declare const pureFnVisitor: (options: ServerPureFunctionsOptions, byFile: Map<string, FilePureFnsCache>) => FileVisitor;
export declare function refreshFilePureFnsCache(byFile: Map<string, FilePureFnsCache>, filePath: string, options: ServerPureFunctionsOptions): void;
export declare function extractPureFnsFromSource(source: string, filePath: string, fnName?: string, noViteClient?: boolean): ExtractedPureFn[];
export declare function stripTypes(code: string, filePath?: string): string;
export declare class PurityError extends Error {
    readonly filePath: string;
    readonly position: number;
    constructor(message: string, filePath: string, position: number);
}
//# sourceMappingURL=extractPureFn.d.ts.map