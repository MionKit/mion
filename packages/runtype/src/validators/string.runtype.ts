/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {
    compileAddParamsToCtx,
    compileErrorsPureFunctionCall,
    registerFormatter,
    registerPureFunctionWithCtx,
} from '../lib/formats';
import {JitRunTypeFormatter} from '../lib/jitFormatters';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {ErrorsPureFunction, InvalidFormatParams, MockOperation, PureFunction, TypeFormatInvalid} from '../types';
import {mockString, random, randomItem} from '../lib/mock';

export const ALPHANUMERIC_REGEX = /^[\p{L}\p{N}]+$/u;
export const ALPHA_REGEX = /^[\p{L}]+$/u;
export const NUMERIC_REGEX = /^[\p{N}]+$/u;

// ############### String Format Params ###############
export type StringValidatorsParams = {
    // validators
    maxLength?: number;
    minLength?: number;
    length?: number;
    pattern?: RegExp;
    allowedChars?: string;
    disallowedChars?: string;
    allowedValues?: string[];
    disallowedValues?: string[];
    samples?: string[];
    sampleChars?: string;
};
export type StringTransformersParams = {
    // formatters
    lowercase?: boolean;
    uppercase?: boolean;
    capitalize?: boolean;
};
export type StringFormatParams = StringValidatorsParams & StringTransformersParams;

type ParsedStringFormatParams = StringFormatParams & {
    disallowedRegexp?: RegExp;
    allowedRegexp?: RegExp;
};

// ############### Base String Format ###############

export type StringFormat<P extends StringFormatParams> = TypeFormat<string, 'string', P>;

// ############### Default String Formats ###############

export type AlphaString<P extends StringFormatParams = {}> = StringFormat<
    P & {pattern: typeof ALPHA_REGEX; sampleChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'}
>;
export type AlphaNumericString<P extends StringFormatParams = {}> = StringFormat<
    P & {pattern: typeof ALPHANUMERIC_REGEX; sampleChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'}
>;
export type NumericString<P extends StringFormatParams = {}> = StringFormat<
    P & {pattern: typeof NUMERIC_REGEX; sampleChars: '0123456789'}
>;
export type LowerString<P extends StringFormatParams = {}> = StringFormat<P & {lowercase: true}>;
export type UpperString<P extends StringFormatParams = {}> = StringFormat<P & {uppercase: true}>;
export type CapitalString<P extends StringFormatParams = {}> = StringFormat<P & {capitalize: true}>;

// ############### Validator ###############
class StringFormatter extends JitRunTypeFormatter<ParsedStringFormatParams> {
    static readonly id = 'string' as const;
    readonly kind = ReflectionKind.string;
    readonly name = StringFormatter.id;
    isStr = isStringFormat();
    escapeRegexp = (s: string) => s.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
    getParams(rt: BaseRunType, defaultParams: StringFormatParams): ParsedStringFormatParams {
        const params = super.getParams(rt, defaultParams);
        if (params.allowedChars?.length) params.allowedRegexp = new RegExp(`^[${this.escapeRegexp(params.allowedChars)}]+$`);
        if (params.disallowedChars?.length)
            params.disallowedRegexp = new RegExp(`[${this.escapeRegexp(params.disallowedChars)}]`);
        return params;
    }
    _format(comp: JitCompiler, rt: BaseRunType): string {
        const {lowercase, uppercase, capitalize} = this.getParams(rt, {});
        if (lowercase) return `${comp.vλl}.toLowerCase()`;
        if (uppercase) return `${comp.vλl}.toUpperCase()`;
        if (capitalize) return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
        return '';
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, {});
        const conditions: string[] = [];
        const {
            maxLength,
            minLength,
            length,
            pattern,
            allowedRegexp,
            disallowedRegexp,
            allowedValues,
            disallowedValues,
            lowercase,
            uppercase,
            capitalize,
        } = params;

        // basic validators
        if (maxLength !== undefined) conditions.push(`${comp.vλl}.length <= ${maxLength}`);
        if (minLength !== undefined) conditions.push(`${comp.vλl}.length >= ${minLength}`);
        if (length !== undefined) conditions.push(`${comp.vλl}.length === ${length}`);

        // allowed validators (these are not simple statements so better to cal external function)
        if (pattern || allowedRegexp || disallowedRegexp || allowedValues || disallowedValues) {
            const {paramsName} = compileAddParamsToCtx(comp, rt, params);
            if (pattern) conditions.push(`${paramsName}.pattern.test(${comp.vλl})`);
            if (allowedRegexp) conditions.push(`${paramsName}.allowedRegexp.test(${comp.vλl})`);
            if (disallowedRegexp) conditions.push(`!${paramsName}.disallowedRegexp.test(${comp.vλl})`);
            if (allowedValues) conditions.push(`${paramsName}.allowedValues.includes(${comp.vλl})`);
            if (disallowedValues) conditions.push(`!${paramsName}.disallowedValues.includes(${comp.vλl})`);
        }

        // transformers
        if (lowercase) conditions.push(`${comp.vλl} === ${comp.vλl}.toLowerCase()`);
        if (uppercase) conditions.push(`${comp.vλl} === ${comp.vλl}.toUpperCase()`);
        if (capitalize) {
            const isFirstLetterUppercase = `${comp.vλl}.charAt(0) === ${comp.vλl}.charAt(0).toUpperCase()`;
            const isRestLowercase = `${comp.vλl}.slice(1) === ${comp.vλl}.slice(1).toLowerCase()`;
            conditions.push(`${isFirstLetterUppercase} && ${isRestLowercase}`);
        }

        return conditions.join(' && ');
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, {});
        // the get type errors function does not need to be so optimized so we call a single function that makes all the checks
        return compileErrorsPureFunctionCall(comp, rt, stringFormatErrors, params, this.name);
    }
    _mock(mockContext: MockOperation, rt: BaseRunType): string {
        const params = this.getParams(rt, {});
        return stringValidatorMock(rt, mockContext, params);
    }
    _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string {
        const params = this.getParams(rt, {});
        const {lowercase, uppercase, capitalize} = params;
        if (lowercase) return val.toLowerCase();
        if (uppercase) return val.toUpperCase();
        if (capitalize) return val.charAt(0).toUpperCase() + val.slice(1);
        return val;
    }
    validateParams(rt: BaseRunType, params: StringFormatParams): void {
        const {pattern, samples, sampleChars, lowercase, uppercase, capitalize} = params;
        if (pattern && !samples && !sampleChars)
            throw new Error(`'samples' or 'sampleChars' must be provided when 'pattern' is defined for type ${rt.getTypeName()}`);
        if (pattern && samples) {
            samples.forEach((sample) => {
                if (!this.isStr(sample, params))
                    throw new Error(
                        `provided sample [${sample}] does not match all the constraints for type ${rt.getTypeName()}`
                    );
            });
        }
        if (pattern && sampleChars) {
            if (!pattern.test(sampleChars))
                throw new Error(
                    `provided sampleChars (${sampleChars}) does not match all the constraints for type ${rt.getTypeName()}`
                );
        }
        if ([lowercase, uppercase, capitalize].filter((v) => v).length > 1) {
            throw new Error(
                `Only one string formatter can be defined, either lowercase, uppercase or capitalize for type ${rt.getTypeName()}`
            );
        }
    }
}

// ############### UTIL FUNCTIONS (Might be reused by other Type Formatters) ###############

export function stringValidatorMock(rt: BaseRunType, mockContext: MockOperation, params: StringFormatParams): string {
    const {maxLength, minLength, length, pattern, allowedChars, disallowedChars, samples, sampleChars} = params;
    if (pattern && samples) {
        return randomItem(samples);
    }
    if (pattern && sampleChars) {
        const newAllowedChars = allowedChars ? allowedChars + sampleChars : sampleChars;
        const newMinLength = minLength ? minLength : 1; // patterns will fail if generated string length is 0
        const newParams = {...params, pattern: undefined, allowedChars: newAllowedChars, minLength: newMinLength};
        return stringValidatorMock(rt, mockContext, newParams);
    }
    switch (true) {
        case length !== undefined:
            return mockString(length, allowedChars, disallowedChars);
        case maxLength !== undefined && minLength !== undefined:
            return mockString(random(minLength, maxLength), allowedChars, disallowedChars);
        case maxLength !== undefined:
            return mockString(random(0, maxLength), allowedChars, disallowedChars);
        case minLength !== undefined:
            return mockString(random(minLength, minLength + random(1, 1 + minLength * 2)), allowedChars, disallowedChars);
        default:
            return mockString(undefined, allowedChars, disallowedChars);
    }
}

// ############### PURE FUNCTIONS ###############
/** @reflection never */
export function isStringFormat() {
    return function is_string(s: string, p: StringFormatParams): s is string {
        if (p.maxLength !== undefined && s.length > p.maxLength) return false;
        if (p.minLength !== undefined && s.length < p.minLength) return false;
        if (p.length !== undefined && s.length !== p.length) return false;
        if (p.pattern !== undefined && !p.pattern.test(s)) return false;
        if (p.allowedChars !== undefined) for (let i = 0; i < s.length; i++) if (!p.allowedChars.includes(s[i])) return false;
        if (p.disallowedChars !== undefined)
            for (let i = 0; i < p.disallowedChars.length; i++) if (s.includes(p.disallowedChars[i])) return false;
        if (p.allowedValues !== undefined && !p.allowedValues.includes(s)) return false;
        if (p.disallowedValues !== undefined && p.disallowedValues.includes(s)) return false;
        if (p.lowercase && s !== s.toLowerCase()) return false;
        if (p.uppercase && s !== s.toUpperCase()) return false;
        if (p.capitalize) {
            if (s.charAt(0) !== s.charAt(0).toUpperCase() || s.slice(1) !== s.slice(1).toLowerCase()) return false;
        }
        return true;
    } as PureFunction<StringFormatParams>;
}
/** @reflection never */
export function stringFormatErrors() {
    return function string_errors(s: string, p: ParsedStringFormatParams): InvalidFormatParams | undefined {
        const invalid: [string, TypeFormatInvalid][] = [];
        if (p.maxLength !== undefined && s.length > p.maxLength) invalid.push(['maxLength', p.maxLength]);
        if (p.minLength !== undefined && s.length < p.minLength) invalid.push(['minLength', p.minLength]);
        if (p.length !== undefined && s.length !== p.length) invalid.push(['length', p.length]);
        if (p.pattern !== undefined && !p.pattern.test(s)) invalid.push(['pattern', p.pattern.toString()]);
        if (p.allowedRegexp !== undefined && !p.allowedRegexp.test(s)) invalid.push(['allowedChars', (p as any).allowedChars]);
        if (p.disallowedRegexp !== undefined && p.disallowedRegexp.test(s))
            invalid.push(['disallowedChars', (p as any).disallowedChars]);
        if (p.allowedValues !== undefined && !p.allowedValues.includes(s)) invalid.push(['allowedValues', p.allowedValues]);
        if (p.disallowedValues !== undefined && p.disallowedValues.includes(s))
            invalid.push(['disallowedValues', p.disallowedValues]);
        if (p.lowercase && s !== s.toLowerCase()) invalid.push(['lowercase', p.lowercase]);
        if (p.uppercase && s !== s.toUpperCase()) invalid.push(['uppercase', p.uppercase]);
        if (p.capitalize && (s.charAt(0) !== s.charAt(0).toUpperCase() || s.slice(1) !== s.slice(1).toLowerCase()))
            invalid.push(['capitalize', p.capitalize]);
        if (invalid.length) return Object.fromEntries(invalid);
    } as ErrorsPureFunction<StringFormatParams>;
}
/** @reflection never */
export function isAllowedString() {
    return function is_allowed(s: string, p: ParsedStringFormatParams): boolean {
        if (p.allowedRegexp !== undefined && !p.allowedRegexp.test(s)) return false;
        if (p.disallowedRegexp !== undefined && p.disallowedRegexp.test(s)) return false;
        if (p.allowedValues !== undefined && !p.allowedValues.includes(s)) return false;
        if (p.disallowedValues !== undefined && p.disallowedValues.includes(s)) return false;
        return true;
    } as PureFunction<StringFormatParams>;
}

// ############### Register runtypes ###############

// register pure functions so they can be used in the jit compiler
registerPureFunctionWithCtx(isStringFormat);
registerPureFunctionWithCtx(stringFormatErrors);

// register Validator operations so they can be used in the jit compiler
export const stringFormatter = registerFormatter(new StringFormatter());
