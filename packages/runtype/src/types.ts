/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from '@deepkit/type';
import {SchemaOptions, TSchema, TTransform} from '@sinclair/typebox';

// Visitor function type definition
export type DeepkitVisitor = (deepkitType: Type, opts: SchemaOptions) => any;

export type TypeSer = TSchema & {jsonTransformer?: TTransform<any, any>};

export type TRunType = TSchema & {jsonTransformer?: TTransform<any, any>};

export type JSONValue = string | number | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;

export type RunTypeVisitor = (deepkitType: Type, nestLevel: number) => RunType;

export interface JitJsonEncoder {
    decodeFromJson: (varName: string) => string;
    encodeToJson: (varName: string) => string;
}

export interface RunTypeValidationError {
    /**
     * Path the the property that failed validation if the validated item was an object class, etc..
     * Index if item that failed validation was in an array.
     * null if validated item was a single property */
    path: string;
    /** error message */
    message: string;
}

export interface RunType<T extends Type = Type> {
    readonly name: string;
    readonly nestLevel: number;
    readonly src: T;
    readonly visitor: RunTypeVisitor;
    readonly shouldEncodeJson: boolean;
    readonly shouldDecodeJson: boolean;

    /**
     * validation code
     * should not include anything that is purely the validation of the type, ie function wrappers.
     * this code should not use return statements, it should be a single line of code that evaluates to a boolean
     * this code should not contain any sentence breaks or semicolons.
     * ie: getValidateCode = () => `typeof vλluε === 'string'`
     */
    getValidateCode: (varName: string) => string;
    /**
     * Validation + error info
     * Similar to validation code but instead of returning a boolean it should assign an error message to the errorsName
     * This is an executable code block and can contain multiple lines or semicolons
     * ie:  validateCodeWithErrors = () => `if (typeof vλluε !== 'string') ${errorsName} = 'Expected to be a String';`
     */
    getValidateCodeWithErrors: (varName: string, errorsName: string, itemPath: string) => string;
    /**
     * Code to transform from type to a json type so type can be serialized to json
     * this code should not use return statements, it should be a single line of code that evaluates to a json compatible type.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: getJsonEncodeCode = () => `vλluε.toString()`
     * */
    getJsonEncodeCode: (varName: string) => string;
    /**
     * Code to transform from json to type so type can be deserialized from json
     * this code should not use return statements, it should be a single line that recieves a json compatible type and returns a deserialized value.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: getJsonDecodeCode = () => `BigInt(vλluε)`
     * */
    getJsonDecodeCode: (varName: string, newVarName?: string) => string;
    /**
     * Code that returns a mocked value, should be random when possible
     * this code should not use return statements, this can be a code block and can contain multiple lines or semicolons.
     * the mocked value should be assigned to the varName
     * ie for number: getMockCode = () => `vλluε = Math.floor(Math.random() * 100)`
     * */
    getMockCode: (varName) => any;
}
