/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###### !IMPORTANT: all imports should be types only to prevent circular dependencies ######
import type {Type, TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature, TypeTuple} from '@deepkit/type';
import type {TypeFormatParams} from '@mionkit/core/src/types';
import type {JitFunctions} from './constants';
import type {ReflectionSubKind} from './constants.kind';
import type {BaseRunTypeFormat} from './lib/baseRunTypeFormat';

export type StrNumber = string | number;
export type jitCode = string | undefined;

// ############################################ RunTypes ############################################

export type SrcType<T extends Type = Type> = T & {
    readonly _rt: RunType;
    readonly subKind?: SubKind;
};

/**
 * Runtime Metadata for a typescript types.
 */
export interface RunType {
    readonly src: SrcType<any>;
    getKindName(): string;
    getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    mock: (options?: DeepPartial<RunTypeOptions>) => Promise<any>;

    // ######## JIT functions ########
    /** Returns a unique id for the type. it can be a long string similar to the typescript type itself but as shorter as possible */
    getTypeID(): StrNumber;
    getJitHash: () => string;
    createJitFunction(jitFn: JitFn, opts?: RunTypeOptions): (...args: any[]) => any;
}

export type JSONValue = StrNumber | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;
export type JSONString = string;

export type SubKind = (typeof ReflectionSubKind)[keyof typeof ReflectionSubKind];
export type RunTypeVisitor = (deepkitType: Type, parents: RunType[], opts: RunTypeOptions) => RunType;
export type SrcCollection = Type & {types: Type[]};
export type SrcMember = Type & {type: Type};

export interface JitCompilerOpts {
    readonly fnID: string;
    readonly typeID: StrNumber;
    readonly jitFnHash: string;
    readonly opts: RunTypeOptions;
}

export interface RunTypeChildAccessor extends RunType {
    /**
     * Returns the position of the child within the parent type.
     */
    getChildIndex(comp?: JitCompilerOpts): number;
    /**
     * Returns the variable name for the compiled child
     * ie: for an object property, it should return the property name
     * ie: for an array member, it should return the index variable name
     */
    getChildVarName(comp?: JitCompilerOpts): StrNumber;
    /** Returns the static member name or literal as it should be inserted in source code.
     * ie: for an object property, it should return the property name as a string encapsulated in quotes, ie: prop => 'prop'
     * ie: for an array member, it should return the varName as is a dynamic value, ie: index => index
     */
    getChildLiteral(comp?: JitCompilerOpts): StrNumber;
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
    /** used to compile json stringify, items with the flag set will omit outputting comma after the item */
    skipCommas?: boolean;
}
export interface CustomVλl {
    vλl: string;
    isStandalone?: boolean;
    useArrayAccessor?: boolean;
}

export interface RunTypeOptions {
    /** slice parameters when parsing functions */
    paramsSlice?: {start?: number; end?: number};
    mock?: MockOptions;
}

export type PartialRunTypeOptions = DeepPartial<RunTypeOptions>;

// ############################################ JIT FUNCTIONS ############################################

export type JitFn = (typeof JitFunctions)[keyof typeof JitFunctions];

// one of the existing jit functions ids
export type JitFnID = JitFn['id'];

export type AnyFunction = TypeMethodSignature | TypeCallSignature | TypeFunction | TypeMethod;
export type AnyParameterListRunType = AnyFunction | TypeTuple;

// ############################################ MOCKING ############################################

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
    optionalPropertyProbability?: Record<StrNumber, number>; // TODO change to a record of MockOptions
    parentObj?: Record<StrNumber | symbol, any>;
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
    fnID: JitFnID;
}

export type DKAnnotation = {
    name: string;
    options: SrcType;
};

export type FormatAnnotation = DKAnnotation & {
    params?: TypeFormatParams;
    formatter: BaseRunTypeFormat;
};

// ############################################ OTHERS ############################################

/** Any Class */
export interface AnyClass<T = any> {
    new (...args: any[]): T;
}

export type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};

export type DeepRequired<T> = T extends object
    ? {
          [P in keyof T]?: DeepRequired<T[P]>;
      }
    : T;

export type DeepPartial<T> = T extends object
    ? {
          [P in keyof T]?: DeepPartial<T[P]>;
      }
    : T;
