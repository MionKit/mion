import { DeepkitTypeOptions } from './types.ts';
export declare function createDeepkitTransform(options?: DeepkitTypeOptions): (code: string, fileName: string) => {
    code: string;
    map: string | undefined;
} | null;
