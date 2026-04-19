import { DeepkitTypeOptions, ExtractedPureFn } from './types.ts';
import * as ts from 'typescript';
export interface DeepkitConfig {
    filter: (fileName: string) => boolean;
    compilerOptions: ts.CompilerOptions;
    beforeTransformers: ts.CustomTransformerFactory[];
    afterTransformers: ts.CustomTransformerFactory[];
}
export declare function createDeepkitConfig(options?: DeepkitTypeOptions): DeepkitConfig;
export declare function createPureFnTransformerFactory(originalSource: string, filePath: string, collector?: ExtractedPureFn[], noViteClient?: boolean): ts.CustomTransformerFactory;
//# sourceMappingURL=transformers.d.ts.map