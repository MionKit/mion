import { DeepkitTypeOptions } from './types.ts';
export declare function transformWithDeepkit(code: string, fileName: string, options?: DeepkitTypeOptions): {
    code: string;
    map: null;
} | null;
