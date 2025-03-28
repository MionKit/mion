/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {registerFormatter, getToLiteralFn} from '@mionkit/runtype/src/lib/formats';
import {JitRunTypeFormatter} from '@mionkit/runtype/src/lib/baseFormatter';
import {ReflectionKind} from '@deepkit/type';
import {MockOperation} from '@mionkit/runtype/src/types';
import {mockString, random, randomItem} from '@mionkit/runtype/src/lib/mock';
import {regexpEscape} from '@mionkit/runtype/src/lib/utils';

// ############### String Format Params ###############
export type ParamInfo =
    | {message?: string; samples: string[]; sampleChars?: never}
    | {message?: string; sampleChars: string; samples?: never};

export type StringValidatorsParams = {
    // validators
    maxLength?: number;
    minLength?: number;
    length?: number;
    allowedChars?: {allowed: string; message?: string};
    disallowedChars?: {disallowed: string} & ParamInfo;
    allowedValues?: {allowed: string[]; message?: string};
    disallowedValues?: {disallowed: string[]} & ParamInfo;
    pattern?: {regexp: RegExp} & ParamInfo;
};
export type StringTransformersParams = {
    // formatters
    lowercase?: boolean;
    uppercase?: boolean;
    capitalize?: boolean;
    trim?: boolean;
    replace?: {searchValue: string; replaceValue: string};
    replaceAll?: {searchValue: string; replaceValue: string};
};
export type StringFormatParams = StringValidatorsParams & StringTransformersParams;

// ############### Base String Format ###############

export type StringFormat<P extends StringFormatParams = {}> = TypeFormat<string, typeof StringFormatter.id, P>;
const defaultMessages = {
    allowedChars: 'Invalid characters',
    disallowedChars: 'Invalid characters',
    allowedValues: 'Invalid value',
    disallowedValues: 'Invalid value',
    pattern: 'Invalid pattern',
};
const ignoreJitParams = ['samples', 'sampleChars'];

// ############### Validator ###############
class StringFormatter extends JitRunTypeFormatter<StringFormatParams> {
    static readonly id = 'strFormat' as const;
    readonly kind = ReflectionKind.string;
    readonly name = StringFormatter.id;
    readonly ignoreJitParams = ignoreJitParams;
    _compileFormat(comp: JitCompiler, rt: BaseRunType): string | undefined {
        const operations: ((v) => string)[] = [];
        const p = this.getParams(rt);
        const vλl = comp.vλl;
        if (p.trim) operations.push((v) => `${v}.trim()`);
        if (p.replace) operations.push((v) => `${v}.replace(${p?.replace?.searchValue}, ${p?.replace?.replaceValue})`);
        if (p.replaceAll)
            operations.push((v) => `${v}.replaceAll(${p?.replaceAll?.searchValue}, ${p?.replaceAll?.replaceValue})`);
        if (p.lowercase) operations.push((v) => `${v}.toLowerCase()`);
        if (p.uppercase) operations.push((v) => `${v}.toUpperCase()`);
        if (p.capitalize) operations.push((v) => `(${v}.charAt(0).toUpperCase() + ${vλl}.slice(1))`);
        return operations.reduce((acc, op) => op(acc), vλl);
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const conditions: string[] = [];
        const p = this.getParams(rt);
        const vλl = comp.vλl;
        const literalFn = getToLiteralFn(comp, this.ignoreJitParams);
        if (p.maxLength !== undefined) conditions.push(`${vλl}.length <= ${literalFn(p.maxLength)}`);
        if (p.minLength !== undefined) conditions.push(`${vλl}.length >= ${literalFn(p.minLength)}`);
        if (p.length !== undefined) conditions.push(`${vλl}.length === ${literalFn(p.length)}`);
        if (p.pattern !== undefined) conditions.push(`${literalFn(p.pattern.regexp)}.test(${vλl})`);
        if (p.allowedChars) {
            const regexp = getAllowedCharsRegexp(p.allowedChars.allowed);
            conditions.push(`${literalFn(regexp)}.test(${vλl})`);
        }
        if (p.disallowedChars) {
            const regexp = getDisallowedCharsRegexp(p.disallowedChars.disallowed);
            conditions.push(`!${literalFn(regexp)}.test(${vλl})`);
        }
        if (p.allowedValues) conditions.push(`${literalFn(p.allowedValues.allowed)}.includes(${vλl})`);
        if (p.disallowedValues) conditions.push(`!${literalFn(p.disallowedValues.disallowed)}.includes(${vλl})`);
        return conditions.join(' && ');
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const conditions: string[] = [];
        const p = this.getParams(rt);
        const vλl = comp.vλl;
        const literalFn = getToLiteralFn(comp, this.ignoreJitParams);
        const errFn = comp.getCallJitFormatErr(rt, this);
        if (p.maxLength !== undefined) {
            const errCode = errFn('maxLength', p.maxLength);
            conditions.push(`if (${vλl}.length > ${literalFn(p.maxLength)}) ${errCode}`);
        }

        if (p.minLength !== undefined) {
            const errCode = errFn('minLength', p.minLength);
            conditions.push(`if (${vλl}.length < ${literalFn(p.minLength)}) ${errCode}`);
        }
        if (p.length !== undefined) {
            const errCode = errFn('length', p.length);
            conditions.push(`if (${vλl}.length !== ${literalFn(p.length)}) ${errCode}`);
        }
        if (p.pattern !== undefined) {
            const errCode = errFn('pattern', getDefaultMessage('pattern', p));
            conditions.push(`if (!${literalFn(p.pattern.regexp)}.test(${vλl})) ${errCode}`);
        }
        if (p.allowedChars) {
            const regexp = getAllowedCharsRegexp(p.allowedChars.allowed);
            const errCode = errFn('allowedChars', getDefaultMessage('allowedChars', p));
            conditions.push(`if (!${literalFn(regexp)}.test(${vλl})) ${errCode}`);
        }
        if (p.disallowedChars) {
            const regexp = getDisallowedCharsRegexp(p.disallowedChars.disallowed);
            const errCode = errFn('disallowedChars', getDefaultMessage('disallowedChars', p));
            conditions.push(`if (${literalFn(regexp)}.test(${vλl})) ${errCode}`);
        }
        if (p.allowedValues) {
            const errCode = errFn('allowedValues', getDefaultMessage('allowedValues', p));
            conditions.push(`if (!${literalFn(p.allowedValues.allowed)}.includes(${vλl})) ${errCode}`);
        }
        if (p.disallowedValues) {
            const errCode = errFn('disallowedValues', getDefaultMessage('disallowedValues', p));
            conditions.push(`if (${literalFn(p.disallowedValues.disallowed)}.includes(${vλl})) ${errCode}`);
        }
        return conditions.join(';');
    }
    _mock(mockContext: MockOperation, rt: BaseRunType, params?: StringFormatParams): string {
        const p = params || this.getParams(rt);
        if (p.pattern?.samples) {
            return randomItem(p.pattern.samples);
        }
        if (p.allowedValues) {
            return randomItem(p.allowedValues.allowed);
        }
        if (p.pattern?.sampleChars) {
            const newAllowedChars = p.allowedChars ? p.allowedChars.allowed + p.pattern.sampleChars : p.pattern.sampleChars;
            const newMinLength = p.minLength ? p.minLength : 1; // patterns will fail if generated string length is 0
            const newParams = {
                ...p,
                pattern: undefined,
                allowedChars: {allowed: newAllowedChars, message: p.pattern.message},
                minLength: newMinLength,
            };
            return this._mock(mockContext, rt, newParams);
        }
        switch (true) {
            case p.length !== undefined:
                return mockString(p.length, p.allowedChars?.allowed, p.disallowedChars?.disallowed);
            case p.maxLength !== undefined && p.minLength !== undefined:
                return mockString(random(p.minLength, p.maxLength), p.allowedChars?.allowed, p.disallowedChars?.disallowed);
            case p.maxLength !== undefined:
                return mockString(random(0, p.maxLength), p.allowedChars?.allowed, p.disallowedChars?.disallowed);
            case p.minLength !== undefined:
                return mockString(
                    random(p.minLength, p.minLength + random(1, 1 + p.minLength * 2)),
                    p.allowedChars?.allowed,
                    p.disallowedChars?.disallowed
                );
            default:
                return mockString(undefined, p.allowedChars?.allowed, p.disallowedChars?.disallowed);
        }
    }
    _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string {
        const params = this.getParams(rt);
        if (params.lowercase) return val.toLowerCase();
        if (params.uppercase) return val.toUpperCase();
        if (params.capitalize) return val.charAt(0).toUpperCase() + val.slice(1);
        return val;
    }
    validateParams(rt: BaseRunType, p: StringFormatParams): void {
        const tName = rt.getTypeName();

        if (p.length !== undefined && (p.maxLength !== undefined || p.minLength !== undefined))
            throw new Error(`length can not be used with maxLength or minLength in ${tName}`);
        if (p.maxLength !== undefined && p.minLength !== undefined && p.maxLength < p.minLength)
            throw new Error(`maxLength can not be less than minLength in ${tName}`);

        const complexParams = [
            {name: 'pattern', param: p.pattern},
            {name: 'allowedChars', param: p.allowedChars},
            {name: 'disallowedChars', param: p.disallowedChars},
            {name: 'allowedValues', param: p.allowedValues},
            {name: 'disallowedValues', param: p.disallowedValues},
        ].filter((p) => p.param);
        if (complexParams.length > 1) {
            throw new Error(
                `Only one of the parameters [pattern, allowedChars, disallowedChars, allowedValues, disallowedValues] pattern can be used at once in ${tName}`
            );
        }

        const throwIfInvalid = (v: any, name: string, subName: string, typeName: string) => {
            const skipLengthChecks = subName === 'sampleChars';
            const err = getParamError(v, p, skipLengthChecks);
            if (err) throw new Error(`Parameter ${name}.${subName} "${v}" does not satisfies "${err}" in type ${typeName}`);
        };
        complexParams.forEach((c) => {
            const {samples, sampleChars, regexp, allowed} = c.param as any;
            if (samples && sampleChars)
                throw new Error(`${c.name}.samples and pattern.sampleChars can not be used together in ${tName}`);
            if (samples && samples.length === 0) throw new Error(`pattern.samples can not be an empty array in ${tName}`);
            if (sampleChars && sampleChars.length === 0)
                throw new Error(`${c.name}.sampleChars can not be an empty string in ${tName}`);
            if (c.name === 'allowedChars' && allowed) throwIfInvalid(allowed, c.name, 'allowed', tName);
            if (c.name === 'allowedValues' && allowed) allowed.forEach((v) => throwIfInvalid(v, c.name, 'allowed', tName));
            samples?.forEach((sample) => throwIfInvalid(sample, c.name, 'samples', tName));
            // TODO: Bellow checks might cause problems
            // This us because replace and replaceAll might not pass regexp validation on their own
            // but could do once the operation is applied or mock value is generated
            if (sampleChars) sampleChars.split('').forEach((char) => throwIfInvalid(char, c.name, 'sampleChars', tName));
            if (regexp && p.replace && !regexp.test(p.replace.searchValue))
                throw new Error(`replace.searchValue "${p.replace.searchValue}" invalid for pattern ${regexp} in ${tName}`);
            if (regexp && p.replaceAll && !regexp.test(p.replaceAll.searchValue))
                throw new Error(`replaceAll.searchValue "${p.replaceAll.searchValue}" invalid for pattern ${regexp} in ${tName}`);
        });

        if ([p.lowercase, p.uppercase, p.capitalize].filter(Boolean).length > 1) {
            throw new Error(`Only one text formatter (lowercase, uppercase, capitalize) allowed for ${tName}`);
        }
    }
}

function getParamError(v: any, p: StringFormatParams, skipLengthChecks = false): string | undefined {
    if (!skipLengthChecks) {
        if (p.maxLength !== undefined && v.length > p.maxLength) return 'maxLength';
        if (p.minLength !== undefined && v.length < p.minLength) return 'minLength';
        if (p.length !== undefined && v.length !== p.length) return 'length';
    }
    if (p.pattern && !p.pattern.regexp.test(v)) return 'pattern';
    if (p.allowedChars && !getAllowedCharsRegexp(p.allowedChars.allowed).test(v)) return 'allowedChars';
    if (p.disallowedChars && getDisallowedCharsRegexp(p.disallowedChars.disallowed).test(v)) return 'disallowedChars';
    if (p.allowedValues && !p.allowedValues.allowed.includes(v)) return 'allowedValues';
    if (p.disallowedValues && p.disallowedValues.disallowed.includes(v)) return 'disallowedValues';
}

function getDefaultMessage(name: keyof typeof defaultMessages, p: StringFormatParams): string {
    return p[name]?.message || defaultMessages[name];
}

function getAllowedCharsRegexp(allowedChars: string): RegExp {
    return new RegExp(`^[${regexpEscape(allowedChars)}]+$`);
}
function getDisallowedCharsRegexp(disallowedChars: string): RegExp {
    return new RegExp(`[${regexpEscape(disallowedChars)}]`);
}

// ############### Register runtypes ###############
// registerPureFnClosure(stringFormatErrors);

// register Validator operations so they can be used in the jit compiler
export const stringFormatter = registerFormatter(new StringFormatter());
