/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {TypeFormat} from '../lib/formats.runtypes';
import {compilePureFunctionCall, registerFormatter, registerPureFunction} from '../lib/formats';
import {JitRunTypeTransformer} from '../lib/jitFormatters';
import {JitRunTypeValidator} from '../lib/jitFormatters';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {jitUtils} from '../lib/jitUtils';
import {MockOperation} from '../types';
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
class StringValidator extends JitRunTypeValidator<StringFormatParams> {
    static readonly id = 'string';
    readonly kind = ReflectionKind.string;
    readonly name = 'string' as const;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const {maxLength, minLength, length, pattern, allowedChars, disallowedChars} = this.getParams(rt, {});

        const conditions: string[] = [];
        if (maxLength !== undefined) conditions.push(`${comp.vλl}.length <= ${maxLength}`);
        if (minLength !== undefined) conditions.push(`${comp.vλl}.length >= ${minLength}`);
        if (length !== undefined) conditions.push(`${comp.vλl}.length === ${length}`);
        if (pattern !== undefined) {
            const regexpVarName = `regexp${rt.getNestLevel()}_${comp.contextCodeItems.size}`;
            comp.contextCodeItems.set(regexpVarName, `const ${regexpVarName} = ${pattern}`);
            conditions.push(`${regexpVarName}.test(${comp.vλl})`);
        }
        if (allowedChars !== undefined) {
            const params = {allowedChars} satisfies StringFormatParams;
            conditions.push(compilePureFunctionCall(comp, rt, allowedCharsFn, params));
        }
        if (disallowedChars !== undefined) {
            const params = {disallowedChars} satisfies StringFormatParams;
            conditions.push(compilePureFunctionCall(comp, rt, disallowedCharsFn, params));
        }
        if (conditions.length === 0) return '';
        return conditions.join(' && ');
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const {maxLength, minLength, length, pattern, allowedChars, disallowedChars} = this.getParams(rt, {});

        const errors: string[] = [];
        if (maxLength !== undefined) {
            const info = {format: 'maxLength', typeName: rt.src.typeName};
            errors.push(`if (!(${comp.vλl}.length <= ${maxLength})) ${comp.callJitErr('string', info)}`);
        }
        if (minLength !== undefined) {
            const info = {format: 'minLength', typeName: rt.src.typeName};
            errors.push(`if (!(${comp.vλl}.length >= ${minLength})) ${comp.callJitErr('string', info)}`);
        }
        if (length !== undefined) {
            const info = {format: 'length', typeName: rt.src.typeName};
            errors.push(`if (!(${comp.vλl}.length === ${length})) ${comp.callJitErr('string', info)}`);
        }
        if (pattern !== undefined) {
            const regexpVarName = `regexp${rt.getNestLevel()}_${comp.contextCodeItems.size}`;
            comp.contextCodeItems.set(regexpVarName, `const ${regexpVarName} = ${pattern}`);
            const info = {format: 'pattern', typeName: rt.src.typeName};
            errors.push(`if (!(${regexpVarName}.test(${comp.vλl}))) ${comp.callJitErr('string', info)}`);
        }
        if (allowedChars !== undefined) {
            const params = {allowedChars} satisfies StringFormatParams;
            const info = {format: 'allowedChars', typeName: rt.src.typeName};
            errors.push(
                `if (!(${compilePureFunctionCall(comp, rt, allowedCharsFn, params)})) ${comp.callJitErr('string', info)}`
            );
        }
        if (disallowedChars !== undefined) {
            const params = {disallowedChars} satisfies StringFormatParams;
            const info = {format: 'disallowedChars', typeName: rt.src.typeName};
            errors.push(
                `if (!(${compilePureFunctionCall(comp, rt, disallowedCharsFn, params)})) ${comp.callJitErr('string', info)}`
            );
        }
        return errors.join(';');
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        return stringValidatorMock(rt, mockContext, this.getParams(rt, {}));
    }
    validateParams(rt: BaseRunType, params: StringFormatParams): void {
        const {pattern, samples, sampleChars} = params;
        if (pattern && !samples && !sampleChars)
            throw new Error(`'samples' or 'sampleChars' must be provided when 'pattern' is defined for type ${rt.getTypeName()}`);
        if (pattern && samples) {
            samples.forEach((sample) => {
                if (!this.isType(sample, params))
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
    }
    isType(value: any, params: StringFormatParams): value is string {
        const {maxLength, minLength, length, pattern, allowedChars, disallowedChars} = params;
        if (maxLength !== undefined && value.length > maxLength) return false;
        if (minLength !== undefined && value.length < minLength) return false;
        if (length !== undefined && value.length !== length) return false;
        if (pattern !== undefined && !pattern.test(value)) return false;
        if (allowedChars !== undefined && !allowedCharsFn(value, jitUtils, params as Required<StringFormatParams>)) return false;
        if (disallowedChars !== undefined && !disallowedCharsFn(value, jitUtils, params as Required<StringFormatParams>))
            return false;
        return true;
    }
}

// ############### Formatter ###############

class StringFormatter extends JitRunTypeTransformer<StringFormatParams> {
    static readonly id = 'string';
    readonly kind = ReflectionKind.string as const;
    readonly name = StringFormatter.id;
    _format(comp: JitCompiler, rt: BaseRunType): string {
        const {lowercase, uppercase, capitalize} = this.getParams(rt, {});
        if (lowercase) return `${comp.vλl}.toLowerCase()`;
        if (uppercase) return `${comp.vλl}.toUpperCase()`;
        if (capitalize) return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
        return '';
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const {lowercase, uppercase, capitalize} = this.getParams(rt, {});
        const conditions: string[] = [];
        if (lowercase) conditions.push(`${comp.vλl} === ${comp.vλl}.toLowerCase()`);
        if (uppercase) conditions.push(`${comp.vλl} === ${comp.vλl}.toUpperCase()`);
        if (capitalize) {
            const isFirstLetterUppercase = `${comp.vλl}.charAt(0) === ${comp.vλl}.charAt(0).toUpperCase()`;
            const isRestLowercase = `${comp.vλl}.slice(1) === ${comp.vλl}.slice(1).toLowerCase()`;
            conditions.push(`${isFirstLetterUppercase} && ${isRestLowercase}`);
        }
        if (conditions.length === 0) return '';
        return conditions.join(' && ');
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const {lowercase, uppercase, capitalize} = this.getParams(rt, {});
        const errors: string[] = [];
        if (lowercase) {
            const info = {format: 'lowercase', typeName: rt.src.typeName};
            errors.push(`if (!(${comp.vλl} === ${comp.vλl}.toLowerCase())) ${comp.callJitErr('string', info)}`);
        }
        if (uppercase) {
            const info = {format: 'uppercase', typeName: rt.src.typeName};
            errors.push(`if (!(${comp.vλl} === ${comp.vλl}.toUpperCase())) ${comp.callJitErr('string', info)}`);
        }
        if (capitalize) {
            const isFirstLetterUppercase = `${comp.vλl}.charAt(0) === ${comp.vλl}.charAt(0).toUpperCase()`;
            const isRestLowercase = `${comp.vλl}.slice(1) === ${comp.vλl}.slice(1).toLowerCase()`;
            const info = {format: 'capitalize', typeName: rt.src.typeName};
            errors.push(`if (!(${isFirstLetterUppercase} && ${isRestLowercase})) ${comp.callJitErr('string', info)}`);
        }
        return errors.join(';');
    }
    _mock(mockContext: MockOperation, rt: BaseRunType, val: any) {
        const params = this.getParams(rt, {});
        return stringTransformerMock(rt, mockContext, params, val);
    }
    validateParams(rt: BaseRunType, params: StringFormatParams) {
        // throw error if more than one formatter is defined
        const {lowercase, uppercase, capitalize} = params;
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

export function stringTransformerMock(rt: BaseRunType, mockContext: MockOperation, params: StringFormatParams, val: any): any {
    const {lowercase, uppercase, capitalize} = params;
    // if more than one formatter is defined, then throw an error
    if ([lowercase, uppercase, capitalize].filter((v) => v).length > 1) {
        throw new Error(
            `Only one string formatter can be defined, either lowercase, uppercase or capitalize for type ${rt.getTypeName()}`
        );
    }
    if (lowercase) return val.toLowerCase();
    if (uppercase) return val.toUpperCase();
    if (capitalize) return val.charAt(0).toUpperCase() + val.slice(1);
    return val;
}

// ############### PURE FUNCTIONS ###############

export function allowedCharsFn(s: string, jUtl, p: Required<StringFormatParams>): boolean {
    for (let i = 0; i < s.length; i++) if (!p.allowedChars.includes(s[i])) return false;
    return true;
}

export function disallowedCharsFn(s: string, jUtl, p: Required<StringFormatParams>): boolean {
    for (let i = 0; i < p.disallowedChars.length; i++) if (s.includes(p.disallowedChars[i])) return false;
    return true;
}

// ############### Register runtypes ###############

// register pure functions so they can be used in the jit compiler
registerPureFunction(allowedCharsFn);
registerPureFunction(disallowedCharsFn);

// register Validator operations so they can be used in the jit compiler
registerFormatter(new StringValidator());
registerFormatter(new StringFormatter());
