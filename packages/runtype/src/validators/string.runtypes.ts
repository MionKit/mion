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
import {compilePureFunctionCall, addFormatterToCache, JitRunTypeTransformer, JitRunTypeValidator} from '../lib/formats';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {jitUtils} from '../lib/jitUtils';
import {MockOperation} from '../types';
import {mockString, random, randomItem} from '../lib/mock';
import {JitFunctions} from '../constants';

export const ALPHANUMERIC_REGEX = /[\p{L}|\p{N}]/gu;
export const ALPHANUMERIC_S_REGEX = /[\p{L}|\p{N}|\s]/gu;
export const ALPHA_REGEX = /[\p{L}|\s]/gu;
export const ALPHA_S_REGEX = /[\p{L}]/gu;
export const NUMERIC_REGEX = /[\p{N}]/gu;

// Each validator property must match a validator  name
export type StringValidatorsParams = {
    // validators
    maxLength?: number;
    minLength?: number;
    length?: number;
    pattern?: RegExp;
    allowedChars?: string;
    disallowedChars?: string;
    samples?: string[];
};

export type StringTransformersParams = {
    // formatters
    lowercase?: boolean;
    uppercase?: boolean;
    capitalize?: boolean;
    unCapitalize?: boolean;
};

export type StringFormatParams = StringValidatorsParams & StringTransformersParams;

export type StringFormat<P extends StringFormatParams> = TypeFormat<string, 'string', P>;

export type Alpha<P extends StringFormatParams = {}> = StringFormat<P & {pattern: typeof ALPHA_REGEX}>;
export type AlphaNumeric = StringFormat<{pattern: typeof ALPHANUMERIC_REGEX}>;
export type Numeric = StringFormat<{pattern: typeof NUMERIC_REGEX}>;
export type Lower = StringFormat<{lowercase: true}>;
export type Upper = StringFormat<{uppercase: true}>;
export type Capital = StringFormat<{capitalize: true}>;
export type UnCapital = StringFormat<{unCapitalize: true}>;

// ############### Validator ###############
export class StringValidator extends JitRunTypeValidator<StringFormatParams> {
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
        const params = this.getParams(rt, {});
        return stringValidatorMock(rt, mockContext, params);
    }
}

// ############### Formatter ###############

export class StringFormatter extends JitRunTypeTransformer<StringFormatParams> {
    static readonly id = 'string';
    readonly kind = ReflectionKind.string as const;
    readonly name = StringFormatter.id;
    _format(comp: JitCompiler, rt: BaseRunType): string {
        const {lowercase, uppercase, capitalize, unCapitalize} = this.getParams(rt, {});
        // if more than one formatter is defined, then throw an error
        if ([lowercase, uppercase, capitalize, unCapitalize].filter((v) => v).length > 1) {
            throw new Error('Only one string formatter can be defined, either lowercase, uppercase, capitalize or unCapitalize');
        }
        if (lowercase) return `${comp.vλl}.toLowerCase()`;
        if (uppercase) return `${comp.vλl}.toUpperCase()`;
        if (capitalize) return `${comp.vλl}.charAt(0).toUpperCase() + ${comp.vλl}.slice(1)`;
        if (unCapitalize) return `${comp.vλl}.charAt(0).toLowerCase() + ${comp.vλl}.slice(1)`;
        return '';
    }
    _mock(mockContext: MockOperation, rt: BaseRunType, val: any) {
        const params = this.getParams(rt, {});
        return stringTransformerMock(rt, mockContext, params, val);
    }
}

// ############### UTIL FUNCTIONS (Might be reused by other Type Formatters) ###############

export function stringValidatorMock(rt: BaseRunType, mockContext: MockOperation, params: StringFormatParams): string {
    const {maxLength, minLength, length, pattern, allowedChars, disallowedChars, samples} = params;
    if (pattern && !samples) throw new Error(`'samples' must be provided when 'pattern' is defined for type ${rt.getTypeName()}`);
    if (pattern && samples) {
        const sample = randomItem(samples);
        const isType = rt.createJitFunction(JitFunctions.isType);
        if (!isType(sample))
            throw new Error(`provided sample [${sample}] does not match all the constraints for type ${rt.getTypeName()}`);
        return sample;
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
    const {lowercase, uppercase, capitalize, unCapitalize} = params;
    // if more than one formatter is defined, then throw an error
    if ([lowercase, uppercase, capitalize, unCapitalize].filter((v) => v).length > 1) {
        throw new Error(
            `Only one string formatter can be defined, either lowercase, uppercase, capitalize or unCapitalize for type ${rt.getTypeName()}`
        );
    }
    if (lowercase) return val.toLowerCase();
    if (uppercase) return val.toUpperCase();
    if (capitalize) return val.charAt(0).toUpperCase() + val.slice(1);
    if (unCapitalize) return val.charAt(0).toLowerCase() + val.slice(1);
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

// ############### register runtypes ###############

// register pure functions so they can be used in the jit compiler
jitUtils.addPureFn(allowedCharsFn);
jitUtils.addPureFn(disallowedCharsFn);

// register Validator operations so they can be used in the jit compiler
addFormatterToCache(new StringValidator());
addFormatterToCache(new StringFormatter());
