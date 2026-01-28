/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

type StrNumber = string | number;

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

/** Alias for TypeAnnotation from @deepkit/core. At type level this is `unknown`, but we need the structure for extraction. */
export type AliasTypeAnnotation<Name extends string, Options = never> = unknown;

/** Alias for TypeFormat from @mionkit/run-types. This is how format types (StrFormat, NumFormat, etc.) are defined. */
export type AliasTypeFormat<
    BaseType extends string | number | bigint,
    Name extends string,
    P extends TypeFormatParams,
> = BaseType & AliasTypeAnnotation<Name, P>;

/** Extract format params P from a TypeFormat branded type. Returns undefined if T is not a TypeFormat.*/
export type ExtractFormatParams<T> = T extends AliasTypeFormat<infer Base, infer Name, infer P> ? P : undefined;

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
