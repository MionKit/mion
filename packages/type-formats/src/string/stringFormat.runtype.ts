/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, JitCode} from '@mionkit/run-types';
import {TypeFormat, registerFormatter, getToLiteralFn, BaseRunTypeFormat, RunTypeOptions} from '@mionkit/run-types'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {ReflectionKind} from '@deepkit/type';
import {mockString, random, randomItem} from '@mionkit/run-types';
import {paramVal, regexpEscape} from '../utils';
import {FormatParam_Pattern, StringParams} from '@mionkit/core';

const defaultMessages = {
    allowedChars: 'Invalid characters',
    disallowedChars: 'Invalid characters',
    allowedValues: 'Invalid value',
    disallowedValues: 'Invalid value',
    pattern: 'Invalid pattern',
};
const propsWithRequiredSamples = ['disallowedChars', 'disallowedChars', 'pattern'];
export const stringIgnoreProps = ['samples', 'sampleChars'];

// ############### String Format ###############

/**
 * StringFormat is the base class for all string formats.
 * It is used to define the string format and its parameters.
 * Jit code will be generated for each one of the StringFormat parameters.
 */
export class StringRunTypeFormat extends BaseRunTypeFormat<StringParams> {
    static readonly id = 'stringFormat' as const;
    readonly kind = ReflectionKind.string;
    readonly name = StringRunTypeFormat.id;

    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    emitFormat(comp: JitFnCompiler, rt: BaseRunType): JitCode {
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
        return {code: operations.reduce((acc, op) => op(acc), vλl), type: 'E'};
    }
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const conditions: string[] = [];
        const p = this.getParams(rt);
        const vλl = comp.vλl;
        const literalFn = getToLiteralFn(comp, this.getIgnoredProps());
        if (p.maxLength !== undefined) conditions.push(`${vλl}.length <= ${literalFn(p.maxLength)}`);
        if (p.minLength !== undefined) conditions.push(`${vλl}.length >= ${literalFn(p.minLength)}`);
        if (p.length !== undefined) conditions.push(`${vλl}.length === ${literalFn(p.length)}`);
        if (p.pattern !== undefined) conditions.push(`${literalFn(p.pattern.val)}.test(${vλl})`);
        if (p.allowedChars) {
            const regexp = getAllowedCharsRegexp(p.allowedChars.val, p.allowedChars.ignoreCase);
            conditions.push(`${literalFn(regexp)}.test(${vλl})`);
        }
        if (p.disallowedChars) {
            const regexp = getDisallowedCharsRegexp(p.disallowedChars.val, p.disallowedChars.ignoreCase);
            conditions.push(`!${literalFn(regexp)}.test(${vλl})`);
        }
        if (p.allowedValues) {
            const regexp = getAllowedValuesRegexp(p.allowedValues.val, p.allowedValues.ignoreCase);
            conditions.push(`${literalFn(regexp)}.test(${vλl})`);
        }
        if (p.disallowedValues) {
            const regexp = getDisallowedValuesRegexp(p.disallowedValues.val, p.disallowedValues.ignoreCase);
            conditions.push(`!${literalFn(regexp)}.test(${vλl})`);
        }
        return {code: conditions.join(' && '), type: 'E'};
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const conditions: string[] = [];
        const p = this.getParams(rt);
        const vλl = comp.vλl;
        const literalFn = getToLiteralFn(comp, this.getIgnoredProps());
        const errFn = this.getCallJitFormatErr(comp, rt, this, false);
        if (p.maxLength !== undefined) {
            const maxL = paramVal(p.maxLength);
            const errCode = errFn('maxLength', maxL);
            conditions.push(`if (${vλl}.length > ${maxL}) ${errCode}`);
        }

        if (p.minLength !== undefined) {
            const minL = paramVal(p.minLength);
            const errCode = errFn('minLength', minL);
            conditions.push(`if (${vλl}.length < ${minL}) ${errCode}`);
        }
        if (p.length !== undefined) {
            const length = paramVal(p.length);
            const errCode = errFn('length', length);
            conditions.push(`if (${vλl}.length !== ${length}) ${errCode}`);
        }
        if (p.pattern !== undefined) {
            const errCode = errFn('pattern', getDefaultMessage('pattern', p));
            conditions.push(`if (!${literalFn(p.pattern.val)}.test(${vλl})) ${errCode}`);
        }
        if (p.allowedChars) {
            const regexp = getAllowedCharsRegexp(p.allowedChars.val, p.allowedChars.ignoreCase);
            const errCode = errFn('allowedChars', getDefaultMessage('allowedChars', p));
            conditions.push(`if (!${literalFn(regexp)}.test(${vλl})) ${errCode}`);
        }
        if (p.disallowedChars) {
            const regexp = getDisallowedCharsRegexp(p.disallowedChars.val, p.disallowedChars.ignoreCase);
            const errCode = errFn('disallowedChars', getDefaultMessage('disallowedChars', p));
            conditions.push(`if (${literalFn(regexp)}.test(${vλl})) ${errCode}`);
        }
        if (p.allowedValues) {
            const regexp = getAllowedValuesRegexp(p.allowedValues.val, p.allowedValues.ignoreCase);
            const errCode = errFn('allowedValues', getDefaultMessage('allowedValues', p));
            conditions.push(`if (!${literalFn(regexp)}.test(${vλl})) ${errCode}`);
        }
        if (p.disallowedValues) {
            const regexp = getDisallowedValuesRegexp(p.disallowedValues.val, p.disallowedValues.ignoreCase);
            const errCode = errFn('disallowedValues', getDefaultMessage('disallowedValues', p));
            conditions.push(`if (${literalFn(regexp)}.test(${vλl})) ${errCode}`);
        }
        return {code: conditions.join(';'), type: 'S'};
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType, params?: StringParams): string {
        const p = params || this.getParams(rt);
        if (p.allowedValues) return randomItem(p.allowedValues.val as string[]);

        const samples = p.pattern?.mockSamples || p.disallowedChars?.mockSamples || p.disallowedValues?.mockSamples;

        // if samples is an array we mock a value from one of the samples
        if (samples && typeof samples !== 'string' && Array.isArray(samples)) {
            const ignoreCase = p.disallowedChars?.ignoreCase || p.disallowedValues?.ignoreCase;
            const samplesAllCases = ignoreCase ? valuesAllCases(samples) : samples;
            return randomItem(samplesAllCases);
        }

        // if samples is a string we mock a random string using the samples as allowedChars
        if (samples && typeof samples === 'string') {
            return this.mockString(p, samples, undefined);
        }

        const allowedChars = p.allowedChars?.ignoreCase ? charsAllCases(p.allowedChars.val) : p.allowedChars?.val;
        const disallowedChars = p.disallowedChars?.ignoreCase ? charsAllCases(p.disallowedChars.val) : p.disallowedChars?.val;

        return this.mockString(p, allowedChars, disallowedChars);
    }
    private mockString(p: StringParams, allowedChars: string | undefined, disallowedChars: string | undefined): string {
        switch (true) {
            case p.length !== undefined:
                return mockString(paramVal(p.length), allowedChars, disallowedChars);
            case p.maxLength !== undefined && p.minLength !== undefined:
                return mockString(random(paramVal(p.minLength), paramVal(p.maxLength)), allowedChars, disallowedChars);
            case p.maxLength !== undefined:
                return mockString(random(0, paramVal(p.maxLength)), allowedChars, disallowedChars);
            case p.minLength !== undefined: {
                const minLength = paramVal(p.minLength);
                return mockString(random(minLength, minLength + random(1, 1 + minLength * 2)), allowedChars, disallowedChars);
            }
            default:
                return mockString(undefined, allowedChars, disallowedChars);
        }
    }
    validateParams(rt: BaseRunType, p: StringParams): void {
        const throwIfInvalid = (v: any, name: string, subName: 'mockSamples' | 'val', skipLengthChecks = false) => {
            const err = getParamError(v, p, skipLengthChecks);
            if (err)
                throw new Error(
                    `Parameter ${name}.${subName} "${v}" does not satisfies "${err}" in type ${this.printPath(rt, subName)}`
                );
        };

        if (p.length !== undefined && (p.maxLength !== undefined || p.minLength !== undefined))
            throw new Error(`length can not be used with maxLength or minLength in ${this.printPath(rt, 'length')}`);
        if (p.maxLength !== undefined && p.minLength !== undefined && p.maxLength < p.minLength)
            throw new Error(`maxLength can not be less than minLength in ${this.printPath(rt, 'maxLength')}`);

        if (p.allowedValues?.val && p.allowedValues?.val.length > 100)
            throw new Error(`allowedValues can not have more than 100 values in ${this.printPath(rt, 'allowedValues')}`);
        if (p.disallowedValues?.val && p.disallowedValues?.val.length > 100)
            throw new Error(`disallowedValues can not have more than 100 values in ${this.printPath(rt, 'disallowedValues')}`);

        const complexParams = [
            {name: 'pattern', param: p.pattern as NonNullable<StringParams['pattern']>},
            {name: 'allowedChars', param: p.allowedChars as NonNullable<StringParams['allowedChars']>},
            {name: 'disallowedChars', param: p.disallowedChars as NonNullable<StringParams['disallowedChars']>},
            {name: 'allowedValues', param: p.allowedValues as NonNullable<StringParams['allowedValues']>},
            {name: 'disallowedValues', param: p.disallowedValues as NonNullable<StringParams['disallowedValues']>},
        ].filter((p) => p.param !== undefined);

        if (complexParams.length > 1) {
            throw new Error(
                `Only one of the parameters [pattern, allowedChars, disallowedChars, allowedValues, disallowedValues] can be used at once in ${this.printPath(rt)}`
            );
        }

        complexParams.forEach((c) => {
            const {mockSamples} = c.param;
            const requireSamples = propsWithRequiredSamples.includes(c.name);
            if (requireSamples && !mockSamples)
                throw new Error(
                    `When ${c.name} is defined it is also required to provide samples in ${this.printPath(rt, c.name)}`
                );
            if (Array.isArray(mockSamples) && mockSamples.length === 0)
                throw new Error(`${c.name}.mockSamples can not be an empty array in ${this.printPath(rt, 'mockSamples')}`);
            if (typeof mockSamples === 'string' && mockSamples.length === 0)
                throw new Error(`${c.name}.mockSamples can not be an empty string in ${this.printPath(rt, 'mockSamples')}`);

            if (Array.isArray(mockSamples)) mockSamples.forEach((sample) => throwIfInvalid(sample, c.name, 'mockSamples'));
            if (typeof mockSamples === 'string')
                mockSamples.split('').forEach((char) => throwIfInvalid(char, c.name, 'mockSamples', true));
        });

        if (p.allowedChars?.val) throwIfInvalid(p.allowedChars?.val, 'allowedChars', 'val', true);
        p.allowedValues?.val.forEach((v) => throwIfInvalid(v, 'allowedValues', 'val'));

        // TODO: Bellow checks might cause problems
        // This us because replace and replaceAll might not pass regexp validation on their own
        // but could do once the operation is applied or mock value is generated
        if (p.pattern && p.replace && !p.pattern.val.test(p.replace.searchValue))
            throw new Error(
                `replace.searchValue "${p.replace.searchValue}" invalid for pattern ${p.pattern.val} in ${this.printPath(rt, 'replace')}`
            );
        if (p.pattern && p.replaceAll && !p.pattern.val.test(p.replaceAll.searchValue))
            throw new Error(
                `replaceAll.searchValue "${p.replaceAll.searchValue}" invalid for pattern ${p.pattern.val} in ${this.printPath(rt, 'replaceAll')}`
            );

        if ([p.lowercase, p.uppercase, p.capitalize].filter(Boolean).length > 1) {
            throw new Error(
                `Only one text formatter (lowercase, uppercase, capitalize) allowed for ${this.printPath(rt, 'formatters')}`
            );
        }
    }
}

export function isPatternParam(p: any): p is FormatParam_Pattern {
    const isMessage = p.message === undefined || typeof p.message === 'string';
    const isSamples = !!p.samples === undefined || (Array.isArray(p.samples) && p.samples.every((s) => typeof s === 'string'));
    const isSampleChars = p.sampleChars === undefined || (typeof p.sampleChars === 'string' && p.sampleChars.length > 0);
    const hasSamples = !!p.samples?.length || !!p.sampleChars?.length;
    const isRegexpObj = typeof p.regexp === 'object' && p.regexp instanceof RegExp;
    return isMessage && hasSamples && isSamples && isSampleChars && isRegexpObj;
}

export function patternParamsToStrParams(p: FormatParam_Pattern): StringParams {
    return {pattern: p};
}

function getParamError(v: any, p: StringParams, skipLengthChecks = false): string | undefined {
    if (!skipLengthChecks) {
        if (p.maxLength !== undefined && v.length > p.maxLength) return 'maxLength';
        if (p.minLength !== undefined && v.length < p.minLength) return 'minLength';
        if (p.length !== undefined && v.length !== p.length) return 'length';
    }
    if (p.pattern && !p.pattern.val.test(v)) return 'pattern';
    if (p.allowedChars && !getAllowedCharsRegexp(p.allowedChars.val).test(v)) return 'allowedChars';
    if (p.disallowedChars && getDisallowedCharsRegexp(p.disallowedChars.val).test(v)) return 'disallowedChars';
    if (p.allowedValues && !p.allowedValues.val.includes(v)) return 'allowedValues';
    if (p.disallowedValues && p.disallowedValues.val.includes(v)) return 'disallowedValues';
}

function getDefaultMessage(name: keyof typeof defaultMessages, p: StringParams): string {
    return p[name]?.errorMessage || defaultMessages[name];
}

function getAllowedCharsRegexp(allowedChars: string, ignoreCase?: boolean): RegExp {
    const flags = ignoreCase ? 'i' : '';
    return new RegExp(`^[${regexpEscape(allowedChars)}]+$`, flags);
}
function getDisallowedCharsRegexp(disallowedChars: string, ignoreCase?: boolean): RegExp {
    const flags = ignoreCase ? 'i' : '';
    return new RegExp(`[${regexpEscape(disallowedChars)}]`, flags);
}
function getAllowedValuesRegexp(allowedValues: readonly string[], ignoreCase?: boolean): RegExp {
    const flags = ignoreCase ? 'i' : '';
    return new RegExp(`^(?:${allowedValues.map((v) => regexpEscape(v)).join('|')})$`, flags);
}
function getDisallowedValuesRegexp(disallowedValues: readonly string[], ignoreCase?: boolean): RegExp {
    const flags = ignoreCase ? 'i' : '';
    return new RegExp(`^(?:${disallowedValues.map((v) => regexpEscape(v)).join('|')})$`, flags);
}

function charsAllCases(string?: string): string | undefined {
    if (!string) return;
    const chars = string.split('');
    const allCases = [...chars.map((c) => c.toLowerCase()), ...chars.map((c) => c.toUpperCase())];
    return Array.from(new Set(allCases)).join('');
}

function valuesAllCases(stringList: string[]): string[] {
    const allCases = [...stringList, ...stringList.map((s) => s.toLowerCase()), ...stringList.map((s) => s.toUpperCase())];
    return Array.from(new Set(allCases));
}

// ############### Register runtypes ###############
// registerPureFnClosure(stringFormatErrors);

// register Validator operations so they can be used in the jit compiler
export const STRING_RUN_TYPE_FORMATTER = registerFormatter(new StringRunTypeFormat());

export type StrFormat<P extends StringParams> = TypeFormat<string, typeof StringRunTypeFormat.id, P>;
