/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* ###############
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */
export type StrNumber = string | number;

/**
 * Interface defining the shape of jitUtils
 *
 * !! Important: this needs to be defined as a type for reflection to work correctly
 * !! we can not use  typeof jitUtils
 */
export interface JITUtils {
    /** optimized function to convert an string into a json string wrapped in double quotes */
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
    // TODO: all functions bellow could be moved to pure functions instead being part of jitUtils
    getUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): StrNumber[];
    hasUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): boolean;
    err(pλth: readonly StrNumber[], εrr: RunTypeError[], expected: string, accessPath?: readonly StrNumber[]): void;
    formatErr(
        pλth: StrNumber[],
        εrr: RunTypeError[],
        expected: string,
        fmtName: string,
        paramName: string,
        paramVal: string | number | boolean | bigint,
        fmtPath: StrNumber[],
        accessPath?: StrNumber[],
        fmtAccessPath?: StrNumber[]
    ): void;
    safeKey(value: any): any;
}

// ########################################## Options ##########################################

export type CoreOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
};

// ##########################################  Errors ##########################################

/** Base parameters for TypedError */
export interface TypedErrorParams<ErrType extends StrNumber> {
    /** Error type, can be used as discriminator in union types switch, etc*/
    type: ErrType;
    /** the error message */
    message?: string;
    /** original error used to create the TypedError */
    originalError?: Error;
}

/** Any error triggered by hooks or routes must follow this interface, returned errors in the body also follows this interface */
export interface RpcErrorParams<ErrType extends StrNumber, ErrData = any> {
    /** Error type, can be used as discriminator in union types switch, etc*/
    type: ErrType;
    /** id of the error. */
    id?: number | string;
    /** response status code */
    statusCode: number;
    /** the message that will be returned in the response */
    publicMessage?: string;
    /**
     * the error message, it is private and wont be returned in the response.
     * If not defined, it is assigned from originalError.message or publicMessage.
     */
    message?: string;
    /** options data related to the error, ie validation data */
    errorData?: ErrData;
    /** original error used to create the RpcError */
    originalError?: Error;
}

export interface RpcErrorWithPublic<ErrType extends StrNumber, ErrData = any> extends RpcErrorParams<ErrType, ErrData> {
    publicMessage: string;
}

export interface RpcErrorWithPrivate<ErrType extends StrNumber, ErrData = any> extends RpcErrorParams<ErrType, ErrData> {
    message: string;
}

/** Error data returned to the clients  */
export interface PublicRpcError<ErrType extends StrNumber, ErrData = any>
    extends Omit<RpcErrorParams<ErrType, ErrData>, 'publicMessage' | 'originalError'> {
    isΣrrθr: true;
    type: ErrType;
    /**
     * When a RpcError gets anonymized the publicMessage becomes the message.
     * RpcError.publicMessage => PublicRpcError.message
     * */
    message: string;
    statusCode: number;
    errorData?: ErrData;
}

export type AnyErrorParams<ErrType extends StrNumber, ErrData = any> =
    | RpcErrorWithPublic<ErrType, ErrData>
    | RpcErrorWithPrivate<ErrType, ErrData>;

export interface RunTypeError {
    /**
     * Path the the property that failed validation if the validated item was an object class, etc..
     * Index if item that failed validation was in an array.
     * null if validated item was a single property */
    path: StrNumber[];
    /** the type of the expected data */
    expected: string;
    format?: TypeFormatError;
    // typeName?: string; // tyeName can not be included as two types could Have the same typeID and different names
}

// ########################################### TYPE FORMATS ##########################################

export type TypeFormatError = {
    /** The name of the format that failed */
    name: string; // the name of the format that failed
    /** Expected value, for larger Values, regexp and others the error reason is returned instead */
    val: StrNumber | boolean | bigint | (StrNumber | boolean | bigint)[];
    /**
     * The path to the section of the format that failed.
     * ie: for an email that failed the TLD part, the path should be ['domain', 'tld']
     * ie: for an email that has character not allowed in the local part, the path should be ['localPart']
     * */
    formatPath: StrNumber[];
};

export type FormatParamLiteral = string | number | boolean | RegExp | bigint;
export type TypeFormatValue =
    | FormatParamLiteral
    | readonly TypeFormatValue[]
    | {[key: string]: TypeFormatValue | undefined | never}; // undefined is used to allow optional properties
export type FormatParamMeta<L extends TypeFormatValue = TypeFormatValue> = {
    /** Value of the format param, can ONLY be a Literal Value */
    val: L;
    /** Error message in case validation fails due to this value, should be a unique reason  */
    errorMessage: string;
    /**  Description of the format param, can be used to generate documentation */
    desc?: string;
};
export type FormatParam<L extends TypeFormatValue> = L | FormatParamMeta<L>;
export type TypeFormatParams = Record<string, TypeFormatValue | undefined | never>;
export type TypeFormatParsedParams = {__jitId: string; [key: string]: TypeFormatValue};

/**
 * Functions that can be used by jitCode.
 * These function must not have external dependencies, use variables from outside the function scope, do not have side effects, etc.
 * These function can be correctly serialized/deserialized using function.toString() method.
 * These function can not be anonym and must have an unique name.
 */
export type PureFunctionDeps = Record<string, PureFunction>;
export type GenericPureFunction<P extends TypeFormatValue> = (val: any, formatParams: P, deps: PureFunctionDeps) => any;
export type ErrorsPureFunction<P extends TypeFormatValue> = (
    val: any,
    pλth: StrNumber[],
    εrr: RunTypeError[],
    expected: string,
    formatName: string,
    formatParams: P,
    formatPath: StrNumber[],
    deps: PureFunctionDeps,
    accessPath?: StrNumber[],
    fmtAccessPath?: StrNumber[]
) => RunTypeError[];
export type PureFunction = (...args: any[]) => any;

/**
 * Pure function that return an array with a list of invalid format properties.
 * ie: if a string should be maxLength = 5 and that string is 6 characters long, the function should return {invalid:['maxLength']}
 */
export type PureFunctionClosure = (jitUtils: JITUtils) => PureFunction;

/** Data for a pure function that can be serialized and deserialized. */
export interface PureFunctionData {
    /** The names of the arguments of the function */
    readonly paramNames: string[];
    /** The code of the function closure */
    readonly code: string;
    /** Unique id of the function */
    readonly pureFnHash: string;
    /** The list of all pure functions that are used by this function and it's children. */
    readonly dependencies: Set<string>;
}

export interface CompiledPureFunction extends PureFunctionData {
    closureFn: PureFunctionClosure;
    fn?: PureFunction;
}

// ########################################### COMPILER ##########################################

export type AnyFn = (...args: any[]) => any;
/**
 * The argument names of the function to be compiled. The order of properties is important as must the same as the function args.
 * ie: {vλl: 'val', arg1: 'arg1', error: 'err'} for the function (vλl, arg1, eArr) => any
 */
export type JitFnArgs = {
    /** The name of the value of to be */
    vλl: string;
    /** Other argument names */
    [key: string]: string;
};

export interface JitCompiledFnData {
    readonly typeName: string;
    /** The id of the function (operation) to be compiled (isType, typeErrors, toJsonVal, fromJsonVal, etc) */
    readonly fnID: string;
    /** Unique id of the function */
    readonly jitFnHash: string;
    /** The names of the arguments of the function */
    readonly args: JitFnArgs;
    /** Default values for the arguments */
    readonly defaultParamValues: JitFnArgs;
    /**
     * This flag is set to true when the result of a jit compilation is a no operation (empty function).
     * if this flag is set to true, the function should not be called as it will not do anything.
     */
    readonly isNoop?: boolean;
    /** Code for the jit function. after the operation has been compiled */
    readonly code: string;
    /** The list of all jit functions that are used by this function and it's children. */
    readonly dependenciesSet: Set<string>;
    readonly pureFnDependencies: Set<string>;
    /** function param names if the compiled type is function params */
    paramNames?: string[];
}

// ########################################### JIT FUNCTIONS ###########################################

export interface JitCompiledFn<Fn extends AnyFn = AnyFn> extends JitCompiledFnData {
    /** The closure function that contains the jit function, this one contains the context code */
    readonly closureFn: (utl: JITUtils) => Fn;
    /** The Jit Generated function once the compilation is finished */
    readonly fn: Fn;
}

export interface JitCompiledFunctions {
    isType: JitCompiledFn<IsTypeFn>;
    typeErrors: JitCompiledFn<TypeErrorsFn>;
    toJsonVal: JitCompiledFn<ToJsonValFn>;
    fromJsonVal: JitCompiledFn<FromJsonValFn>;
    jsonStringify: JitCompiledFn<JsonStringifyFn>;
    toBinary: JitCompiledFn<ToBinaryFn>;
    fromBinary: JitCompiledFn<FromBinaryFn>;
}
export interface SerializableJITFunctions {
    isType: JitCompiledFnData;
    typeErrors: JitCompiledFnData;
    toJsonVal: JitCompiledFnData;
    fromJsonVal: JitCompiledFnData;
    jsonStringify: JitCompiledFnData;
    toBinary: JitCompiledFnData;
    fromBinary: JitCompiledFnData;
}
export interface JitFunctionsHashes {
    isType: string;
    typeErrors: string;
    toJsonVal: string;
    fromJsonVal: string;
    jsonStringify: string;
    toBinary: string;
    fromBinary: string;
}
export type JsonStringifyFn = (value: any) => JSONString;
export type FromJsonValFn = (value: JSONValue) => any;
export type ToJsonValFn = (value: any) => JSONValue;
export type TypeErrorsFn = (value: any) => RunTypeError[];
export type IsTypeFn = (value: any) => boolean;
export type ToCodeFn = (value: any) => string;
export type ToBinaryFn = (value: any) => Uint8Array;
export type FromBinaryFn = (bson: Uint8Array) => any;

export type JitFunctionsCache = Record<string, JitCompiledFn>;
export type PureFunctionsCache = Record<string, CompiledPureFunction>;

// ########################################### JIT SRC CODE ####################################

// TODO: bellow way of declaring thing by using omit and and redeclaring the fn property have a bug in deepkit type compiler, so we need to find another way to do it
// export type SrcCodeJitCompiledFn = Omit<JitCompiledFn, 'fn'> & {
//     // jit fn can not be compiled to code as contains references to context code and jitUtils
//     readonly fn: undefined;
// }
// export type SrcCodeCompiledPureFunction = Omit<CompiledPureFunction, 'fn'> & {
//     // pure fn can not be compiled to code as contains references to context code and jitUtils
//     readonly fn: undefined;
// }

export interface SrcCodeJitCompiledFn extends JitCompiledFnData {
    /** The closure function that contains the jit function, this one contains the context code */
    readonly closureFn: (utl: JITUtils) => AnyFn;
    /** The Jit Generated function once the compilation is finished */
    readonly fn: undefined;
}
export interface SrcCodeCompiledPureFunction extends PureFunctionData {
    /** The closure function that contains the jit function, this one contains the context code */
    readonly closureFn: (utl: JITUtils) => AnyFn;
    /** The Jit Generated function once the compilation is finished */
    readonly fn: undefined;
}
export type SrcCodeJITCompiledFnsCache = Record<string, SrcCodeJitCompiledFn>;
export type SrcCodePureFunctionsCache = Record<string, SrcCodeCompiledPureFunction>;

// ########################################## PUBLIC METHOD ##########################################

/** Serializable JIT hashes type for sharing between client and server */
export type SerializableJitHashes = {
    isType: string;
    typeErrors: string;
    toJsonVal: string;
    fromJsonVal: string;
    jsonStringify: string;
    toBinary: string;
    fromBinary: string;
};

/** Shared interface for PublicMethod that can be used between client and server without handler dependencies */
export interface SerializablePublicMethod {
    /** Method type identifier */
    type: number;
    /** Unique identifier for the method */
    id: string;
    /** Names of header parameters if this is a header method */
    headerNames?: string[];
    /** Names of method parameters */
    paramNames?: string[];
    /** Hashes of JIT functions used by the method parameters */
    paramsJitHashes: SerializableJitHashes;
    /** Hashes of JIT functions used by the method return value */
    returnJitHashes: SerializableJitHashes;
    /** Array of hook IDs associated with this method */
    hookIds?: string[];
    /** Path pointers for nested route structures */
    pathPointers?: string[][];
}

export interface SerializableMethodsData {
    methods: Record<string, SerializablePublicMethod>;
    deps: Record<string, JitCompiledFnData>;
    purFnDeps: Record<string, PureFunctionData>;
}

// ########################################## other #########################################

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

// StrNumber is already defined at the top of the file
export type JSONValue = StrNumber | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;
export type JSONString = string;

// prettier-ignore
type Native = Date | RegExp | URL | URLSearchParams | Blob | File | FileList | FormData | ArrayBuffer | SharedArrayBuffer | DataView | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array | BigInt64Array | BigUint64Array;

/** Typescript mapping type that stripes methods and only keep properties.
 * it takes into account, dates, objects, classes, arrays, maps and sets.
 */
export type DataOnly<T> = T extends object
    ? T extends Native
        ? T
        : T extends Function
          ? never
          : T extends new (...args: any[]) => any
            ? never
            : T extends Array<infer U>
              ? Array<DataOnly<U>>
              : T extends Map<infer K, infer V>
                ? Map<DataOnly<K>, DataOnly<V>>
                : T extends Set<infer U>
                  ? Set<DataOnly<U>>
                  : {[K in keyof T as T[K] extends Function ? never : K]: DataOnly<T[K]>}
    : T;

// TEST TYPES FOR PlainObject

// class A {
//     n1?: number;
//     s?: string;
//     d?: Date;
//     map?: Map<string, RegExp>;
//     set?: Set<URL>;
//     arr?: A[];
//     method() {
//         return 'hello';
//     }
//     arrow = () => 'hello';
// }

// type PlainInterface = PlainObject<{
//     n1: number;
//     s: string;
//     d: Date;
//     a: A;
//     map: Map<string, A>;
//     set: Set<A>;
//     arr: A[];
//     method(): string;
//     arrow: () => string;
// }>;

// type PlainClass = PlainObject<A>;
// type PlainSet = PlainObject<Set<A>>;
// type PlainMap = PlainObject<Map<string, A>>;
