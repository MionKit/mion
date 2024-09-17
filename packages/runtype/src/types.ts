/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from './_deepkit/src/reflection/type';
import {JITUtils} from './jitUtils';

export type JSONValue = string | number | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;
export type JSONString = string;

export type RunTypeVisitor = (deepkitType: Type, parents: RunType[], opts: RunTypeOptions) => RunType;
export type DKwithRT = Type & {_rt: RunType};

type JitFnArgs = {vλl: string; [key: string]: string};
export interface JitCompileOperation<FnArgs extends JitFnArgs = JitFnArgs> {
    stack: RunType[];
    /** the key of the argName must be the same as the variable name. so keys are used as inital variable names when jitContext gets reset. */
    args: FnArgs;
    path: (JitPathItem | null)[];
    getDefaultArgs(): FnArgs;
}

export type JitPathItem = {
    vλl: string | number;
    /** whether the path item needs to be accesses as and array myobject[A] or as property myobject.A */
    useArrayAccessor: boolean;
    /**
     * The literal value of the item when inserted into the code.
     * if is a variable then literal is the same as vλl.
     * ie when accessing arrays myobject[index] index is a variable and must be inserted as such code.
     * i.e: an object property width non standard name myobject["hello world"]
     * The value in memory is (hello world) the literal value is "hello world" (with quotes)
     * */
    literal: string | number;
};
export type JitOperation = JitCompileOperation<{vλl: string}>;
export type JitTypeErrorOperation = JitCompileOperation<{vλl: string; pλth: string; εrrors: string}>;

export type DefaultJitArgs = JitOperation['args'];
export type DefaultJitTypeErrorsArgs = JitTypeErrorOperation['args'];

/**
 * Runtime Metadata for a typescript types.
 */
export interface RunType extends JitCompilerFunctions {
    readonly src: Type;
    getName(): string;
    getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    constants(stack?: RunType[]): JitConstants;
    mock: (mockContext?: MockContext) => any;
    compile: () => JITCompiledFunctions;
    getJitId(): string | number;
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
     * ie: compileIsType = () => `typeof vλluε === 'string'`
     */
    compileIsType(jitCompileContext: JitOperation): string;
    /**
     * JIT code Validation + error info
     * Similar to validation code but instead of returning a boolean it should assign an error message to the errorsName
     * This is an executable code block and can contain multiple lines or semicolons
     * ie:  validateCodeWithErrors = () => `if (typeof vλluε !== 'string') ${stack.args.εrrors} = 'Expected to be a String';`
     * path is a string that represents the path to the property being validated.
     * path is calculated at runtime so is an expresion like 'path1' + '/' + 'path2' + '/' + 'path3'
     */
    compileTypeErrors(jitCompileContext: JitTypeErrorOperation): string;
    /**
     * JIT code to transform from type to an object that can be serialized using json
     * this code should not use return statements, it should be a single line of code that evaluates to a json compatible type.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: compileJsonEncode = () => `vλluε.toString()`
     * */
    compileJsonEncode(jitCompileContext: JitOperation): string;
    /**
     * JIT code to transform from json to type so type can be deserialized from json
     * this code should not use return statements, it should be a single line that recieves a json compatible type and returns a deserialized value.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: compileJsonDecode = () => `BigInt(vλluε)`
     *
     * For security reason decoding ignores any properties that are not defined in the type.
     * So is your type is {name: string} and the json is {name: string, age: number} the age property will be ignored.
     * */
    compileJsonDecode(jitCompileContext: JitOperation): string;
    /**
     * JIT code to transform a type directly into s json string.
     * when serializing to json normally we need first to prepare the object using compileJsonEncode and then JSON.stringify().
     * this code directly outputs the json string and saves traversing the type twice
     * stringify is allways strict
     */
    compileJsonStringify(jitCompileContext: JitOperation): string;
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

export type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};
