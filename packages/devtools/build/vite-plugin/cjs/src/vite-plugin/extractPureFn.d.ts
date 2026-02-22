import { ExtractedPureFn, ServerPureFunctionsOptions } from './types.ts';
export declare function scanClientSource(options: ServerPureFunctionsOptions): ExtractedPureFn[];
export declare function extractPureFnsFromSource(source: string, filePath: string, fnName?: string): ExtractedPureFn[];
export declare function stripTypes(code: string): string;
export declare class PurityError extends Error {
    readonly filePath: string;
    readonly position: number;
    constructor(message: string, filePath: string, position: number);
}
