/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from './_deepkit/src/reflection/type';

export type JSONValue = string | number | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;
export type JSONString = string;

export type RunTypeVisitor = (deepkitType: Type, nestLevel: number, opts: RunTypeOptions) => RunType;

export interface RunType<T extends Type = Type, Opts extends RunTypeOptions = RunTypeOptions> {
    readonly name: string;
    readonly nestLevel: number;
    readonly src: T;
    readonly isJsonEncodeRequired: boolean;
    readonly isJsonDecodeRequired: boolean;
    readonly opts: Opts;
    readonly compiled: CompiledFunctions;
    /**
     * JIT code validation code
     * should not include anything that is purely the validation of the type, ie function wrappers.
     * this code should not use return statements, it should be a single line of code that evaluates to a boolean
     * this code should not contain any sentence breaks or semicolons.
     * ie: JIT_isType = () => `typeof vλluε === 'string'`
     */
    JIT_isType: (varName: string) => string;
    /**
     * JIT code Validation + error info
     * Similar to validation code but instead of returning a boolean it should assign an error message to the errorsName
     * This is an executable code block and can contain multiple lines or semicolons
     * ie:  validateCodeWithErrors = () => `if (typeof vλluε !== 'string') ${errorsName} = 'Expected to be a String';`
     * pathChain is a string that represents the path to the property being validated.
     * pathChain is calculated at runtime so is an expresion like 'path1' + '/' + 'path2' + '/' + 'path3'
     */
    JIT_typeErrors: (varName: string, errorsName: string, pathChain: string) => string;
    /**
     * JIT code to transform from type to an object that can be serialized using json
     * this code should not use return statements, it should be a single line of code that evaluates to a json compatible type.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: JIT_jsonEncode = () => `vλluε.toString()`
     * */
    JIT_jsonEncode: (varName: string) => string;
    /**
     * JIT code to transform a type directly into s json string.
     * when serializing to json normally we need first to prepare the object using JIT_jsonEncode and then JSON.stringify().
     * this code directly outputs the json string and saves traversing the type twice
     * stringify is allways strict
     * @param varName
     * @returns
     */
    JIT_jsonStringify: (varName: string) => string;
    /**
     * JIT code to transform from json to type so type can be deserialized from json
     * this code should not use return statements, it should be a single line that recieves a json compatible type and returns a deserialized value.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: JIT_jsonDecode = () => `BigInt(vλluε)`
     *
     * For security reason decoding ignores any properties that are not defined in the type.
     * So is your type is {name: string} and the json is {name: string, age: number} the age property will be ignored.
     * */
    JIT_jsonDecode: (varName: string) => string;
    /**
     * returns a mocked value, should be random when possible
     * */
    mock: (...args: any[]) => any;
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

export interface JitFn<Fn extends (args: any[]) => any> {
    varName: string;
    code: string;
    fn: Fn;
}

export type SerializableJitFn<Fn extends (args: any[]) => any> = Omit<JitFn<Fn>, 'fn'>;

export interface RunTypeValidationError {
    /**
     * Path the the property that failed validation if the validated item was an object class, etc..
     * Index if item that failed validation was in an array.
     * null if validated item was a single property */
    path: string;
    /** the type of the expected data */
    expected: string;
}

export interface CompiledFunctions {
    isType: JitFn<(vλluε: any) => boolean>;
    typeErrors: JitFn<(vλluε: any) => RunTypeValidationError[]>;
    jsonEncode: JitFn<(vλluε: any) => JSONValue>;
    jsonDecode: JitFn<(vλluε: JSONValue) => any>;
    jsonStringify: JitFn<(vλluε: any) => JSONString>;
}

export interface SerializableFunctions {
    isType: SerializableJitFn<(vλluε: any) => boolean>;
    typeErrors: SerializableJitFn<(vλluε: any) => RunTypeValidationError[]>;
    jsonEncode: SerializableJitFn<(vλluε: any) => JSONValue>;
    jsonDecode: SerializableJitFn<(vλluε: JSONValue) => any>;
    jsonStringify: SerializableJitFn<(vλluε: any) => JSONString>;
}

export interface JitFunctions {
    isType: (varName: string) => string;
    typeErrors: (varName: string, errorsName: string, pathChain: string) => string;
    jsonEncode: (varName: string) => string;
    jsonDecode: (varName: string) => string;
    jsonStringify: (varName: string) => string;
}
