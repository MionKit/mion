/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type, TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature} from './lib/_deepkit/src/reflection/type';
import type {BaseCompiler} from './lib/jitCompiler';
import type {JITUtils} from './lib/jitUtils';
import type {JitFnIDs} from './constants';
import type {ReflectionSubKind} from './constants.kind';

/**
 * Runtime Metadata for a typescript types.
 */
export interface RunType {
    readonly src: SrcType<any>;
    getName(): string;
    getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    mock: (options?: Partial<MockOptions>) => any;

    // ######## JIT functions ########
    getJitId(): string | number;
    getJitHash: () => string;
    createJitFunction(name: JitFnID): (...args: any[]) => any;
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

// on of the values of JitFnIDs object
export type JitFnID = (typeof JitFnIDs)[keyof typeof JitFnIDs];

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

export interface JitConstants {
    readonly skipJit: boolean;
    readonly skipJsonEncode: boolean;
    readonly skipJsonDecode: boolean;
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

/**
 * Jit Compile Operation unit
 * EXPRESSION: the result of each type compilations is expected to be a js expression that resolves to a single value, and can be used wit operators like +, -, *, /, ||, &&, etc.
 * i.e: expType1 + expType2, expType1 || expType2, etc. Expressions cant contain return statements, if statements, semicolons, etc.
 * if a code block is needed in an expression it must be wrapped in a self invoking function. i.e: (() => { //... code block })()
 * STATEMENT: the result of each type compilations is expected to be a js statement that can be used in a block of code, and can contain return statements, if statements, semicolons, etc.
 * BLOCK: the main difference is that and statement can be returned directly ie: return statementCode;
 * while in a block the main value must be returned after code block execution. ie: blockCode; return vλl;
 */
export type CodeUnit = 'EXPRESSION' | 'STATEMENT' | 'BLOCK';

export interface CompiledOperation
    extends Pick<
        BaseCompiler,
        | 'fnId'
        | 'args'
        | 'defaultParamValues'
        | 'code'
        | 'contextCode'
        | 'jitFnHash'
        | 'jitId'
        | 'directDependencies'
        | 'childDependencies'
    > {
    fn: (...args: any[]) => any;
}

export interface SerializableJit extends Omit<CompiledOperation, 'fnId' | 'directDependencies' | 'childDependencies'> {
    // combination of childDependencies and directDependencies
    dependencies: string[];
}

export type SerializedOperations = Record<string, SerializableJit>;

export interface JitJsonEncoder {
    decodeFromJson: (vλl: string) => string;
    encodeToJson: (vλl: string) => string;
    stringify: (vλl: string) => string;
}

type AnyFn = (...args: any[]) => any;
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
}

export type isTypeFn = (value: any) => boolean;
export type typeErrorsFn = (value: any) => RunTypeError[];
export type jsonEncodeFn = (value: any) => JSONValue;
export type jsonDecodeFn = (value: JSONValue) => any;
export type jsonStringifyFn = (value: any) => JSONString;

export interface JITCompiledFunctions {
    isType: JitFnData<isTypeFn>;
    typeErrors: JitFnData<typeErrorsFn>;
    jsonEncode: JitFnData<jsonEncodeFn>;
    jsonDecode: JitFnData<jsonDecodeFn>;
    jsonStringify: JitFnData<jsonStringifyFn>;
}

export interface SerializableJITFunctions {
    isType: SerializableJitFn<isTypeFn>;
    typeErrors: SerializableJitFn<typeErrorsFn>;
    jsonEncode: SerializableJitFn<jsonEncodeFn>;
    jsonDecode: SerializableJitFn<jsonDecodeFn>;
    jsonStringify: SerializableJitFn<jsonStringifyFn>;
}

export type unwrappedJsonEncodeFn = (utils: JITUtils, value: any) => JSONValue;
export type unwrappedJsonDecodeFn = (utils: JITUtils, value: JSONValue) => any;
export type unwrappedJsonStringifyFn = (utils: JITUtils, value: any) => JSONString;

export interface UnwrappedJITFunctions {
    isType: JitFnData<isTypeFn>;
    typeErrors: JitFnData<typeErrorsFn>;
    jsonEncode: JitFnData<unwrappedJsonEncodeFn>;
    jsonDecode: JitFnData<unwrappedJsonDecodeFn>;
    jsonStringify: JitFnData<unwrappedJsonStringifyFn>;
}

/** Any Class */
export interface AnyClass<T = any> {
    new (...args: any[]): T;
}

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
    maxStackDepth: number;
    maxMockRecursion: number;
}

export interface MockOperation extends MockOptions {
    /** Used for mocking object with circular references */
    stack: RunType[];
}

export type AnyFunction = TypeMethodSignature | TypeCallSignature | TypeFunction | TypeMethod;

export type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};
