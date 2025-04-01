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
import {MockOperation, type jitCode, type JitFnID} from '../../../runtype/src/types';
import {TypeFormat} from '../../../runtype/src/lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {stringFormatter, stringIgnoreProps, StringValidatorsParams, type PatternParam} from './stringFormat.runtype';
import {registerFormatter} from '../../../runtype/src/lib/formats';
import {random, randomItem} from '../../../runtype/src/lib/mock';
import {jitErrorArgs, JitFunctions} from '../../../runtype/src/constants';

export const DOMAIN_PATTERN = /^(?:[a-zA-Z0-9-]{1,63}\.)*[a-zA-Z0-9-]{2,63}(\.[a-zA-Z]{2,12})+$/;
export const DOMAIN_ALLOWED_CHARS = /^[a-zA-Z0-9-]+$/;
export const TLD_ALLOWED_CHARS = /^[a-zA-Z]+(\.[a-zA-Z]+)?$/;
export const tldSamples = ['com', 'org', 'net', 'co.uk', 'io'];
export const domainPartSamples = ['mion', 'ggle', 'fbook', 'mionkit', 'domain1', 'mydomain'];

// Domain validator
export class DomainFormatter extends JitRunTypeFormatter<DomainParams> {
    static id = 'domain' as const;
    kind = ReflectionKind.string;
    name = DomainFormatter.id;
    jitFnHasReturn(fnId: JitFnID, rt: BaseRunType): boolean {
        const params = this.getParams(rt);
        if (fnId === JitFunctions.isType.id) return !params.pattern;
        return super.jitFnHasReturn(fnId, rt);
    }
    jitFnInlined(fnId: JitFnID, rt: BaseRunType): boolean {
        const params = this.getParams(rt);
        if (fnId === JitFunctions.isType.id) return !!params.pattern;
        if (fnId === JitFunctions.typeErrors.id) return !!params.pattern;
        return super.jitFnInlined(fnId, rt);
    }
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
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
    _compileIsType(comp: JitCompiler, rt: BaseRunType): jitCode {
        const params = this.getParams(rt);
        const fnId = JitFunctions.isType.id;
        const fmtName = this.getFormatName();
        const domainPath = this.getFormatPath();
        if (params.pattern) return stringFormatter._compile(fnId, comp, rt, params, domainPath, comp.vλl, fmtName);

        const vλl = comp.vλl;
        const vName = 'name'; // must match var name in code
        const vTld = 'tld'; // must match var name in code
        const vCount = 'count'; // must match var name in code
        const tldPath = this.getFormatPath('tld');
        const namePath = this.getFormatPath('names');
        const rootCode = stringFormatter._compile(fnId, comp, rt, params, domainPath, vλl, fmtName);
        const nameCode = stringFormatter._compile(fnId, comp, rt, params.names, namePath, vName, fmtName);
        const tldCode = stringFormatter._compile(fnId, comp, rt, params.tld, tldPath, vTld, fmtName);
        const maxPartsCode = params.maxParts ? `if (${vCount} > ${params.maxParts}) return false;` : '';
        const minPartsCode = params.minParts ? `if (${vCount} < ${params.minParts}) return false;` : '';
        const code = `
            if (!(${rootCode})) return false;
            let count = 1; let start = 0; let pos; let name;
            while ((pos = ${vλl}.indexOf('.', start)) !== -1) {
                name = ${vλl}.substring(start, pos);
                if (name.startsWith('-') || name.endsWith('-')) return false;
                if (!(${nameCode})) return false;
                start = pos + 1;
                count++;
            }
            ${maxPartsCode}${minPartsCode}
            const tld = ${vλl}.substring(start);
            if (!(${tldCode})) return false;
            return true;
        `;
        return code;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): jitCode {
        const params = this.getParams(rt);
        const fnId = JitFunctions.typeErrors.id;
        const fmtName = this.getFormatName();
        const domainPath = this.getFormatPath();
        if (params.pattern) return stringFormatter._compile(fnId, comp, rt, params, domainPath, comp.vλl, fmtName);
        const errFn = this.getCallJitFormatErr(comp, rt, this, true);
        const vλl = comp.vλl;
        const vName = 'name'; // must match var name in code
        const vTld = 'tld'; // must match var name in code
        const vCount = 'count'; // must match var name in code
        const tldPath = this.getFormatPath('tld');
        const namePath = this.getFormatPath('names');
        const rootCode = stringFormatter._compile(fnId, comp, rt, params, domainPath, vλl, fmtName);
        const nameCode = stringFormatter._compile(fnId, comp, rt, params.names, namePath, vName, fmtName, vCount);
        const tldCode = stringFormatter._compile(fnId, comp, rt, params.tld, tldPath, vTld, fmtName);
        const maxPartsCode = params.maxParts ? `if (${vCount} > ${params.maxParts}) ${errFn('maxParts', params.maxParts)};` : '';
        const minPartsCode = params.minParts ? `if (${vCount} < ${params.minParts}) ${errFn('minParts', params.minParts)};` : '';
        const code = `
            ${rootCode};
            let count = 0; let start = 0; let pos; let name;
            while ((pos = ${vλl}.indexOf('.', start)) !== -1) {
                name = ${vλl}.substring(start, pos);
                if (name.startsWith('-') || name.endsWith('-')) ${errFn('hyphen', 'name')};
                ${nameCode};
                start = pos + 1;
                count++;
            }
            count++;
            ${maxPartsCode}
            ${minPartsCode}
            const tld = ${vλl}.substring(start);
            ${tldCode};
        `;
        return code;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType): string {
        const params = this.getParams(rt);
        if (params.pattern) return stringFormatter.mock(mockContext, rt, params);

        const tSamples = params.tld?.pattern?.samples || tldSamples;
        const tld = randomItem(tSamples);
        const tldParts = tld.split('.');
        // force generating only one domain name more often
        const singleNameMax = tldParts.length + 1;
        const noNormalMax = Math.random() < 0.25 ? params.maxParts || 6 : singleNameMax;
        const maxP = noNormalMax - tldParts.length;
        const minP = (params.minParts || 2) - tldParts.length;
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
        const samples = params.names?.pattern?.samples || domainPartSamples;
        const nameSet = new Set<string>();
        for (let i = 0; i < totalSUbparts; i++) nameSet.add(randomItem(samples));
        const joinChar = Math.random() < 0.5 ? '-' : ''; // 50% chance to use hyphen
        return Array.from(nameSet).join(joinChar);
    }
    _compileFormat(comp: JitCompiler): string {
        return `${comp.vλl}.toLowerCase()`; // all domain are lower case
    }
    _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string {
        return val.toLowerCase();
    }
    validateParams(rt: BaseRunType, params: DomainParams) {
        if (params.maxLength && params.maxLength > 253)
            throw new Error(`Domain maxLength cannot be greater than 253 in type ${rt.getTypeName()}`);
        if (params.minLength && params.minLength < 3)
            throw new Error(`Domain minLength cannot be less than 3 in type ${rt.getTypeName()}`);
        if (params.minParts && params.minParts < 2)
            throw new Error(`Domain minParts cannot be less than 2 in type ${rt.getTypeName()}`);
        if (params.maxParts && params.maxParts < 2)
            throw new Error(`Domain maxParts cannot be less than 2 in type ${rt.getTypeName()}`);

        if (params.pattern && (params.names || params.tld))
            throw new Error(`Domain pattern cannot be used with names or tld in type ${rt.getTypeName()}`);
        if ((params.names && !params.tld) || (!params.names && params.tld))
            throw new Error(`Domain names and tld must be used together in type ${rt.getTypeName()}`);

        if (params.tld && params.tld.minLength && params.tld.minLength < 2)
            throw new Error(`Domain tld.minLength cannot be less than 2 in type ${rt.getTypeName()}`);
        if (params.tld && params.tld.maxLength && params.tld.maxLength > 63)
            throw new Error(`Domain tld.maxLength cannot be greater than 63 in type ${rt.getTypeName()}`);
        if (params.names && params.names.maxLength && params.names.maxLength > 63)
            throw new Error(`Domain names.maxLength cannot be greater than 63 in type ${rt.getTypeName()}`);
        stringFormatter.validateParams(rt, params);
        if (params.names) stringFormatter.validateParams(rt, params.names);
        if (params.tld) stringFormatter.validateParams(rt, params.tld);
    }
}

// ############### Register runtypes ###############

// register Validator operations so they can be used in the jit compiler
export const domainFormatter = registerFormatter(new DomainFormatter());

// ############### Type Params ###############

export type DefaultDomainParams = {
    maxLength: 253;
    pattern: {
        regexp: typeof DOMAIN_PATTERN;
        message: 'invalid domain';
        samples: ['ggle.com', 'mion.io', 'mionkit.io', 'yahuu.net', 'fbook.com'];
    };
};
export type DefaultStrictDomainParams = {
    // officially max subdomains is 127, but practically there is never more than 4 or 5, so better default to something smaller
    maxParts: 6;
    minParts: 2;
    names: {
        maxLength: 63;
        minLength: 2;
        pattern: {
            regexp: typeof DOMAIN_ALLOWED_CHARS;
            samples: ['domain', 'ggle', 'fbook', 'mion', 'prot', 'yahuu', 'hello', 'world', 'example', 'mionkit'];
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

export type DomainCoreParams =
    | {names: DomainNameParams; tld: TldParams; pattern?: never}
    | {names?: never; tld?: never; pattern: PatternParam};
export type DomainParams = {
    maxLength?: number;
    minLength?: number;
    maxParts?: number;
    minParts?: number;
} & DomainCoreParams;

// ############### Run Types ###############

export type Domain<D extends DeepPartial<DomainParams> = {}> = TypeFormat<string, 'domain', DefaultDomainParams & D>;
export type StrictDomain<D extends DeepPartial<DomainParams> = {}> = TypeFormat<string, 'domain', DefaultStrictDomainParams & D>;
