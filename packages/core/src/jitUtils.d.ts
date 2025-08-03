import type { JitFunctionsCache, PureFunctionsCache, JITUtils } from './types';
export declare const jitUtils: JITUtils;
export declare function isSafeMapKeyValue(value: any, depth?: number): boolean;
export declare function restoreCompiledJitFnsCache(jitCache: JitFunctionsCache, pureCache: PureFunctionsCache): void;
export declare function getFnCaches(): {
    jitFnsCache: Readonly<JitFunctionsCache>;
    pureFnsCache: Readonly<PureFunctionsCache>;
};
//# sourceMappingURL=jitUtils.d.ts.map