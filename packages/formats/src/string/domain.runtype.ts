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
import {
    ErrorsPureFunction,
    MockOperation,
    type GenericPureFunction,
    type JitFnID,
    type JitTypeErrorsFn,
    type RunTypeError,
    type StrNumber,
} from '../../../runtype/src/types';
import {TypeFormat} from '../../../runtype/src/lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {stringFormatter, stringIgnoreProps, StringValidatorsParams} from './stringFormat.runtype';
import {registerFormatter, registerPureFnClosure} from '../../../runtype/src/lib/formats';
import {random, randomItem} from '../../../runtype/src/lib/mock';
import {jitErrorArgs, JitFunctions} from '../../../runtype/src/constants';
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
    minLength: 5; // name 2 + tld 2 + 1 dot
};

export type DomainNameParams = Omit<StringValidatorsParams, 'length' | 'allowedChars' | 'disallowedChars'>;
export type TldParams = Omit<StringValidatorsParams, 'length' | 'allowedChars' | 'disallowedChars'>;

export type DomainParams = {
    maxLength: number;
    minLength: number;
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
    jitFnInlined(fnId: JitFnID, rt: BaseRunType): boolean {
        if (fnId === JitFunctions.typeErrors.id) return false; // too much logic to inline
        return super.jitFnInlined(fnId, rt);
    }
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    getIsDomainDeps(comp: JitCompiler, rt: BaseRunType, params: DomainParams) {
        const fnId = JitFunctions.isType.id;
        const formatName = this.getFormatName();
        const tldPath = this.getFormatPath('tld');
        const namesPath = this.getFormatPath('names');
        const isTldFn = stringFormatter._compile(fnId, comp, rt, params.tld, tldPath, comp.vλl, formatName);
        const isNameFn = stringFormatter._compile(fnId, comp, rt, params.names, namesPath, comp.vλl, formatName);
        return {
            isTldFn: `(${comp.vλl})=>{return ${isTldFn}}`,
            isNameFn: `(${comp.vλl})=>{return ${isNameFn}}`,
        };
    }
    getDomaineErrorsDeps(comp: JitErrorsCompiler, rt: BaseRunType, params: DomainParams) {
        const fnId = JitFunctions.typeErrors.id;
        const formatName = this.getFormatName();
        const tldPath = this.getFormatPath('tld');
        const namesPath = this.getFormatPath('names');
        const indexName = 'idx';
        const isTldFn = stringFormatter._compile(fnId, comp, rt, params.tld, tldPath, comp.vλl, formatName);
        const isNameFn = stringFormatter._compile(fnId, comp, rt, params.names, namesPath, comp.vλl, formatName, indexName);
        const args = [comp.vλl, ...Object.values(jitErrorArgs).slice(1)];
        const tldArgs = args.join(',');
        const nameArgs = [...args, indexName].join(',');
        return {
            tldErrorFn: `(${tldArgs})=>{${isTldFn}}`,
            nameErrorsFn: `(${nameArgs})=>{${isNameFn}}`,
        };
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const deps = this.getIsDomainDeps(comp, rt, params);
        const result = this.compilePureFunctionCall(comp, rt, isDomain, params, deps);
        return result.callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const deps = this.getDomaineErrorsDeps(comp, rt, params);
        return this.compileErrorsPureFunctionCall(comp, rt, domainErrors, params, deps).callCode;
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
        if (params.minLength < 3) throw new Error(`Domain minLength cannot be less than 3 in type ${rt.getTypeName()}`);
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

export type isDomainDeps = {
    isTldFn: (d: string) => boolean;
    isNameFn: (d: string) => boolean;
};

/** @reflection never */
export function isDomain() {
    return function is_domain(d: string, p: DomainParams, deps: isDomainDeps): boolean {
        if (d.length > p.maxLength) return false;
        if (d.length < p.minLength) return false;
        let partsCount = 0;
        let start = 0;
        let pos: number;
        let part: string;
        while ((pos = d.indexOf('.', start)) !== -1) {
            partsCount++;
            part = d.substring(start, pos);
            if (!deps.isNameFn(part)) return false;
            if (part.startsWith('-') || part.endsWith('-')) return false;
            start = pos + 1;
        }
        partsCount++; // Count the TLD part
        if (partsCount < p.minParts || partsCount > p.maxParts) return false;
        part = d.substring(start);
        if (!deps.isTldFn(part)) return false;
        if (part.startsWith('-') || part.endsWith('-')) return false;
        return true;
    } as GenericPureFunction<DomainParams>;
}

export type DomainErrorsDeps = {
    tldErrorFn: JitTypeErrorsFn;
    nameErrorsFn: (v: any, path: StrNumber[], err: RunTypeError[], idx: number) => RunTypeError[];
};

/* eslint-disable no-constant-condition */
/** @reflection never */
export function domainErrors(utl: JITUtils) {
    return function domain_errors(
        val: string,
        path: StrNumber[],
        ers: RunTypeError[],
        exp: string,
        fmtName: string,
        p: DomainParams,
        fmtPath: StrNumber[],
        deps: DomainErrorsDeps,
        accessPath?: StrNumber[]
    ): RunTypeError[] {
        // Validate total length
        if (val.length > p.maxLength)
            return utl.formatErr(path, ers, exp, fmtName, 'maxLength', p.maxLength, fmtPath, accessPath), ers;
        if (val.length < p.minLength)
            return utl.formatErr(path, ers, exp, fmtName, 'minLength', p.minLength, fmtPath, accessPath), ers;
        // Validate each part using substring and index positions
        let partIndex = 0;
        let start = 0;
        while (true) {
            const pos = val.indexOf('.', start);
            if (pos === -1) {
                // last part -> TLD
                const tld = val.substring(start);
                if (tld.startsWith('-') || tld.endsWith('-'))
                    return utl.formatErr(path, ers, exp, fmtName, 'hyphen', tld, [...fmtPath, 'tld'], accessPath), ers;
                deps.tldErrorFn(tld, path, ers);
                break;
            } else {
                const part = val.substring(start, pos);
                if (part.startsWith('-') || part.endsWith('-'))
                    return (
                        utl.formatErr(path, ers, exp, fmtName, 'hyphen', part, [...fmtPath, 'names', partIndex], accessPath), ers
                    );
                deps.nameErrorsFn(part, path, ers, partIndex);
                partIndex++;
                start = pos + 1;
            }
        }
        partIndex++; // Count the TLD part
        if (partIndex < p.minParts)
            return utl.formatErr(path, ers, exp, fmtName, 'minParts', p.minParts, fmtPath, accessPath), ers;
        if (partIndex > p.maxParts)
            return utl.formatErr(path, ers, exp, fmtName, 'maxParts', p.maxParts, fmtPath, accessPath), ers;
        return ers;
    } as ErrorsPureFunction<DomainParams>;
}

// ############### Register runtypes ###############

// register pure functions so they can be used in the jit compiler
registerPureFnClosure(isDomain);
registerPureFnClosure(domainErrors);

// register Validator operations so they can be used in the jit compiler
export const domainFormatter = registerFormatter(new DomainFormatter());
