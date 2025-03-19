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
import {
    compileAddParamsToCtx,
    compileErrorsPureFunctionCall,
    registerFormatter,
    registerPureFnClosure,
} from '@mionkit/runtype/src/lib/formats';
import {JitRunTypeFormatter} from '@mionkit/runtype/src/lib/baseFormatter';
import {ReflectionKind} from '@deepkit/type';
import {ErrorsPureFunction, MockOperation, TypeFormatError, TypeFormatParams} from '@mionkit/runtype/src/types';
import {mockString, random, randomItem} from '@mionkit/runtype/src/lib/mock';
import {regexpEscape} from '@mionkit/runtype/src/lib/utils';

// ############### String Format Params ###############
export type PatternParam =
    | {regexp: RegExp; message: string; samples: string[]; sampleChars?: never}
    | {regexp: RegExp; message: string; sampleChars: string; samples?: never};
export type StringValidatorsParams = {
    // validators
    maxLength?: number;
    minLength?: number;
    length?: number;
    allowedChars?: string;
    disallowedChars?: string;
    allowedValues?: string[];
    disallowedValues?: string[];
    pattern?: PatternParam;
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

//
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
        const pVarName = compileAddParamsToCtx(comp, p as TypeFormatParams, ignoreJitParams).paramsName;
        if (p.maxLength !== undefined) conditions.push(`${vλl}.length <= ${pVarName}.maxLength`);
        if (p.minLength !== undefined) conditions.push(`${vλl}.length >= ${pVarName}.minLength`);
        if (p.length !== undefined) conditions.push(`${vλl}.length === ${pVarName}.length`);
        if (p.pattern !== undefined) conditions.push(`${pVarName}.pattern.regexp.test(${vλl})`);
        if (p.allowedChars) {
            const regexpVarName = compileAddParamsToCtx(comp, new RegExp(`^[${regexpEscape(p.allowedChars)}]+$`)).paramsName;
            conditions.push(`${regexpVarName}.test(${vλl})`);
        }
        if (p.disallowedChars) {
            const regexpVarName = compileAddParamsToCtx(comp, new RegExp(`[${regexpEscape(p.disallowedChars)}]`)).paramsName;
            conditions.push(`!${regexpVarName}.test(${vλl})`);
        }
        if (p.allowedValues) conditions.push(`${pVarName}.allowedValues.includes(${vλl})`);
        if (p.disallowedValues) conditions.push(`!${pVarName}.disallowedValues.includes(${vλl})`);
        return conditions.join(' && ');
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        return compileErrorsPureFunctionCall(comp, rt, this, stringFormatErrors).callCode;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType, params?: StringFormatParams): string {
        const p = params || this.getParams(rt);
        if (p.pattern?.samples) {
            return randomItem(p.pattern.samples);
        }
        if (p.pattern?.sampleChars) {
            const newAllowedChars = p.allowedChars ? p.allowedChars + p.pattern.sampleChars : p.pattern.sampleChars;
            const newMinLength = p.minLength ? p.minLength : 1; // patterns will fail if generated string length is 0
            const newParams = {...p, pattern: undefined, allowedChars: newAllowedChars, minLength: newMinLength};
            return this._mock(mockContext, rt, newParams);
        }
        switch (true) {
            case p.length !== undefined:
                return mockString(p.length, p.allowedChars, p.disallowedChars);
            case p.maxLength !== undefined && p.minLength !== undefined:
                return mockString(random(p.minLength, p.maxLength), p.allowedChars, p.disallowedChars);
            case p.maxLength !== undefined:
                return mockString(random(0, p.maxLength), p.allowedChars, p.disallowedChars);
            case p.minLength !== undefined:
                return mockString(
                    random(p.minLength, p.minLength + random(1, 1 + p.minLength * 2)),
                    p.allowedChars,
                    p.disallowedChars
                );
            default:
                return mockString(undefined, p.allowedChars, p.disallowedChars);
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
        const {regexp, sampleChars, samples} = p.pattern || {};
        const tName = rt.getTypeName();
        if (p.length !== undefined && (p.maxLength !== undefined || p.minLength !== undefined))
            throw new Error(`length can not be used with maxLength or minLength in ${tName}`);
        if (p.maxLength !== undefined && p.minLength !== undefined && p.maxLength < p.minLength)
            throw new Error(`maxLength can not be less than minLength in ${tName}`);
        if (p.pattern && p.pattern.samples && p.pattern.sampleChars)
            throw new Error(`pattern.samples and pattern.sampleChars can not be used together in ${tName}`);
        if (p.pattern && p.pattern.samples && p.pattern.samples.length === 0)
            throw new Error(`pattern.samples can not be an empty array in ${tName}`);
        if (p.pattern && p.pattern.sampleChars && p.pattern.sampleChars.length === 0)
            throw new Error(`pattern.sampleChars can not be an empty string in ${tName}`);
        if (regexp && sampleChars && !regexp.test(sampleChars))
            throw new Error(`sampleChars "${sampleChars}" contains invalid characters for pattern ${regexp} in ${tName}`);
        if (regexp && p.replace && !regexp.test(p.replace.searchValue))
            throw new Error(`replace.searchValue "${p.replace.searchValue}" invalid for pattern ${regexp} in ${tName}`);
        if (regexp && p.replaceAll && !regexp.test(p.replaceAll.searchValue))
            throw new Error(`replaceAll.searchValue "${p.replaceAll.searchValue}" invalid for pattern ${regexp} in ${tName}`);
        if ([p.lowercase, p.uppercase, p.capitalize].filter(Boolean).length > 1) {
            throw new Error(`Only one text formatter (lowercase, uppercase, capitalize) allowed for ${tName}`);
        }
        samples?.forEach((sample) => {
            const errs = [];
            getStringFormatErrors(sample, p, [], errs, 'strFormat');
            if (errs?.length) throw new Error(`sample "${sample}" fails constraints in type ${tName}`);
        });
    }
}

// ############### Pure functions ###############
/** @reflection never */
export function stringFormatErrors() {
    const alCache = new Map<string, RegExp>();
    const disCache = new Map<string, RegExp>();
    const regexpChars = /[/\-\\^$*+?.()|[\]{}]/g;
    function getRegexp(chars: string, cache: Map<string, RegExp>): RegExp {
        const existing = cache.get(chars);
        if (existing) return existing;
        if (alCache.size > 200) throw new Error('Too many allowedChars/disallowedChars patterns');
        const regexp =
            cache === alCache
                ? new RegExp(`^[${chars.replace(regexpChars, '\\$&')}]+$`)
                : new RegExp(`[${chars.replace(regexpChars, '\\$&')}]`);
        alCache.set(chars, regexp);
        return regexp;
    }
    return function string_format_errors(
        s: string,
        p: StringFormatParams,
        fPath: (string | number)[],
        fErrs: TypeFormatError[],
        name: string = 'strFormat'
    ): TypeFormatError[] {
        if (p.maxLength !== undefined && s.length > p.maxLength)
            return fErrs.push({name, formatPath: [...fPath, 'maxLength'], val: p.maxLength}), fErrs;
        if (p.minLength !== undefined && s.length < p.minLength)
            return fErrs.push({name, formatPath: [...fPath, 'minLength'], val: p.minLength}), fErrs;
        if (p.length !== undefined && s.length !== p.length)
            return fErrs.push({name, formatPath: [...fPath, 'length'], val: p.length}), fErrs;
        if (p.pattern && !p.pattern.regexp.test(s))
            return fErrs.push({name, formatPath: [...fPath, 'pattern'], val: p.pattern.message}), fErrs;
        if (p.allowedChars && !getRegexp(p.allowedChars, alCache).test(s))
            return fErrs.push({name, formatPath: [...fPath, 'allowedChars'], val: p.allowedChars}), fErrs;
        if (p.disallowedChars && getRegexp(p.disallowedChars, disCache).test(s))
            return fErrs.push({name, formatPath: [...fPath, 'disallowedChars'], val: p.disallowedChars}), fErrs;
        if (p.allowedValues && !p.allowedValues.includes(s))
            return fErrs.push({name, formatPath: [...fPath, 'allowedValues'], val: p.allowedValues}), fErrs;
        if (p.disallowedValues && p.disallowedValues.includes(s))
            return fErrs.push({name, formatPath: [...fPath, 'disallowedValues'], val: p.disallowedValues}), fErrs;
        return fErrs;
    } as ErrorsPureFunction<StringFormatParams>;
}
const getStringFormatErrors = stringFormatErrors();

// ############### Register runtypes ###############
registerPureFnClosure(stringFormatErrors);

// register Validator operations so they can be used in the jit compiler
export const stringFormatter = registerFormatter(new StringFormatter());
