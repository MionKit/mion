import { ExtractedPureFn, ServerPureFunctionsOptions } from './types.ts';
export declare function scanClientSource(options: ServerPureFunctionsOptions): ExtractedPureFn[];
export declare function extractPureFnsFromSource(source: string, filePath: string): ExtractedPureFn[];
export declare function stripTypes(code: string): string;
export declare function transformPureServerFnCalls(source: string, filePath: string): {
    code: string;
    extractedFns: ExtractedPureFn[];
} | null;
export declare function findMatchingParen(source: string, openPos: number): number;
export declare class PurityError extends Error {
    readonly filePath: string;
    readonly position: number;
    constructor(message: string, filePath: string, position: number);
}
