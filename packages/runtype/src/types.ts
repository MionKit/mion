/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from '@deepkit/type';

export type JSONValue = string | number | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;

export type RunTypeVisitor = (deepkitType: Type, nestLevel: number) => RunType;

export interface JitJsonEncoder {
    decodeFromJson: (varName: string) => string;
    encodeToJson: (varName: string) => string;
    stringify: (varName: string) => string;
}

export interface RunTypeValidationError {
    /**
     * Path the the property that failed validation if the validated item was an object class, etc..
     * Index if item that failed validation was in an array.
     * null if validated item was a single property */
    path: string;
    /** the type of the expected data */
    expected: string;
}

export interface RunType<T extends Type = Type> {
    readonly name: string;
    readonly nestLevel: number;
    readonly src: T;
    readonly visitor: RunTypeVisitor;
    readonly shouldEncodeJson: boolean;
    readonly shouldDecodeJson: boolean;

    /**
     * JIT code validation code
     * should not include anything that is purely the validation of the type, ie function wrappers.
     * this code should not use return statements, it should be a single line of code that evaluates to a boolean
     * this code should not contain any sentence breaks or semicolons.
     * ie: isTypeJIT = () => `typeof vλluε === 'string'`
     */
    isTypeJIT: (varName: string) => string;
    /**
     * JIT code Validation + error info
     * Similar to validation code but instead of returning a boolean it should assign an error message to the errorsName
     * This is an executable code block and can contain multiple lines or semicolons
     * ie:  validateCodeWithErrors = () => `if (typeof vλluε !== 'string') ${errorsName} = 'Expected to be a String';`
     * pathChain is a string that represents the path to the property being validated.
     * pathChain is calculated at runtime so is an expresion like 'path1' + '/' + 'path2' + '/' + 'path3'
     */
    typeErrorsJIT: (varName: string, errorsName: string, pathChain: string) => string;
    /**
     * JIT code to transform from type to an object that can be serialized using json
     * this code should not use return statements, it should be a single line of code that evaluates to a json compatible type.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: jsonEncodeJIT = () => `vλluε.toString()`
     * */
    jsonEncodeJIT: (varName: string) => string;
    /**
     * JIT code to transform a type directly into s json string.
     * when serializing to json normally we need first to prepare the object using jsonEncodeJIT and then JSON.stringify().
     * this code directly outputs the json string and saves traversing the type twice
     * @param varName
     * @returns
     */
    jsonStringifyJIT: (varName: string) => string;
    /**
     * JIT code to transform from json to type so type can be deserialized from json
     * this code should not use return statements, it should be a single line that recieves a json compatible type and returns a deserialized value.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: jsonDecodeJIT = () => `BigInt(vλluε)`
     * */
    jsonDecodeJIT: (varName: string) => string;
    /**
     * Code that returns a mocked value, should be random when possible
     * this code should not use return statements, this can be a code block and can contain multiple lines or semicolons.
     * the mocked value should be assigned to the varName
     * ie for number: mockJIT = () => `vλluε = Math.floor(Math.random() * 100)`
     * */
    mockJIT: (varName) => any;
}
