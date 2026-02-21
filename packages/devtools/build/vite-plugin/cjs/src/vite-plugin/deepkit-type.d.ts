import { RunTypeOptions } from './types.ts';
export declare function createDeepkitTransform(options?: RunTypeOptions): (code: string, fileName: string) => {
    code: string;
    map: string | undefined;
} | null;
