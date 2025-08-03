export type StrNumber = string | number;
export interface JITUtils {
    asJSONString(str: string): string;
    addToJitCache(comp: JitCompiledFn): void;
    removeFromJitCache(comp: JitCompiledFn): void;
    getJIT(jitFnHash: string): JitCompiledFn | undefined;
    getJitFn(jitFnHash: string): (...args: any[]) => any;
    hasJitFn(jitFnHash: string): boolean;
    addPureFn(compiledFn: CompiledPureFunction): void;
    usePureFn(name: string): PureFunction;
    getPureFn(name: string): PureFunction | undefined;
    getCompiledPureFn(name: string): CompiledPureFunction | undefined;
    hasPureFn(name: string): boolean;
    setSerializableClass<C extends SerializableClass>(cls: C): void;
    useSerializeClass(className: string): SerializableClass;
    getSerializeClass(className: string): SerializableClass | undefined;
    setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>): void;
    useDeserializeFn(className: string): DeserializeClassFn<any>;
    getDeserializeFn(className: string): DeserializeClassFn<any> | undefined;
    getUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): StrNumber[];
    hasUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): boolean;
    err(pλth: readonly StrNumber[], εrr: RunTypeError[], expected: string, accessPath?: readonly StrNumber[]): void;
    formatErr(pλth: StrNumber[], εrr: RunTypeError[], expected: string, fmtName: string, paramName: string, paramVal: string | number | boolean | bigint, fmtPath: StrNumber[], accessPath?: StrNumber[], fmtAccessPath?: StrNumber[]): void;
    safeKey(value: any): any;
}
export type CoreOptions = {
    autoGenerateErrorId: boolean;
};
export interface RpcErrorParams<ErrType extends StrNumber = any, ErrData = any> {
    type?: ErrType;
    id?: number | string;
    statusCode: number;
    publicMessage?: string;
    message?: string;
    errorData?: ErrData;
    originalError?: Error;
    name?: string;
}
export interface RpcErrorWithPublic<ErrType extends StrNumber = any, ErrData = any> extends RpcErrorParams<ErrType, ErrData> {
    publicMessage: string;
}
export interface RpcErrorWithPrivate<ErrType extends StrNumber = any, ErrData = any> extends RpcErrorParams<ErrType, ErrData> {
    message: string;
}
export interface PublicRpcError<ErrType extends StrNumber = any, ErrData = any> extends Omit<RpcErrorParams, 'publicMessage' | 'originalError'> {
    isΣrrθr: true;
    type: ErrType;
    message: string;
    statusCode: number;
    name: string;
    errorData?: ErrData;
}
export type AnyErrorParams<ErrType extends StrNumber = any, ErrData = any> = RpcErrorWithPublic<ErrType, ErrData> | RpcErrorWithPrivate<ErrType, ErrData>;
export interface RunTypeError {
    path: StrNumber[];
    expected: string;
    format?: TypeFormatError;
}
export type TypeFormatError = {
    name: string;
    val: StrNumber | boolean | bigint | (StrNumber | boolean | bigint)[];
    formatPath: StrNumber[];
};
export type FormatParamLiteral = string | number | boolean | RegExp | bigint;
export type TypeFormatValue = FormatParamLiteral | readonly TypeFormatValue[] | {
    [key: string]: TypeFormatValue | undefined | never;
};
export type FormatParamMeta<L extends TypeFormatValue = TypeFormatValue> = {
    val: L;
    errorMessage: string;
    desc?: string;
};
export type FormatParam<L extends TypeFormatValue> = L | FormatParamMeta<L>;
export type TypeFormatParams = Record<string, TypeFormatValue | undefined | never>;
export type TypeFormatParsedParams = {
    __jitId: string;
    [key: string]: TypeFormatValue;
};
export type PureFunctionDeps = Record<string, PureFunction>;
export type GenericPureFunction<P extends TypeFormatValue> = (val: any, formatParams: P, deps: PureFunctionDeps) => any;
export type ErrorsPureFunction<P extends TypeFormatValue> = (val: any, pλth: StrNumber[], εrr: RunTypeError[], expected: string, formatName: string, formatParams: P, formatPath: StrNumber[], deps: PureFunctionDeps, accessPath?: StrNumber[], fmtAccessPath?: StrNumber[]) => RunTypeError[];
export type PureFunction = (...args: any[]) => any;
export type PureFunctionClosure = (jitUtils: JITUtils) => PureFunction;
export interface PureFunctionData {
    readonly paramNames: string[];
    readonly code: string;
    readonly pureFnHash: string;
    readonly dependencies: Set<string>;
}
export interface CompiledPureFunction extends PureFunctionData {
    closureFn: PureFunctionClosure;
    fn?: PureFunction;
}
export type AnyFn = (...args: any[]) => any;
export type JitFnArgs = {
    vλl: string;
    [key: string]: string;
};
export interface JitCompiledFnData {
    readonly typeName: string;
    readonly fnID: string;
    readonly jitFnHash: string;
    readonly args: JitFnArgs;
    readonly defaultParamValues: JitFnArgs;
    readonly isNoop?: boolean;
    readonly code: string;
    readonly dependenciesSet: Set<string>;
    readonly pureFnDependencies: Set<string>;
    paramNames?: string[];
}
export interface JitCompiledFn<Fn extends AnyFn = AnyFn> extends JitCompiledFnData {
    readonly closureFn: (utl: JITUtils) => Fn;
    readonly fn: Fn;
}
export interface JitCompiledFunctions {
    isType: JitCompiledFn<IsTypeFn>;
    typeErrors: JitCompiledFn<TypeErrorsFn>;
    toJsonVal: JitCompiledFn<ToJsonValFn>;
    fromJsonVal: JitCompiledFn<FromJsonValFn>;
    jsonStringify: JitCompiledFn<JsonStringifyFn>;
}
export interface SerializableJITFunctions {
    isType: JitCompiledFnData;
    typeErrors: JitCompiledFnData;
    toJsonVal: JitCompiledFnData;
    fromJsonVal: JitCompiledFnData;
    jsonStringify: JitCompiledFnData;
}
export interface JitFunctionsHashes {
    isType: string;
    typeErrors: string;
    toJsonVal: string;
    fromJsonVal: string;
    jsonStringify: string;
}
export type JsonStringifyFn = (value: any) => JSONString;
export type FromJsonValFn = (value: JSONValue) => any;
export type ToJsonValFn = (value: any) => JSONValue;
export type TypeErrorsFn = (value: any) => RunTypeError[];
export type IsTypeFn = (value: any) => boolean;
export type ToCodeFn = (value: any) => string;
export type JitFunctionsCache = Record<string, JitCompiledFn>;
export type PureFunctionsCache = Record<string, CompiledPureFunction>;
export interface SrcCodeJitCompiledFn extends JitCompiledFnData {
    readonly closureFn: (utl: JITUtils) => AnyFn;
    readonly fn: undefined;
}
export interface SrcCodeCompiledPureFunction extends PureFunctionData {
    readonly closureFn: (utl: JITUtils) => AnyFn;
    readonly fn: undefined;
}
export type SrcCodeJITCompiledFnsCache = Record<string, SrcCodeJitCompiledFn>;
export type SrcCodePureFunctionsCache = Record<string, SrcCodeCompiledPureFunction>;
export type AnyObject = Record<string, unknown>;
export interface AnyClass<T = any> {
    new (...args: any[]): T;
}
export interface SerializableClass<T = any> {
    new (): T;
}
export type DeserializeClassFn<C extends InstanceType<AnyClass>> = (deserialized: DataOnly<C>) => C;
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
export type JSONValue = StrNumber | boolean | null | {
    [key: string]: JSONValue;
} | Array<JSONValue>;
export type JSONString = string;
type Native = Date | RegExp | URL | URLSearchParams | Blob | File | FileList | FormData | ArrayBuffer | SharedArrayBuffer | DataView | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array | BigInt64Array | BigUint64Array;
export type DataOnly<T> = T extends object ? T extends Native ? T : T extends Function ? never : T extends new (...args: any[]) => any ? never : T extends Array<infer U> ? Array<DataOnly<U>> : T extends Map<infer K, infer V> ? Map<DataOnly<K>, DataOnly<V>> : T extends Set<infer U> ? Set<DataOnly<U>> : {
    [K in keyof T as T[K] extends Function ? never : K]: DataOnly<T[K]>;
} : T;
export {};
export declare type __ΩStrNumber = any[];
export declare type __ΩJITUtils = any[];
export declare type __ΩCoreOptions = any[];
export declare type __ΩRpcErrorParams = any[];
export declare type __ΩRpcErrorWithPublic = any[];
export declare type __ΩRpcErrorWithPrivate = any[];
export declare type __ΩPublicRpcError = any[];
export declare type __ΩAnyErrorParams = any[];
export declare type __ΩRunTypeError = any[];
export declare type __ΩTypeFormatError = any[];
export declare type __ΩFormatParamLiteral = any[];
export declare type __ΩTypeFormatValue = any[];
export declare type __ΩFormatParamMeta = any[];
export declare type __ΩFormatParam = any[];
export declare type __ΩTypeFormatParams = any[];
export declare type __ΩTypeFormatParsedParams = any[];
export declare type __ΩPureFunctionDeps = any[];
export declare type __ΩGenericPureFunction = any[];
export declare type __ΩErrorsPureFunction = any[];
export declare type __ΩPureFunction = any[];
export declare type __ΩPureFunctionClosure = any[];
export declare type __ΩPureFunctionData = any[];
export declare type __ΩCompiledPureFunction = any[];
export declare type __ΩAnyFn = any[];
export declare type __ΩJitFnArgs = any[];
export declare type __ΩJitCompiledFnData = any[];
export declare type __ΩJitCompiledFn = any[];
export declare type __ΩJitCompiledFunctions = any[];
export declare type __ΩSerializableJITFunctions = any[];
export declare type __ΩJitFunctionsHashes = any[];
export declare type __ΩJsonStringifyFn = any[];
export declare type __ΩFromJsonValFn = any[];
export declare type __ΩToJsonValFn = any[];
export declare type __ΩTypeErrorsFn = any[];
export declare type __ΩIsTypeFn = any[];
export declare type __ΩToCodeFn = any[];
export declare type __ΩJitFunctionsCache = any[];
export declare type __ΩPureFunctionsCache = any[];
export declare type __ΩSrcCodeJitCompiledFn = any[];
export declare type __ΩSrcCodeCompiledPureFunction = any[];
export declare type __ΩSrcCodeJITCompiledFnsCache = any[];
export declare type __ΩSrcCodePureFunctionsCache = any[];
export declare type __ΩAnyObject = any[];
export declare type __ΩAnyClass = any[];
export declare type __ΩSerializableClass = any[];
export declare type __ΩDeserializeClassFn = any[];
export declare type __ΩMutable = any[];
export declare type __ΩJSONValue = any[];
export declare type __ΩJSONString = any[];
export declare type __ΩDataOnly = any[];
//# sourceMappingURL=types.d.ts.map