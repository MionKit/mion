/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeFormatter} from '../lib/jitFormatters';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {ErrorsPureFunction, InvalidFormatParams, MockOperation, PureFunction, TypeFormatInvalid} from '../types';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {JITUtils} from '../lib/jitUtils';
import {isStringFormat, stringFormatErrors, stringFormatter, StringValidatorsParams} from './string.runtype';
import {compileErrorsPureFunctionCall, compilePureFunctionCall} from '../lib/formats';
import {randomItem} from '../lib/mock';

export type DomainParams = {
    maxLength?: number;
    /** Total number of domain and subdomains, including also tld part. Min parts is always 2, domain + tld */
    maxParts?: number;
    lowerCase?: boolean;
    names?: StringValidatorsParams;
    tlds?: StringValidatorsParams;

    // no configurable checks
    minParts?: 2;
    hyphen?: true;
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type Domain<P extends DomainParams = {}> = TypeFormat<string, 'domain', P & DefaultDomainParams>;
export type DefaultDomainParams = typeof defaultDomainParams;

export const defaultDomainParams = {
    maxLength: 253,
    maxParts: 127,
    lowerCase: true,
    names: {
        maxLength: 63,
        minLength: 2,
        pattern: /^[a-zA-Z0-9-]+$/,
        samples: ['domain1', 'ggle', 'fcbook', 'mion', 'domain-1-2', 'my-domain', 'hello'],
    },
    tlds: {
        maxLength: 63,
        minLength: 2,
        pattern: /^[a-zA-Z-]+$/,
        samples: ['com', 'org', 'net', 'io', 'app', 'co', 'dev', 'tech', 'ai', 'mion'],
    },

    minParts: 2,
    hyphen: true,
} as const satisfies DomainParams;

// Domain validator
export class DomainFormatter extends JitRunTypeFormatter<DomainParams> {
    static id = 'domain' as const;
    kind = ReflectionKind.string;
    name = DomainFormatter.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, defaultDomainParams);
        return compilePureFunctionCall(comp, rt, isDomain, params);
    }
    _mock(): string {
        const totalParts = Math.floor(Math.random() * 5);
        const parts: string[] = [];
        const tld = randomItem(defaultDomainParams.tlds.samples);
        for (let i = 0; i < totalParts - 1; i++) {
            const totalSUbparts = Math.floor(Math.random() * 3);
            const subparts = Array.from({length: totalSUbparts}, () => randomItem(defaultDomainParams.names.samples)).join('-');
            parts.push(subparts);
        }
        parts.push(tld);
        return parts.join('.');
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, {});
        // the get type errors function does not need to be so optimized so we call a single function that makes all the checks
        return compileErrorsPureFunctionCall(comp, rt, domainErrors, params, this.name);
    }
    _format(comp: JitCompiler): string {
        return `${comp.vλl}.toLowerCase()`; // all domain are lower case
    }
    _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string {
        return val.toLowerCase();
    }
    validateParams(rt: BaseRunType, params: DomainParams) {
        if (params.names) stringFormatter.validateParams(rt, params.names);
        if (params.tlds) stringFormatter.validateParams(rt, params.tlds);
    }
}

/** @reflection never */
export function isDomain(utl: JITUtils) {
    const isSF = utl.usePureFn('isStringFormat') as ReturnType<typeof isStringFormat>;
    return function is_domain(d: string, utl: JITUtils, p: DefaultDomainParams): boolean {
        if (d.length > p.maxLength) return false;
        if (p.lowerCase && d !== d.toLowerCase()) return false;
        const parts = d.split('.');
        if (parts.length < p.minParts || parts.length > p.maxParts) return false;
        const tld = parts[parts.length - 1];
        if (!isSF(tld, p.tlds)) return false;
        if (tld.startsWith('-') || tld.endsWith('-')) return false;
        for (let i = 0; i < parts.length - 2; i++) {
            if (!isSF(parts[i], p.names)) return false;
            if (parts[i].startsWith('-') || parts[i].endsWith('-')) return false;
        }
        return true;
    } as PureFunction<DomainParams>;
}

/** @reflection never */
export function domainErrors(utl: JITUtils) {
    const stringErrors = utl.usePureFn('stringFormatErrors') as ReturnType<typeof stringFormatErrors>;
    return function domain_errors(d: string, p: DefaultDomainParams, pfx: string): InvalidFormatParams | undefined {
        const invalid: [string, TypeFormatInvalid][] = [];
        if (d.length > p.maxLength) invalid.push([`${pfx}maxLength`, p.maxLength]);
        if (p.lowerCase && d !== d.toLowerCase()) invalid.push([`${pfx}lowerCase`, p.lowerCase]);
        const parts = d.split('.');
        if (parts.length < p.minParts) invalid.push([`${pfx}minParts`, p.minParts]);
        if (parts.length > p.maxParts) invalid.push([`${pfx}maxParts`, p.maxParts]);
        const tld = parts[parts.length - 1];
        const tldError = stringErrors(tld, p.tlds, 'tld.');
        if (tldError) invalid.push([`${pfx}tld`, tldError]);
        if (tld.startsWith('-') || tld.endsWith('-')) invalid.push([`${pfx}tld.hyphen`, true]);
        for (let i = 0; i < parts.length - 2; i++) {
            const nameError = stringErrors(parts[i], p.names, `name[${i}].`);
            if (nameError) invalid.push([`${pfx}name[${i}]`, nameError]);
            if (parts[i].startsWith('-') || parts[i].endsWith('-')) invalid.push([`${pfx}name[${i}].hyphen`, true]);
        }
        if (invalid.length) return Object.fromEntries(invalid);
    } as ErrorsPureFunction<DomainParams>;
}
