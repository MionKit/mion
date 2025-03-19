/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../../../runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../../runtype/src/lib/jitCompiler';
import {JitRunTypeFormatter} from '../../../runtype/src/lib/baseFormatter';
import {DeepPartial, ReflectionKind} from '@deepkit/type';
import {ErrorsPureFunction, GenericPureFunctionWithDeps, MockOperation, TypeFormatError} from '../../../runtype/src/types';
import {TypeFormat} from '../../../runtype/src/lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {stringFormatErrors, stringFormatter, StringValidatorsParams} from './string.runtype';
import {
    compileErrorsPureFunctionCall,
    compilePureFunctionCall,
    registerFormatter,
    registerPureFnClosure,
} from '../../../runtype/src/lib/formats';
import {random, randomItem} from '../../../runtype/src/lib/mock';
import {JitFunctions} from '../../../runtype/src/constants';
import {JITUtils} from '../../../runtype/src/lib/jitUtils';

export const DOMAIN_ALLOWED_CHARS = /^[a-zA-Z0-9-]+$/;
export const TLD_ALLOWED_CHARS = /^[a-zA-Z]+(\.[a-zA-Z]+)?$/;

export type DefaultDomainParams = {
    // officially max subdomains is 127, but practically there is never more than 4 or 5, so better default to something smaller
    maxParts: 6;
    minParts: 2;
    names: {
        maxLength: 63;
        minLength: 2;
        pattern: {
            regexp: typeof DOMAIN_ALLOWED_CHARS;
            samples: ['domain1', 'ggle', 'fcbook', 'mion', 'domain-1-2', 'my-domain', 'hello', 'world', 'example'];
            message: 'domain names can only contain letters, numbers and hyphens';
        };
    };
    tld: {
        maxLength: 12; // technical TLD max length is 63, but rarely is more than 12, as single words are the most common
        minLength: 2;
        pattern: {
            regexp: typeof TLD_ALLOWED_CHARS;
            samples: ['com', 'org', 'net', 'io', 'app', 'co', 'dev', 'tech', 'ai', 'mion', 'co.uk', 'com.au', 'com.br'];
            message: 'top level domain can only contain letters and dots';
        };
    };
    maxLength: 253;
};

export type DomainNameParams = Omit<StringValidatorsParams, 'length' | 'allowedChars' | 'disallowedChars'>;
export type TldParams = Omit<StringValidatorsParams, 'length' | 'allowedChars' | 'disallowedChars'>;

export type DomainParams = {
    maxLength: number;
    maxParts: number;
    minParts: number;
    names: DomainNameParams;
    tld: TldParams;
};

export type Domain<D extends DeepPartial<DomainParams> = {}> = TypeFormat<string, 'domain', DefaultDomainParams & D>;

// Domain validator
export class DomainFormatter extends JitRunTypeFormatter<DomainParams> {
    static id = 'domain' as const;
    kind = ReflectionKind.string;
    name = DomainFormatter.id;
    getIsDomainDeps(comp: JitCompiler, rt: BaseRunType, params: DomainParams) {
        const isTldFn = stringFormatter._compile(JitFunctions.isType.id, comp, rt, params.tld, this.getNewPath('tld'));
        const isNameFn = stringFormatter._compile(JitFunctions.isType.id, comp, rt, params.names, this.getNewPath('names'));
        return {isTldFn: `function(${comp.vλl}){return ${isTldFn}}`, isNameFn: `function(${comp.vλl}){return ${isNameFn}}`};
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const deps = this.getIsDomainDeps(comp, rt, params);
        const domainOnlyParams = {...params, names: undefined, tld: undefined};
        const result = compilePureFunctionCall(comp, rt, this, isDomain, domainOnlyParams, deps);
        return result.callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        return compileErrorsPureFunctionCall(comp, rt, this, domainErrors, params).callCode;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const tldSamples = params.tld?.pattern?.samples || ['com', 'org', 'net', 'co.uk'];
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
    private randomSubdomain(params: DomainParams): string {
        const totalSUbparts = random(1, 3);
        const samples = params.names?.pattern?.samples || ['ggle', 'fcbook', 'mion', 'domain-1', 'my-domain'];
        return Array.from({length: totalSUbparts}, () => randomItem(samples)).join('-');
    }
    _compileFormat(comp: JitCompiler): string {
        return `${comp.vλl}.toLowerCase()`; // all domain are lower case
    }
    _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string {
        return val.toLowerCase();
    }
    validateParams(rt: BaseRunType, params: DomainParams) {
        if (params.maxLength > 253) throw new Error(`Domain maxLength cannot be greater than 253 in type ${rt.getTypeName()}`);
        if (params.minParts < 2) throw new Error(`Domain minParts cannot be less than 2 in type ${rt.getTypeName()}`);
        if (params.maxParts < 2) throw new Error(`Domain maxParts cannot be less than 2 in type ${rt.getTypeName()}`);
        if (params.tld.minLength && params.tld.minLength < 2)
            throw new Error(`Domain tld.minLength cannot be less than 2 in type ${rt.getTypeName()}`);
        if (params.tld.maxLength && params.tld.maxLength > 63)
            throw new Error(`Domain tld.maxLength cannot be greater than 63 in type ${rt.getTypeName()}`);
        if (params.names.maxLength && params.names.maxLength > 63)
            throw new Error(`Domain names.maxLength cannot be greater than 63 in type ${rt.getTypeName()}`);
        stringFormatter.validateParams(rt, params);
        if (params.names) stringFormatter.validateParams(rt, params.names);
        if (params.tld) stringFormatter.validateParams(rt, params.tld);
    }
}

type isDomainDeps = {
    isTldFn: (d: string) => boolean;
    isNameFn: (d: string) => boolean;
};

/** @reflection never */
export function isDomain() {
    return function is_domain(d: string, p: DomainParams, deps: isDomainDeps): boolean {
        if (d.length > p.maxLength) return false;
        const parts = d.split('.');
        if (parts.length < p.minParts) return false;
        if (parts.length > p.maxParts) return false;
        const l = parts.length - 1;
        const tld = parts[l];
        if (!deps.isTldFn(tld)) return false;
        if (tld.startsWith('-') || tld.endsWith('-')) return false;
        for (let i = 0; i < l; i++) {
            if (!deps.isNameFn(parts[i])) return false;
            if (parts[i].startsWith('-') || parts[i].endsWith('-')) return false;
        }
        return true;
    } as GenericPureFunctionWithDeps<DomainParams>;
}

/** @reflection never */
export function domainErrors(utl: JITUtils) {
    const strFormatErr = utl.getPureFn('stringFormatErrors') as ReturnType<typeof stringFormatErrors>;
    return function domain_errors(
        d: string,
        p: DomainParams,
        fPath: (string | number)[],
        fErr: TypeFormatError[] = [],
        name = 'domain'
    ): TypeFormatError[] {
        if (d.length > p.maxLength) return fErr.push({name, formatPath: [...fPath, 'maxLength'], val: p.maxLength}), fErr;
        const parts = d.split('.');
        if (parts.length < p.minParts) fErr.push({name, formatPath: [...fPath, 'minParts'], val: p.minParts});
        if (parts.length > p.maxParts) fErr.push({name, formatPath: [...fPath, 'maxParts'], val: p.maxParts});
        const l = parts.length - 1;
        const tld = parts[l];
        if (tld.startsWith('-') || tld.endsWith('-')) fErr.push({name, formatPath: [...fPath, 'tld', 'hyphen']});
        strFormatErr(tld, p.tld, [...fPath, 'tld'], fErr, name);
        for (let i = 0; i < l; i++) {
            if (parts[i].startsWith('-') || parts[i].endsWith('-')) fErr.push({name, formatPath: [...fPath, i, 'hyphen']});
            strFormatErr(parts[i], p.names, [...fPath, 'names', i], fErr, name);
        }
        return fErr;
    } as ErrorsPureFunction<DomainParams>;
}

// export function domainErrorsSubstr(utl: JITUtils) {
//     const strFormatErr = utl.getPureFn('stringFormatErrors') as ReturnType<typeof stringFormatErrors>;
//     return function domain_errors(
//         d: string,
//         p: DomainParams,
//         fPath: (string | number)[],
//         errs: TypeFormatError[] = []
//     ): TypeFormatError[] | undefined {
//         if (d.length > p.maxLength) errs.push({name, path: [...fPath, 'maxLength'], val: p.maxLength});
//         let partCount = 0;
//         let lastDot = d.lastIndexOf('.');
//         if (lastDot === -1) {
//             errs.push({name, path: [...fPath, 'minParts'], val: p.minParts});
//             errs.push({name, path: [...fPath, 'maxParts'], val: p.maxParts});
//             return errs;
//         }
//         let prevDot = d.length;
//         while (lastDot !== -1) {
//             partCount++;
//             const label = d.substring(lastDot + 1, prevDot);
//             if (label.startsWith('-') || label.endsWith('-'))
//                 errs.push({name, path: [...fPath, partCount - 1, 'hyphen']});
//             const params = partCount === 1 ? p.tld : p.names;
//             strFormatErr(label, params, [...fPath, partCount - 1], errs);
//             prevDot = lastDot;
//             lastDot = d.lastIndexOf('.', lastDot - 1);
//         }

//         // Process first segment (before the first dot)
//         const firstLabel = d.substring(0, prevDot);
//         if (firstLabel.length === 0) {
//             errs.push({name, path: [...fPath, partCount, 'empty']});
//         } else {
//             if (firstLabel.startsWith('-') || firstLabel.endsWith('-')) {
//                 errs.push({name, path: [...fPath, partCount, 'hyphen']});
//             }
//             strFormatErr(firstLabel, p.names, [...fPath, partCount], errs);
//         }
//         partCount++;

//         // Check min/max parts
//         if (partCount < p.minParts) errs.push({name, path: [...fPath, 'minParts'], val: p.minParts});
//         if (partCount > p.maxParts) errs.push({name, path: [...fPath, 'maxParts'], val: p.maxParts});

//         return errs;
//     } as ErrorsPureFunction<DomainParams>;
// }

// ############### Register runtypes ###############

// register pure functions so they can be used in the jit compiler
registerPureFnClosure(isDomain);
registerPureFnClosure(domainErrors, [stringFormatErrors]);

// register Validator operations so they can be used in the jit compiler
export const domainFormatter = registerFormatter(new DomainFormatter());
