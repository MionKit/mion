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
export type SrcType = Type & {_runType?: RunType};

export interface JitCompileContext<FnArgs extends Record<string, string> = Record<string, string>> {
    parents: RunType[];
    /** the key of the argName must be the same as the variable name. so keys are used as inital variable names when jitContext gets reset. */
    args: FnArgs;
    path: (string | number)[];
}

export type JitContext = JitCompileContext<{value: string}>;
export type TypeErrorsContext = JitCompileContext<{value: string; path: string; errors: string}>;

export type DefaultJitArgs = JitContext['args'];
export type DefaultJitTypeErrorsArgs = TypeErrorsContext['args'];

export interface JitCompilerFunctions {
    /**
     * JIT code validation code
     * should not include anything that is purely the validation of the type, ie function wrappers.
     * this code should not use return statements, it should be a single line of code that evaluates to a boolean
     * this code should not contain any sentence breaks or semicolons.
     * ie: compileIsType = () => `typeof vλluε === 'string'`
     */
    compileIsType(jitCompileContext: JitContext): string;
    /**
     * JIT code Validation + error info
     * Similar to validation code but instead of returning a boolean it should assign an error message to the errorsName
     * This is an executable code block and can contain multiple lines or semicolons
     * ie:  validateCodeWithErrors = () => `if (typeof vλluε !== 'string') ${jitNames.errors} = 'Expected to be a String';`
     * pathChain is a string that represents the path to the property being validated.
     * pathChain is calculated at runtime so is an expresion like 'path1' + '/' + 'path2' + '/' + 'path3'
     */
    compileTypeErrors(jitCompileContext: TypeErrorsContext): string;
    /**
     * JIT code to transform from type to an object that can be serialized using json
     * this code should not use return statements, it should be a single line of code that evaluates to a json compatible type.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: compileJsonEncode = () => `vλluε.toString()`
     * */
    compileJsonEncode(jitCompileContext: JitContext): string;
    /**
     * JIT code to transform from json to type so type can be deserialized from json
     * this code should not use return statements, it should be a single line that recieves a json compatible type and returns a deserialized value.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: compileJsonDecode = () => `BigInt(vλluε)`
     *
     * For security reason decoding ignores any properties that are not defined in the type.
     * So is your type is {name: string} and the json is {name: string, age: number} the age property will be ignored.
     * */
    compileJsonDecode(jitCompileContext: JitContext): string;
    /**
     * JIT code to transform a type directly into s json string.
     * when serializing to json normally we need first to prepare the object using compileJsonEncode and then JSON.stringify().
     * this code directly outputs the json string and saves traversing the type twice
     * stringify is allways strict
     * @param varName
     * @returns
     */
    compileJsonStringify(jitCompileContext: JitContext): string;
}

export interface RunType<Opts extends RunTypeOptions = RunTypeOptions> extends JitCompilerFunctions {
    readonly src: Type;
    readonly isJsonEncodeRequired: boolean;
    readonly isJsonDecodeRequired: boolean;
    readonly functions: JITCompiledFunctionsData;
    readonly jitId: string | number;

    /** Options for this RunType, only stored in the types that needs to use it */
    readonly opts?: Opts;

    /** whether or not the type is a atomic runtype that can´t have child run types, ie: string, number, boolean, null, etc.. */
    readonly isAtomic?: boolean;

    /**
     * returns a mocked value, should be random when possible
     * */
    mock: (mockContext?: MockContext, ...args: any[]) => any;

    /** Readable unique identifier of the RunType, used as the expected value of type errors */
    getName(): string;
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
    decodeFromJson: (varName: string) => string;
    encodeToJson: (varName: string) => string;
    stringify: (varName: string) => string;
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

export interface JITCompiledFunctionsData {
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

export interface MockOptions {
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
    optionalPropertyProbability?: Record<string | number, number>;
    parentObj?: Record<string | number | symbol, any>;
    /** the index of the object to mock withing the union */
    unionIndex?: number;
    tupleOptions?: MockOptions[];
}

export interface MockContext extends MockOptions {
    parents?: RunType[];
}

export type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};
