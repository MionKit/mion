/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, JitCode, JitFnID, StrNumber} from '@mionjs/run-types';
import {
    BaseRunTypeFormat,
    RunTypeOptions,
    TypeFormat,
    registerFormatter,
    random,
    randomItem,
    JitFunctions,
} from '@mionjs/run-types'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {ReflectionKind} from '@deepkit/type';
import {StringRunTypeFormat, stringIgnoreProps} from './stringFormat.runtype.ts';
import {FormatParams_Domain, FormatParams_DomainName, FormatParams_Tld, StringParams, Samples} from '@mionjs/core';
import {StringValidators} from '@mionjs/core';
import {NAME_CHARS, NAME_SAMPLES, TLD_CHARS, TLD_SAMPLES} from '../constants.mock.ts';
import {paramVal} from '../utils.ts';

// latin domain names each domain part must be 61 chars max, tld only supports latin chars
export const DOMAIN_PATTERN = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
// unicode domain names each domain part must be 61 chars max, tld only supports latin chars
export const DOMAIN_PATTERN_UNICODE = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[a-zA-Z]{2,63}$/u;
// punycode domain names each domain part must be 61 chars max, tld supports latin, number and hyphens
export const DOMAIN_PATTERN_PUNYCODE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9-]{2,63}$/;
export const DOMAIN_ALLOWED_CHARS_PATTERN = /^[a-zA-Z0-9-]+$/;
export const TLD_ALLOWED_CHARS_PATTERN = /^[a-zA-Z]+(\.[a-zA-Z]+)?$/;

const tldAllowedChars: StringValidators['allowedChars'] = {
    val: TLD_CHARS,
    errorMessage: 'only alphabetical characters allowed',
};
const namesAllowedChars: StringValidators['allowedChars'] = {
    val: NAME_CHARS,
    errorMessage: 'only alphabetical characters and hyphens allowed',
};

// Domain validator
/** @reflection never */
export class DomainRunTypeFormat extends BaseRunTypeFormat<FormatParams_Domain> {
    static id = 'domain' as const;
    kind = ReflectionKind.string;
    name = DomainRunTypeFormat.id;

    // Formatter instances as class variables
    private rootFormatter: StringRunTypeFormat;
    private nameFormatter: StringRunTypeFormat;
    private tldFormatter: StringRunTypeFormat;

    constructor(parentPath?: StrNumber[]) {
        super(parentPath);

        // Initialize formatters in the constructor
        const domainPath = this.getFormatPath();
        const namePath = this.getFormatPath('names');
        const tldPath = this.getFormatPath('tld');

        this.rootFormatter = new StringRunTypeFormat(domainPath);
        this.nameFormatter = new StringRunTypeFormat(namePath);
        this.tldFormatter = new StringRunTypeFormat(tldPath);
    }
    canEmbedFormatterCode(fnID: JitFnID, rt: BaseRunType, p?: FormatParams_Domain): boolean {
        const params = p || this.getParams(rt);
        if (fnID === JitFunctions.isType.id || fnID === JitFunctions.typeErrors.id)
            return super.canEmbedFormatterCode(fnID, rt) && !!params.pattern;
        return super.canEmbedFormatterCode(fnID, rt);
    }
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const fnID = comp.fnID;
        const fmtName = this.getFormatName();

        if (params.pattern) return this.rootFormatter.compileFormat(fnID, comp, rt, params, comp.vλl, fmtName);

        const vλl = comp.vλl;
        const vName = 'name' + this.getFormatNestLevel(); // must match var name in code
        const vTld = 'tld' + this.getFormatNestLevel(); // must match var name in code
        const vCount = 'count' + this.getFormatNestLevel(); // must match var name in code
        const vStart = 'start' + this.getFormatNestLevel(); // must match var name in code
        const vPos = 'pos' + this.getFormatNestLevel(); // must match var name in code

        const rootCode = this.rootFormatter.compileFormat(fnID, comp, rt, params, vλl, fmtName);
        const nameCode = this.nameFormatter.compileFormat(fnID, comp, rt, params.names, vName, fmtName);
        const tldCode = this.tldFormatter.compileFormat(fnID, comp, rt, params.tld, vTld, fmtName);
        const maxPartsCode = params.maxParts ? `if (${vCount} > ${params.maxParts}) return false;` : '';
        const minPartsCode = params.minParts ? `if (${vCount} < ${params.minParts}) return false;` : '';
        // if rootCode is empty, we don't need to emit jit code for it
        const rootSafeCode = rootCode.code ? `if (!(${rootCode.code})) return false;` : '';
        const tldSafeCode = tldCode.code
            ? `const ${vTld} = ${vλl}.substring(${vStart}); if (!(${tldCode.code})) return false;`
            : '';
        const returnCode = this.isRootFormat() ? `return true;` : '';
        const skipCount = !maxPartsCode && !minPartsCode && !tldCode.code;
        const code = `
            ${rootSafeCode}
            let ${vCount} = 1; let ${vStart} = 0; let ${vPos}; let ${vName};
            while ((${vPos} = ${vλl}.indexOf('.', ${vStart})) !== -1) {
                ${vName} = ${vλl}.substring(${vStart}, ${vPos});
                ${!params.names?.allowedValues ? `if (${vName}.startsWith('-') || ${vName}.endsWith('-')) return false;` : ''}
                if (!(${nameCode.code})) return false;
                ${vStart} = ${vPos} + 1;
                ${!skipCount ? `${vCount}++;` : ''}
            }
            ${maxPartsCode}
            ${minPartsCode}
            ${tldSafeCode}
            ${returnCode}
        `;
        return {code, type: 'S'};
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const fnID = comp.fnID;
        const fmtName = this.getFormatName();

        if (params.pattern) return this.rootFormatter.compileFormat(fnID, comp, rt, params, comp.vλl, fmtName);

        const errFn = this.getCallJitFormatErr(comp, rt, this, false);
        const vλl = comp.vλl;
        const vName = 'name' + this.getFormatNestLevel(); // must match var name in code
        const vTld = 'tld' + this.getFormatNestLevel(); // must match var name in code
        const vCount = 'count' + this.getFormatNestLevel(); // must match var name in code
        const vStart = 'start' + this.getFormatNestLevel(); // must match var name in code
        const vPos = 'pos' + this.getFormatNestLevel(); // must match var name in code

        const rootCode = this.rootFormatter.compileFormat(fnID, comp, rt, params, vλl, fmtName);
        const nameCode = this.nameFormatter.compileFormat(fnID, comp, rt, params.names, vName, fmtName, vCount);
        const tldCode = this.tldFormatter.compileFormat(fnID, comp, rt, params.tld, vTld, fmtName);
        const maxPartsCode = params.maxParts
            ? `if (${vCount} > ${params.maxParts}) ${errFn('maxParts', paramVal(params.maxParts))};`
            : '';
        const minPartsCode = params.minParts
            ? `if (${vCount} < ${params.minParts}) ${errFn('minParts', paramVal(params.minParts))};`
            : '';

        const tldSafeCode = tldCode.code ? `const ${vTld} = ${vλl}.substring(${vStart}); ${tldCode.code};` : '';
        const skipCount = !maxPartsCode && !minPartsCode && !tldCode.code;
        const code = `
            ${rootCode.code};
            let ${vCount} = 0; let ${vStart} = 0; let ${vPos}; let ${vName};
            while ((${vPos} = ${vλl}.indexOf('.', ${vStart})) !== -1) {
                ${vName} = ${vλl}.substring(${vStart}, ${vPos});
                ${!params.names?.allowedValues ? `if (${vName}.startsWith('-') || ${vName}.endsWith('-')) ${errFn('hyphen', 'name')};` : ''}
                ${nameCode.code};
                ${vStart} = ${vPos} + 1;
                ${!skipCount ? `${vCount}++;` : ''}
            }
            ${!skipCount ? `${vCount}++;` : ''}
            ${maxPartsCode}
            ${minPartsCode}
            ${tldSafeCode};
        `;
        return {code, type: 'S'};
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType): string {
        const params = this.getParams(rt);
        if (params.pattern) return this.rootFormatter.mock(opts, rt, params);

        const maxParts = paramVal(params.maxParts || 6);
        const minParts = paramVal(params.minParts || 2);
        const maxLength = paramVal(params.maxLength || 253);
        const minLength = paramVal(params.minLength || 3);
        let tld = this.mockTld(opts, rt, params.tld as FormatParams_Tld);
        const tldParts = tld.split('.');
        // ensure tld is not too long
        while (tldParts.length > 1 && tldParts.length >= maxParts) tldParts.shift();
        tld = tldParts.join('.');

        // force generating only one domain name more often
        const singleNameMax = tldParts.length + 1;
        // reduce probability of generating many subdomains
        const noNormalMax = Math.random() < 0.2 ? maxParts : singleNameMax;
        const maxRandom = noNormalMax - tldParts.length;
        const minRandom = minParts - paramVal(tldParts.length);
        const maxRandomParts = random(minRandom, maxRandom);
        const parts: string[] = [];

        parts.push(this.mockName(opts, rt, params.names as FormatParams_DomainName));
        let name = parts[0];
        let domain = `${name}.${tld}`;

        // keep adding names until we reach maxRandom or maxes are reached
        while ((domain.length < maxLength && parts.length < maxRandomParts) || domain.length < minLength) {
            parts.push(this.mockName(opts, rt, params.names as FormatParams_DomainName));
            name = parts.join('.');
            domain = `${name}.${tld}`;
        }

        return domain;
    }
    private hasNoConstrains(params: StringParams): boolean {
        return !params.allowedChars && !params.disallowedChars && !params.pattern && !params.allowedValues;
    }
    private mockName(opts: RunTypeOptions, rt: BaseRunType, params: FormatParams_DomainName): string {
        const hasParams = !!Object.keys(params).length;
        if (!hasParams) return randomItem(NAME_SAMPLES);
        const defaultParams = {
            ...params,
            maxLength: params.maxLength ?? 63,
            minLength: params.minLength ?? 2,
            pattern: params.pattern,
            allowedValues: params.allowedValues,
            disallowedValues: params.disallowedValues,
            allowedChars: this.hasNoConstrains(params) ? namesAllowedChars : undefined,
        };
        return this.nameFormatter.mock(opts, rt, defaultParams);
    }
    private mockTld(opts: RunTypeOptions, rt: BaseRunType, params: FormatParams_Tld): string {
        const hasParams = !!Object.keys(params).length;
        if (!hasParams) return randomItem(TLD_SAMPLES);
        const defaultParams = {
            ...params,
            maxLength: params.maxLength ?? 12,
            minLength: params.minLength ?? 2,
            pattern: params.pattern,
            allowedValues: params.allowedValues,
            disallowedValues: params.disallowedValues,
            allowedChars: this.hasNoConstrains(params) ? tldAllowedChars : undefined,
        };
        return this.tldFormatter.mock(opts, rt, defaultParams);
    }
    emitFormat(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl}.toLowerCase()`, type: 'E'}; // all domain are lower case
    }
    _formatMockedValue(opts: RunTypeOptions, _rt: BaseRunType, val: any): string {
        return val.toLowerCase();
    }
    validateParams(rt: BaseRunType, params: FormatParams_Domain) {
        const onlyOne = [params.names, params.pattern].filter(Boolean);
        if (onlyOne.length > 1)
            throw new Error(`Domain can only have one of (names & tld), pattern or allowedValues in type ${this.printPath(rt)}`);
        if (params.maxLength && paramVal(params.maxLength) > 253)
            throw new Error(`Domain maxLength cannot be greater than 253 in type ${this.printPath(rt, 'maxLength')}`);
        if (params.minLength && paramVal(params.minLength) < 3)
            throw new Error(`Domain minLength cannot be less than 3 in type ${this.printPath(rt, 'minLength')}`);
        if (params.minParts && paramVal(params.minParts) < 2)
            throw new Error(`Domain minParts cannot be less than 2 in type ${this.printPath(rt, 'minParts')}`);
        if (params.maxParts && paramVal(params.maxParts) < 2)
            throw new Error(`Domain maxParts cannot be less than 2 in type ${this.printPath(rt, 'maxParts')}`);
        if ((params.names && !params.tld) || (!params.names && params.tld))
            throw new Error(`Domain names and tld must be used together in type ${this.printPath(rt, 'maxParts')}`);
        if (params.tld && params.tld.minLength && paramVal(params.tld.minLength) < 2)
            throw new Error(`Domain tld.minLength cannot be less than 2 in type ${this.printPath(rt, 'tld.minLength')}`);
        if (params.tld && params.tld.maxLength && paramVal(params.tld.maxLength) > 63)
            throw new Error(`Domain tld.maxLength cannot be greater than 63 in type ${this.printPath(rt, 'tld.maxLength')}`);
        if (params.names && params.names.maxLength && paramVal(params.names.maxLength) > 63)
            throw new Error(`Domain names.maxLength cannot be greater than 63 in type ${this.printPath(rt, 'names.maxLength')}`);

        this.rootFormatter.validateParams(rt, params);

        if (params.names?.allowedValues)
            params.names?.allowedValues.val.forEach((val) => {
                if (val.startsWith('-') || val.endsWith('-'))
                    throw new Error(
                        `allowedValues[${val}] can not start or end with a hyphen in type ${this.printPath(rt, 'names.allowedValues')}`
                    );
            });
        if (params.names) {
            if (Object.values(params.names).length === 0)
                throw new Error(`Domain names must have at least one validator in type ${this.printPath(rt, 'names')}`);
            this.nameFormatter.validateParams(rt, params.names);
        }
        if (params.tld) {
            if (Object.values(params.tld).length === 0)
                throw new Error(`Domain tld must have at least one validator in type ${this.printPath(rt, 'tld')}`);
            this.tldFormatter.validateParams(rt, params.tld);
        }
    }
}

// ############### Register runtypes ###############

// register Validator operations so they can be used in the jit compiler
/** @reflection never */
export const DOMAIN_RUN_TYPE_FORMATTER = registerFormatter(new DomainRunTypeFormat());

// ############### Type Params ###############

export type DEFAULT_DOMAIN_PARAMS<
    P extends RegExp = typeof DOMAIN_PATTERN,
    S extends Samples = ['ggle.com', 'mion.io', 'mionkit.io', 'yahuu.net', 'fbook.com', 'wiki.org', 'ms.net'],
> = {
    maxLength: 253;
    minLength: 5; // name 2 + tld 2 + 1 dot
    pattern: {
        val: P;
        mockSamples: S;
        errorMessage: 'invalid domain';
    };
};
export type DEFAULT_DMM_TLD_PARAMS<
    P extends RegExp = typeof TLD_ALLOWED_CHARS_PATTERN,
    S extends Samples = ['com', 'org', 'net', 'io', 'app', 'co', 'dev', 'tech', 'ai', 'mion', 'co.uk', 'com.au', 'com.br'],
> = {
    maxLength: 12; // technical TLD max length is 63, but rarely is more than 12, as single words are the most common
    minLength: 2;
    pattern: {
        val: P;
        mockSamples: S;
        errorMessage: 'top level domain can only contain letters and dots';
    };
};
export type DEFAULT_DOM_NAME_PARAMS<
    P extends RegExp = typeof DOMAIN_ALLOWED_CHARS_PATTERN,
    S extends Samples = ['domain', 'ggle', 'fbook', 'mion', 'prot', 'yahuu', 'hello', 'world', 'example', 'wiki', 'mionkit'],
> = {
    maxLength: 63;
    minLength: 2;
    pattern: {
        val: P;
        mockSamples: S;
        errorMessage: 'domain names can only contain letters, numbers and hyphens';
    };
};
export type DEFAULT_STRICT_DOMAIN_PARAMS = {
    // officially max subdomains is 127, but practically there is never more than 4 or 5, so better default to something smaller
    maxParts: 6;
    minParts: 2;
    names: DEFAULT_DOM_NAME_PARAMS;
    tld: DEFAULT_DMM_TLD_PARAMS;
    maxLength: 253;
    minLength: 5; // name 2 + tld 2 + 1 dot
};
// ############### Run Types ###############

/** Domain based on a pattern, always branded with 'domain'. */
export type FormatDomain<DP extends FormatParams_Domain = DEFAULT_DOMAIN_PARAMS> = TypeFormat<string, 'domain', DP, 'domain'>;
/** Domain with customizable names and tld, always branded with 'domain'. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatDomainStrict<D extends Partial<FormatParams_Domain> = {}> = FormatDomain<DEFAULT_STRICT_DOMAIN_PARAMS & D>;
