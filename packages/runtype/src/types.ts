/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type, TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature} from './_deepkit/src/reflection/type';
import type {JitCompileOp, JitTypeErrorCompileOp} from './jitOperation';
import {JITUtils} from './jitUtils';

export type JSONValue = string | number | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;
export type JSONString = string;

export type RunTypeVisitor = (deepkitType: Type, parents: RunType[], opts: RunTypeOptions) => RunType;
export type DKwithRT = Type & {_rt: RunType};

/**
 * The argument names of the function to be compiled. The order of properties is important as must the same as the function args.
 * ie: {vλl: 'vλl', arg1: 'arg1', error: 'eArr'} for the function (vλl, arg1, eArr) => any
 */
export type JitFnArgs = {
    /** The name of the value of to be */
    vλl: string;
    /** Other argument names */
    [key: string]: string;
};

export type StackItem = {
    /** current compile stack full variable accessor */
    vλl: string;
    /** current compile stack variable accessor */
    rt: RunType;
};

/**
 * Runtime Metadata for a typescript types.
 */
export interface RunType extends JitCompilerFunctions {
    readonly src: Type;
    getName(): string;
    getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    getJitConstants(stack?: RunType[]): JitConstants;
    mock: (mockContext?: MockContext) => any;
    compile: () => JITCompiledFunctions;
    getJitId(): string | number;
}

export interface RunTypeChildAccessor extends RunType {
    /**
     * Returns the position of the child in the parent type.
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
    isOptional(): boolean;
}

export type JitConstants = {
    readonly skipJit: boolean;
    readonly skipJsonEncode: boolean;
    readonly skipJsonDecode: boolean;
    readonly jitId: string | number;
    readonly isCircularRef: boolean;
};

export interface JitCompilerFunctions {
    /**
     * JIT code validation code
     * should not include anything that is purely the validation of the type, ie function wrappers.
     * this code should not use return statements, it should be a single line of code that evaluates to a boolean
     * this code should not contain any sentence breaks or semicolons.
     * ie: compileIsType = () => `typeof vλl === 'string'`
     */
    compileIsType(jitCompileContext: JitCompileOp): string;
    /**
     * JIT code Validation + error info
     * Similar to validation code but instead of returning a boolean it should assign an error message to the errorsName
     * This is an executable code block and can contain multiple lines or semicolons
     * ie:  validateCodeWithErrors = () => `if (typeof vλl !== 'string') ${cop.args.εrrors} = 'Expected to be a String';`
     * path is a string that represents the path to the property being validated.
     * path is calculated at runtime so is an expression like 'path1' + '/' + 'path2' + '/' + 'path3'
     */
    compileTypeErrors(jitCompileContext: JitTypeErrorCompileOp): string;
    /**
     * JIT code to transform from type to an object that can be serialized using json
     * this code should not use return statements, it should be a single line of code that evaluates to a json compatible type.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: compileJsonEncode = () => `vλl.toString()`
     * */
    compileJsonEncode(jitCompileContext: JitCompileOp): string;
    /**
     * JIT code to transform from json to type so type can be deserialized from json
     * this code should not use return statements, it should be a single line that receives a json compatible type and returns a deserialized value.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: compileJsonDecode = () => `BigInt(vλl)`
     *
     * For security reason decoding ignores any properties that are not defined in the type.
     * So is your type is {name: string} and the json is {name: string, age: number} the age property will be ignored.
     * */
    compileJsonDecode(jitCompileContext: JitCompileOp): string;
    /**
     * JIT code to transform a type directly into s json string.
     * when serializing to json normally we need first to prepare the object using compileJsonEncode and then JSON.stringify().
     * this code directly outputs the json string and saves traversing the type twice
     * stringify is always strict
     */
    compileJsonStringify(jitCompileContext: JitCompileOp): string;
}

export interface RunTypeOptions {
    /**
     * Json encoding/decoding will eliminate unknown properties
     * ie: if your type is {name: string} and the json is {name: string, age: number} the age property will be removed en encoding/decoding.
     */
    strictJSON?: boolean;

    /** slice parameters when parsing functions */
    paramsSlice?: {start?: number; end?: number};
}

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

export interface RunTypeValidationError {
    /**
     * Path the the property that failed validation if the validated item was an object class, etc..
     * Index if item that failed validation was in an array.
     * null if validated item was a single property */
    path: string;
    /** the type of the expected data */
    expected: string;
}

export type isTypeFn = (value: any) => boolean;
export type typeErrorsFn = (value: any) => RunTypeValidationError[];
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

/** Serializable classes
 * Must have constructor with no arguments  */
export interface SerializableClass<T = any> {
    new (): T;
}

/** Any Class */
export interface AnyClass<T = any> {
    new (...args: any[]): T;
}

export type CompileFn =
    | JitCompilerFunctions['compileIsType']
    | JitCompilerFunctions['compileJsonEncode']
    | JitCompilerFunctions['compileJsonDecode']
    | JitCompilerFunctions['compileJsonStringify'];

export type CompileFnTypeErrors = JitCompilerFunctions['compileTypeErrors'];

export type CompileFnKey = keyof Pick<
    JitCompilerFunctions,
    'compileIsType' | 'compileJsonEncode' | 'compileJsonDecode' | 'compileJsonStringify'
>;

interface MockOptions {
    anyValuesLis?: any[];
    minNumber?: number;
    maxNumber?: number;
    minDate?: number;
    maxDate?: number;
    enumIndex?: number;
    objectList?: object[];
    promiseTimeOut?: number;
    promiseReject?: string | Error | any;
    regexpList?: RegExp[];
    stringLength?: number;
    stringCharSet?: string;
    symbolLength?: number;
    symbolCharSet?: string;
    symbolName?: string;
    arrayLength?: number;
    /** probability to generate options types, number between 0 and 1 */
    optionalProbability?: number;
    /** probability to generate an specific property of an object, number between 0 and 1 */
    optionalPropertyProbability?: Record<string | number, number>; // TODO change to a record of MockOptions
    parentObj?: Record<string | number | symbol, any>;
    /** the index of the object to mock withing the union */
    unionIndex?: number;
    tupleOptions?: MockOptions[];
}

export interface MockContext extends MockOptions {
    /** Used for mocking object with circular references */
    parents?: RunType[];
}

export type AnyFunction = TypeMethodSignature | TypeCallSignature | TypeFunction | TypeMethod;

export type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};
