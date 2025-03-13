/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeFormatter} from '../lib/jitFormatters';
import {ReflectionKind} from '@deepkit/type';
import {ErrorsPureFunction, InvalidFormatParam, InvalidFormatParams, MockOperation, PureFunction} from '../types';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {JITUtils} from '../lib/jitUtils';
import {isStringFormat, stringFormatErrors, stringFormatter, StringValidatorsParams} from './string.runtype';
import {
    compileErrorsPureFunctionCall,
    compilePureFunctionCall,
    registerFormatter,
    registerPureFunctionWithCtx,
} from '../lib/formats';
import {random, randomItem} from '../lib/mock';

export const DOMAIN_ALLOWED_CHARS = /^[a-zA-Z0-9-]+$/;
export const TLD_ALLOWED_CHARS = /^[a-zA-Z]+(\.[a-zA-Z]+)?$/;

export type DomainOnlyParams = {
    maxLength?: number;
    /** Max number of parts of the domain, each domain part is splitted by a dot, this includes TLD part, ie: .com, .co.uk */
    maxParts?: number;
    lowerCase?: boolean;
    minParts?: 2;
};
export type DomainNamesParams = StringValidatorsParams;
export type DomainTLDParams = StringValidatorsParams;
export type DomainParams = {names: DomainNamesParams; tld: DomainTLDParams} & DomainOnlyParams;

export type DefaultDomainOnlyParams = {
    maxLength: 253;
    // officially max subdomains is 127, but practically there is never more than 4 or 5, so better default to something smaller
    maxParts: 6;
    minParts: 2;
};
export type DefaultDomainNamesParams = {
    maxLength: 63;
    minLength: 2;
    pattern: typeof DOMAIN_ALLOWED_CHARS;
    samples: ['domain1', 'ggle', 'fcbook', 'mion', 'domain-1-2', 'my-domain', 'hello', 'world', 'example'];
};
export type DefaultDomainTLDParams = {
    maxLength: 63;
    minLength: 2;
    pattern: typeof TLD_ALLOWED_CHARS;
    samples: ['com', 'org', 'net', 'io', 'app', 'co', 'dev', 'tech', 'ai', 'mion', 'co.uk', 'com.au', 'com.br'];
};
export type DefaultDomainParams = {
    names: DomainNamesParams & DefaultDomainNamesParams;
    tld: DomainTLDParams & DefaultDomainTLDParams;
} & DefaultDomainOnlyParams;

export type Domain<
    D extends DomainOnlyParams = {},
    T extends DomainTLDParams = {},
    N extends DomainNamesParams = {},
> = TypeFormat<
    string,
    'domain',
    DefaultDomainOnlyParams & D & {names: DefaultDomainNamesParams & N; tld: DefaultDomainTLDParams & T}
>;

// Domain validator
export class DomainFormatter extends JitRunTypeFormatter<DomainParams> {
    static id = 'domain' as const;
    kind = ReflectionKind.string;
    name = DomainFormatter.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        return compilePureFunctionCall(comp, rt, isDomain, params);
    }
    private randomSubdomain(params: DomainParams): string {
        const totalSUbparts = random(1, 3);
        const samples = params.names.samples || ['ggle', 'fcbook', 'mion', 'domain-1', 'my-domain'];
        return Array.from({length: totalSUbparts}, () => randomItem(samples)).join('-');
    }
    _mock(mockContext: MockOperation, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const tldSamples = params.tld.samples || ['com', 'org', 'net', 'co.uk'];
        const tld = randomItem(tldSamples);
        const tldParts = tld.split('.');
        const maxP = (params.maxParts || 127) - tldParts.length;
        const minP = (params.minParts || 3) - tldParts.length;
        const maxParts = random(minP, maxP);
        const parts: string[] = [];
        for (let i = 0; i < maxParts; i++) parts.push(this.randomSubdomain(params));
        if (!parts.length) {
            parts.push(this.randomSubdomain(params));
            parts.push(tldParts.slice(1).join('.'));
        } else parts.push(tld);
        return parts.join('.');
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        // the get type errors function does not need to be so optimized so we call a single function that makes all the checks
        return compileErrorsPureFunctionCall(comp, rt, domainErrors, params, this.name);
    }
    _compileFormat(comp: JitCompiler): string {
        return `${comp.vλl}.toLowerCase()`; // all domain are lower case
    }
    _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string {
        return val.toLowerCase();
    }
    validateParams(rt: BaseRunType, params: DomainParams) {
        if (params.names) stringFormatter.validateParams(rt, params.names);
        if (params.tld) stringFormatter.validateParams(rt, params.tld);
    }
}

/** @reflection never */
export function isDomain(utl: JITUtils) {
    const isSF = utl.usePureFn('isStringFormat') as ReturnType<typeof isStringFormat>;
    return function is_domain(d: string, p: DomainParams): boolean {
        if (p.maxLength && d.length > p.maxLength) return false;
        if (p.lowerCase && d !== d.toLowerCase()) return false;
        const parts = d.split('.');
        if (p.minParts && parts.length < p.minParts) return false;
        if (p.maxParts && parts.length > p.maxParts) return false;
        const l = parts.length - 1;
        const tld = parts[l];
        if (!isSF(tld, p.tld)) return false;
        if (tld.startsWith('-') || tld.endsWith('-')) return false;
        for (let i = 0; i < l; i++) {
            if (!isSF(parts[i], p.names)) return false;
            if (parts[i].startsWith('-') || parts[i].endsWith('-')) return false;
        }
        return true;
    } as PureFunction<DefaultDomainParams>;
}

/** @reflection never */
export function domainErrors(utl: JITUtils) {
    const stringErrors = utl.usePureFn('stringFormatErrors') as ReturnType<typeof stringFormatErrors>;
    return function domain_errors(d: string, p: DomainParams): InvalidFormatParams | undefined {
        const invalid: [string, InvalidFormatParam | InvalidFormatParams][] = [];
        if (p.maxLength && d.length > p.maxLength) invalid.push([`maxLength`, p.maxLength]);
        if (p.lowerCase && d !== d.toLowerCase()) invalid.push([`lowerCase`, p.lowerCase]);
        const parts = d.split('.');
        if (p.minParts && parts.length < p.minParts) invalid.push([`minParts`, p.minParts]);
        if (p.maxParts && parts.length > p.maxParts) invalid.push([`maxParts`, p.maxParts]);
        const l = parts.length - 1;
        const tld = parts[l];
        const tldError = stringErrors(tld, p.tld);
        if (tldError) invalid.push([`tld`, tldError]);
        if (tld.startsWith('-') || tld.endsWith('-')) invalid.push([`tld`, {hyphen: true}]);
        for (let i = 0; i < l; i++) {
            const nameError = stringErrors(parts[i], p.names);
            if (nameError) invalid.push(['names', {...nameError, index: i}]);
            if (parts[i].startsWith('-') || parts[i].endsWith('-')) invalid.push(['names', {hyphen: true}]);
        }
        if (invalid.length) return Object.fromEntries(invalid);
    } as ErrorsPureFunction<DomainParams>;
}

// ############### Register runtypes ###############

// register pure functions so they can be used in the jit compiler
registerPureFunctionWithCtx(isDomain, [isStringFormat]);
registerPureFunctionWithCtx(domainErrors, [stringFormatErrors]);

// register Validator operations so they can be used in the jit compiler
export const domainFormatter = registerFormatter(new DomainFormatter());
