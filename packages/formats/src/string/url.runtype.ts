/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import {registerFormatter} from '@mionkit/run-types/src/lib/formats';
import {BaseRunTypeFormat} from '@mionkit/run-types/src/lib/baseRunTypeFormat';
import {ReflectionKind} from '@deepkit/type';
import {TypeFormat} from '@mionkit/run-types/src/lib/formats.runtype';
import {RunTypeOptions, type jitCode, type JitFnID, type StrNumber} from '@mionkit/run-types/src/types';
import {StringRunTypeFormat, stringIgnoreProps, FormatParams_String} from '../stringFormat.runtype';
import {DomainRunTypeFormat, FormatParams_Domain} from './domain.runtype';
import {CodeType, JitFunctions} from '@mionkit/run-types/src/constants';
import {IPRunTypeFormat, FormatParams_IP} from './ip.runtype';
import {fpVal} from '@mionkit/run-types/src/lib/utils';
import {randomItem} from '@mionkit/run-types/src/mocking/mockUtils';
import {
    FILE_URL_SAMPLES,
    HTTP_URL_SAMPLES,
    SOCIAL_MEDIA_URL_SAMPLES,
    URL_SAMPLES,
    SOCIAL_MEDIA_DOMAINS_SAMPLES,
    INTERNET_PROTOCOLS,
} from '../constants.mock'; // do not import using type

export const URL_REGEXP = /^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i;
export const URL_FILE_REGEXP = /^file:\/\/\/?(?:[a-zA-Z]:)?[^\s/$.?#-][^\s]*$/i;
export const URL_HTTP_REGEXP = /^https?:\/\/[^\s/$.?#-][^\s]*$/i;

// URL validator
export class URLRunTypeFormat extends BaseRunTypeFormat<FormatParams_Url> {
    static readonly id = 'url';
    readonly kind = ReflectionKind.string;
    readonly name = URLRunTypeFormat.id;

    // Formatter instances as class variables
    private urlFormatter: StringRunTypeFormat;
    private domainFormatter: DomainRunTypeFormat;
    private ipFormatter: IPRunTypeFormat;

    constructor(parentPath?: StrNumber[]) {
        super(parentPath);

        // Initialize formatters in the constructor
        const urlPath = this.getFormatPath();
        const domainPath = this.getFormatPath('domain');
        const ipPath = this.getFormatPath('ip');

        this.urlFormatter = new StringRunTypeFormat(urlPath);
        this.domainFormatter = new DomainRunTypeFormat(domainPath);
        this.ipFormatter = new IPRunTypeFormat(ipPath);
    }
    getCodeType(fnId: JitFnID, rt: BaseRunType, p?: FormatParams_Url): CodeType {
        const params = p || this.getParams(rt);
        if (fnId === JitFunctions.isType.id) return !params.domain && !params.ip ? 'E' : 'S';
        return super.getCodeType(fnId, rt, params);
    }
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): jitCode {
        const params = this.getParams(rt);
        const fnId = comp.fnId;
        const fmtName = this.getFormatName();
        const urlCode = this.urlFormatter!._compile(fnId, comp, rt, params, comp.vλl, fmtName);
        if (!params.domain && !params.ip) return urlCode;

        const vDomain = 'domain';
        const dmnCode = params?.domain ? this.domainFormatter._compile(fnId, comp, rt, params.domain, vDomain, fmtName) : '';
        const ipCode = params.ip ? `${this.ipFormatter._compile(fnId, comp, rt, params.ip, vDomain, fmtName)}` : '';
        // Remove debug logs
        const safeUrlCode = urlCode ? `if(!(${urlCode})) return false;` : '';

        const dIsExpression = this.domainFormatter.getCodeType(fnId, rt, params.domain) === 'E';
        const ipExpression = this.ipFormatter.getCodeType(fnId, rt, params.ip) === 'E';
        const domainSafeCode = dIsExpression && dmnCode ? `if(!(${dmnCode})) return false;` : dmnCode;
        const ipSafeCode = ipExpression && ipCode ? `if(${ipCode}) return false;` : ipCode;
        const returnCode = this.isRoot() ? `return true;` : '';

        const code = `
            ${safeUrlCode}
            const start = ${comp.vλl}.indexOf('://') + 3;
            const end = ${comp.vλl}.indexOf('/', start);
            const endIdx = end === -1 ? ${comp.vλl}.length : end;
            const domain = ${comp.vλl}.substring(start, endIdx);
            ${domainSafeCode}
            ${ipSafeCode}
            ${returnCode}
        `;
        return code;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): jitCode {
        const params = this.getParams(rt);
        const fnId = comp.fnId;
        const fmtName = this.getFormatName();

        const urlCode = this.urlFormatter!._compile(fnId, comp, rt, params, comp.vλl, fmtName);
        if (!params.domain && !params.ip) return urlCode;

        const vDomain = 'domain' + this.getNestLevel(); // must match var name in code
        const dmnCode = params?.domain ? this.domainFormatter._compile(fnId, comp, rt, params.domain, vDomain, fmtName) : '';
        const iPCode = params.ip ? `${this.ipFormatter._compile(fnId, comp, rt, params.ip, vDomain, fmtName)}` : '';
        const checks = [urlCode, dmnCode, iPCode].filter(Boolean);

        const vStart = 'start' + this.getNestLevel(); // must match var name in code
        const vEnd = 'end' + this.getNestLevel(); // must match var name in code
        const vEndIdx = 'endIdx' + this.getNestLevel(); // must match var name in code

        const code = `
            const ${vStart} = ${comp.vλl}.indexOf('://') + 3;
            const ${vEnd} = ${comp.vλl}.indexOf('/', ${vStart});
            const ${vEndIdx} = ${vEnd} === -1 ? ${comp.vλl}.length : ${vEnd};
            const ${vDomain} = ${comp.vλl}.substring(${vStart}, ${vEndIdx});
            ${checks.join(';')};
        `;
        return code;
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType): string {
        const params = this.getParams(rt);
        let url = this.urlFormatter.mock(opts, rt, params);
        const hasProtocol = url.indexOf('://') !== -1;
        if (!hasProtocol) url = randomItem(INTERNET_PROTOCOLS) + url;
        if (params.domain) {
            const domain = this.domainFormatter.mock(opts, rt, params.domain);
            return replaceDomain(url, domain);
        }
        if (params.ip) return replaceDomain(url, this.ipFormatter.mock(opts, rt, params.ip));
        return url;
    }
    validateParams(rt: BaseRunType, params: FormatParams_Url): void {
        if (params.maxLength && fpVal(params.maxLength) > 2048) throw new Error('URL maxLength cannot be greater than 2048');
        if (params.minLength && fpVal(params.minLength) < 5) throw new Error('URL minLength cannot be less than 5');

        this.urlFormatter.validateParams(rt, params);

        const {ip, domain} = params;
        if (ip && domain) throw new Error('URL validator cannot have both IP and domain validators');

        if (domain) {
            this.domainFormatter.validateParams(rt, domain);
        }
    }
    _compileFormat(comp: JitCompiler, rt: BaseRunType): jitCode {
        const params = this.getParams(rt);
        if (!params.domain) return;
        const vDomain = 'domain' + this.getNestLevel(); // must match var name in code
        const fnId = JitFunctions.format.id;
        const fmtName = this.getFormatName();

        const domainCode = this.domainFormatter!._compile(fnId, comp, rt, params.domain, vDomain, fmtName);
        const vStart = 'start' + this.getNestLevel(); // must match var name in code
        const vEnd = 'end' + this.getNestLevel(); // must match var name in code
        const vEndIdx = 'endIdx' + this.getNestLevel(); // must match var name in code

        const code = `
            const ${vStart} = ${comp.vλl}.indexOf('://') + 3;
            const ${vEnd} = ${comp.vλl}.indexOf('/', ${vStart});
            const ${vEndIdx} = ${vEnd} === -1 ? ${comp.vλl}.length : ${vEnd};
            const ${vDomain} = ${comp.vλl}.substring(${vStart}, ${vEndIdx});
            return ${domainCode};
        `;
        return code;
    }
}

function replaceDomain(url: string, domain: string): string {
    const start = url.indexOf('://') + 3;
    const end = url.indexOf('/', start);
    const endIdx = end === -1 ? url.length : end;
    return url.substring(0, start) + domain + url.substring(endIdx);
}

// ############### Register runtypes ###############

export const URL_RUN_TYPE_FORMATTER = registerFormatter(new URLRunTypeFormat());

// ############### Type  ###############

export type DEFAULT_URL_PARAMS = {
    maxLength: 2048;
    pattern: {val: typeof URL_REGEXP; reason: 'invalid URL format'; mockSamples: URL_SAMPLES};
};
export type DEFAULT_URL_FILE_PARAMS = {
    maxLength: 2048;
    pattern: {val: typeof URL_FILE_REGEXP; reason: 'invalid file URL format'; mockSamples: FILE_URL_SAMPLES};
};
export type DEFAULT_URL_HTTP_PARAMS = {
    maxLength: 2048;
    pattern: {val: typeof URL_HTTP_REGEXP; reason: 'invalid Http URL format'; mockSamples: HTTP_URL_SAMPLES};
};
export type DEFAULT_URL_SOCIAL_MEDIA_PARAMS<DomainLIst extends readonly string[] = SOCIAL_MEDIA_DOMAINS_SAMPLES> = {
    maxLength: 2048;
    pattern: {val: typeof URL_HTTP_REGEXP; reason: 'invalid social media URL format'; mockSamples: SOCIAL_MEDIA_URL_SAMPLES};
    domain: {
        names: {
            allowedValues: {
                val: DomainLIst;
                reason: 'Only social media domains are allowed';
            };
        };
        tld: {
            allowedValues: {
                val: ['com'];
                reason: 'Only com TLDs are allowed';
            };
        };
    };
};

export type FormatParams_UrlPattern = Omit<
    FormatParams_String,
    'allowedChars' | 'disallowedChars' | 'allowedValues' | 'disallowedValues'
>;
export type FormatParams_Url = FormatParams_UrlPattern & {ip?: FormatParams_IP; domain?: FormatParams_Domain};

export type UrlFormat<P extends FormatParams_Url = {}> = TypeFormat<string, 'url', DEFAULT_URL_PARAMS & P>;
export type UrlFormat_File<P extends FormatParams_Url = {}> = TypeFormat<string, 'url', DEFAULT_URL_FILE_PARAMS & P>;
export type UrlFormat_Http<P extends FormatParams_Url = {}> = TypeFormat<string, 'url', DEFAULT_URL_HTTP_PARAMS & P>;
export type UrlFormat_SocialMedia<DomainLIst extends readonly string[] = SOCIAL_MEDIA_DOMAINS_SAMPLES> = UrlFormat<
    DEFAULT_URL_SOCIAL_MEDIA_PARAMS<DomainLIst>
>;
