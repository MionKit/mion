export interface SourceFile {
    fullPath: string;
    code: string;
    effectivePath: string;
}
export interface WalkOptions {
    include?: string[];
    exclude?: string[];
}
export type FileVisitor = (file: SourceFile) => void;
export declare function walkSourceFiles(rootDirs: string[], opts: WalkOptions, visitors: FileVisitor[]): void;
export declare const aotImportVisitor: (out: {
    found: boolean;
}) => FileVisitor;
//# sourceMappingURL=sourceWalker.d.ts.map