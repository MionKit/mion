/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###### !IMPORTANT: all imports should be types only to prevent circular dependencies ######
import type {Type, TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature, TypeTuple} from '@deepkit/type';
import type {BaseCompiler} from './lib/jitCompiler';
import type {JITUtils} from './lib/jitUtils';
import type {JitFunctions} from './constants';
import type {ReflectionSubKind} from './constants.kind';
import type {JitRunTypeFormatter} from './lib/jitFormatters';

// ###################### RunTypes ######################

/**
 * Runtime Metadata for a typescript types.
 */
export interface RunType {
    readonly src: SrcType<any>;
    getKindName(): string;
    getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    mock: (options?: Partial<MockOptions>) => any;

    // ######## JIT functions ########
    getJitId(): string | number;
    getJitHash: () => string;
    createJitFunction(jitFn: JitFn): (...args: any[]) => any;
}

export type JSONValue = string | number | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;
export type JSONString = string;

export type SubKind = (typeof ReflectionSubKind)[keyof typeof ReflectionSubKind];
export type RunTypeVisitor = (deepkitType: Type, parents: RunType[], opts: RunTypeOptions) => RunType;
export type SrcType<T extends Type = Type> = T & {
    readonly _rt: RunType;
    readonly subKind?: SubKind;
};
export type SrcCollection = Type & {types: Type[]};
export type SrcMember = Type & {type: Type};

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

export interface RunTypeChildAccessor extends RunType {
    /**
     * Returns the position of the child within the parent type.
     */
    getChildIndex(): number;
    /**
     * Returns the variable name for the compiled child
     * ie: for an object property, it should return the property name
     * ie: for an array member, it should return the index variable name
     */
    getChildVarName(): string | number;
    /** Returns the static member name or literal as it should be inserted in source code.
     * ie: for an object property, it should return the property name as a string encapsulated in quotes, ie: prop => 'prop'
     * ie: for an array member, it should return the varName as is a dynamic value, ie: index => index
     */
    getChildLiteral(): string | number;
    /** Returns true if the property name is safe to use as a property accessor in source code
     * ie: return false if a property can be accessed using the dot notation, ie: obj.prop, for properties that are numbers return false
     * ie: for an array member return true as it should be accessed using the array accessor, ie: obj[index]
     */
    useArrayAccessor(): boolean;
    /** Returns true if the property is optional */
    isOptional(): boolean;
    /** In Some situation (rest params) the access logic might be set in the child node instead the parent
     * so we want to skip setting the accessor in the parent.  */
    skipSettingAccessor?(): boolean;
}

export interface JitConfig {
    readonly skipJit: boolean;
    readonly jitId: string | number;
}

export interface CustomVλl {
    vλl: string;
    isStandalone?: boolean;
    useArrayAccessor?: boolean;
}

export interface RunTypeOptions {
    /** slice parameters when parsing functions */
    paramsSlice?: {start?: number; end?: number};
}

// ###################### JIT FUNCTIONS ######################

export type JitFn = (typeof JitFunctions)[keyof typeof JitFunctions];

// one of the existing jit functions ids
export type JitFnID = JitFn['id'];

export type AnyFn = (...args: any[]) => any;
export interface JitFnData<Fn extends AnyFn> {
    argNames: string[];
    code: string;
    fn: Fn;
}

export type SerializableJitFn<Fn extends AnyFn> = Omit<JitFnData<Fn>, 'fn'>;

export interface RunTypeError {
    /**
     * Path the the property that failed validation if the validated item was an object class, etc..
     * Index if item that failed validation was in an array.
     * null if validated item was a single property */
    path: (string | number)[];
    /** the type of the expected data */
    expected: string;
    format?: TypeFormatError;
    // typeName?: string; // tyeName can not be included as two types could Have the same jitId and different names
}

export type IsTypeFn = (value: any) => boolean;
export type TypeErrorsFn = (value: any) => RunTypeError[];
export type ToJsonValFn = (value: any) => JSONValue;
export type FromJsonValFn = (value: JSONValue) => any;
export type JsonStringifyFn = (value: any) => JSONString;

export interface JITCompiledFunctions {
    isType: JitFnData<IsTypeFn>;
    typeErrors: JitFnData<TypeErrorsFn>;
    toJsonVal: JitFnData<ToJsonValFn>;
    fromJsonVal: JitFnData<FromJsonValFn>;
    jsonStringify: JitFnData<JsonStringifyFn>;
}

export interface SerializableJITFunctions {
    isType: SerializableJitFn<IsTypeFn>;
    typeErrors: SerializableJitFn<TypeErrorsFn>;
    toJsonVal: SerializableJitFn<ToJsonValFn>;
    fromJsonVal: SerializableJitFn<FromJsonValFn>;
    jsonStringify: SerializableJitFn<JsonStringifyFn>;
}

export type unwrappedToJsonValFn = (utils: JITUtils, value: any) => JSONValue;
export type unwrappedFromJsonValFn = (utils: JITUtils, value: JSONValue) => any;
export type unwrappedJsonStringifyFn = (utils: JITUtils, value: any) => JSONString;

export interface UnwrappedJITFunctions {
    isType: JitFnData<IsTypeFn>;
    typeErrors: JitFnData<TypeErrorsFn>;
    toJsonVal: JitFnData<unwrappedToJsonValFn>;
    fromJsonVal: JitFnData<unwrappedFromJsonValFn>;
    jsonStringify: JitFnData<unwrappedJsonStringifyFn>;
}

export interface JitCompiled
    extends Pick<
        BaseCompiler,
        | 'fnId'
        | 'args'
        | 'defaultParamValues'
        | 'code'
        | 'jitFnHash'
        | 'jitId'
        | 'dependenciesSet'
        | 'pureFnDependencies'
        | 'isNoop'
    > {
    fn: (...args: any[]) => any;
}

export interface SerializableJit extends Omit<JitCompiled, 'fnId' | 'dependenciesSet'> {
    // dependency list is serialized as a string array
    dependencies: string[];
}

export type SerializedOperations = Record<string, SerializableJit>;

export type AnyFunction = TypeMethodSignature | TypeCallSignature | TypeFunction | TypeMethod;
export type AnyParameterListRunType = AnyFunction | TypeTuple;

// ###################### MOCK #####################

export interface MockOptions {
    anyValuesList: any[];
    minNumber?: number;
    maxNumber?: number;
    minDate?: number;
    maxDate?: number;
    enumIndex?: number;
    objectList: object[];
    promiseTimeOut: number;
    promiseReject?: string | Error | any;
    regexpList: RegExp[];
    maxRandomStringLength: number;
    stringLength?: number;
    stringCharSet: string;
    symbolLength?: number;
    symbolCharSet?: string;
    symbolName?: string;
    maxRandomItemsLength: number;
    arrayLength?: number;
    /** probability to generate options types, number between 0 and 1,
     * bigger values have bigger probability of generate the optional property */
    optionalProbability: number;
    /** probability to generate an specific property of an object, number between 0 and 1 */
    optionalPropertyProbability?: Record<string | number, number>; // TODO change to a record of MockOptions
    parentObj?: Record<string | number | symbol, any>;
    /** the index of the object to mock withing the union */
    unionIndex?: number;
    tupleOptions?: MockOptions[];
    paramsOptions?: MockOptions[];
    maxStackDepth: number;
    maxMockRecursion: number;
}

export interface MockOperation extends MockOptions {
    /** Used for mocking object with circular references */
    stack: RunType[];
}

// ###################### TYPE FORMATS #####################

export type DKAnnotation = {
    name: string;
    options: SrcType;
};

export type FormatAnnotation = DKAnnotation & {
    params?: TypeFormatParams;
    formatter: JitRunTypeFormatter;
};

export type TypeFormatError = {
    name?: string; // the name of the format that failed
    // list of properties that failed validation
    invalid?: InvalidFormatParams;
};

type ParamLiteral = string | number | boolean | RegExp;
export type TypeFormatValue = ParamLiteral | TypeFormatValue[] | {[key: string]: TypeFormatValue};
export type TypeFormatParams = Record<string, TypeFormatValue>;
export type TypeFormatParsedParams = {__jitId: string; [key: string]: TypeFormatValue};

// same as TypeFormatParams but Regexp values are replaced by string
type InvalidParamLiteral = string | number | boolean;
export type InvalidFormatParam = InvalidParamLiteral | InvalidParamLiteral[] | {[key: string]: InvalidParamLiteral};
export type InvalidFormatParams = Record<string, TypeFormatValue>;
// export type InvalidFormatParams<T extends TypeFormatParams = TypeFormatParams> = {
//     [K in keyof T]: T[K] extends RegExp ? string : T[K];
// };

/**
 * Functions that can be used by jitCode.
 * These function must not have external dependencies, use variables from outside the function scope, do not have side effects, etc.
 * These function can be correctly serialized/deserialized using function.toString() method.
 * These function can not be anonym and must have an unique name.
 */
export type PureFunction<P extends TypeFormatParams> = GenericPureFunction<P> | ErrorsPureFunction<P>;
export type ErrorsPureFunction<P extends TypeFormatParams> = (val: any, params: P) => InvalidFormatParams | undefined;
export type GenericPureFunction<P extends TypeFormatParams> = (val: any, params: P) => any;

/**
 * Pure function that return an array with a list of invalid format properties.
 * ie: if a string should be maxLength = 5 and that string is 6 characters long, the function should return {invalid:['maxLength']}
 */
export type PureFunctionWithContext<P extends TypeFormatParams> = (jitUtils: JITUtils) => PureFunction<P>;

export type CompiledPureFunction = {
    originFnWithCtx: PureFunctionWithContext<any>;
    fn?: PureFunction<any>;
    paramNames: string[];
    body: string;
    name: string;
    dependencies: Set<string>;
};

// ###################### OTHERS #####################

/** Any Class */
export interface AnyClass<T = any> {
    new (...args: any[]): T;
}

export type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};

export type DeepRequired<T> = {
    [K in keyof T]-?: T[K] extends object ? DeepRequired<T[K]> : T[K];
};

export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
