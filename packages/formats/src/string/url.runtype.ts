/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType, JitCompiler, JitErrorsCompiler, jitCode, JitFnID, StrNumber} from '@mionkit/run-types';
import {
    registerFormatter,
    BaseRunTypeFormat,
    TypeFormat,
    RunTypeOptions,
    CodeType,
    JitFunctions,
    fpVal,
    randomItem,
} from '@mionkit/run-types';
import {ReflectionKind} from '@deepkit/type';
import {StringRunTypeFormat, stringIgnoreProps, StringParams} from './stringFormat.runtype';
import {DomainRunTypeFormat, FormatParams_Domain} from './domain.runtype';
import {IPRunTypeFormat, FormatParams_IP} from './ip.runtype';
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
    getCodeType(fnID: JitFnID, rt: BaseRunType, p?: FormatParams_Url): CodeType {
        const params = p || this.getParams(rt);
        if (fnID === JitFunctions.isType.id) return !params.domain && !params.ip ? 'E' : 'S';
        return super.getCodeType(fnID, rt, params);
    }
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): jitCode {
        const params = this.getParams(rt);
        const fnID = comp.fnID;
        const fmtName = this.getFormatName();
        const urlCode = this.urlFormatter!.compileFormat(fnID, comp, rt, params, comp.vλl, fmtName);
        if (!params.domain && !params.ip) return urlCode;

        const vDomain = 'domain';
        const dmnCode = params?.domain ? this.domainFormatter.compileFormat(fnID, comp, rt, params.domain, vDomain, fmtName) : '';
        const ipCode = params.ip ? `${this.ipFormatter.compileFormat(fnID, comp, rt, params.ip, vDomain, fmtName)}` : '';
        // Remove debug logs
        const safeUrlCode = urlCode ? `if(!(${urlCode})) return false;` : '';

        const dIsExpression = this.domainFormatter.getCodeType(fnID, rt, params.domain) === 'E';
        const ipExpression = this.ipFormatter.getCodeType(fnID, rt, params.ip) === 'E';
        const domainSafeCode = dIsExpression && dmnCode ? `if(!(${dmnCode})) return false;` : dmnCode;
        const ipSafeCode = ipExpression && ipCode ? `if(${ipCode}) return false;` : ipCode;
        const returnCode = this.isRootFormat() ? `return true;` : '';

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
        const fnID = comp.fnID;
        const fmtName = this.getFormatName();

        const urlCode = this.urlFormatter!.compileFormat(fnID, comp, rt, params, comp.vλl, fmtName);
        if (!params.domain && !params.ip) return urlCode;

        const vDomain = 'domain' + this.getFormatNestLevel(); // must match var name in code
        const dmnCode = params?.domain ? this.domainFormatter.compileFormat(fnID, comp, rt, params.domain, vDomain, fmtName) : '';
        const iPCode = params.ip ? `${this.ipFormatter.compileFormat(fnID, comp, rt, params.ip, vDomain, fmtName)}` : '';
        const checks = [urlCode, dmnCode, iPCode].filter(Boolean);

        const vStart = 'start' + this.getFormatNestLevel(); // must match var name in code
        const vEnd = 'end' + this.getFormatNestLevel(); // must match var name in code
        const vEndIdx = 'endIdx' + this.getFormatNestLevel(); // must match var name in code

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
        const vDomain = 'domain' + this.getFormatNestLevel(); // must match var name in code
        const fnID = JitFunctions.format.id;
        const fmtName = this.getFormatName();

        const domainCode = this.domainFormatter!.compileFormat(fnID, comp, rt, params.domain, vDomain, fmtName);
        const vStart = 'start' + this.getFormatNestLevel(); // must match var name in code
        const vEnd = 'end' + this.getFormatNestLevel(); // must match var name in code
        const vEndIdx = 'endIdx' + this.getFormatNestLevel(); // must match var name in code

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
    pattern: {val: typeof URL_REGEXP; errorMessage: 'invalid URL format'; mockSamples: URL_SAMPLES};
};
export type DEFAULT_URL_FILE_PARAMS = {
    maxLength: 2048;
    pattern: {val: typeof URL_FILE_REGEXP; errorMessage: 'invalid file URL format'; mockSamples: FILE_URL_SAMPLES};
};
export type DEFAULT_URL_HTTP_PARAMS = {
    maxLength: 2048;
    pattern: {val: typeof URL_HTTP_REGEXP; errorMessage: 'invalid Http URL format'; mockSamples: HTTP_URL_SAMPLES};
};
export type DEFAULT_URL_SOCIAL_MEDIA_PARAMS<DomainLIst extends readonly string[] = SOCIAL_MEDIA_DOMAINS_SAMPLES> = {
    maxLength: 2048;
    pattern: {
        val: typeof URL_HTTP_REGEXP;
        errorMessage: 'invalid social media URL format';
        mockSamples: SOCIAL_MEDIA_URL_SAMPLES;
    };
    domain: {
        names: {
            allowedValues: {
                val: DomainLIst;
                errorMessage: 'Only social media domains are allowed';
            };
        };
        tld: {
            allowedValues: {
                val: ['com'];
                errorMessage: 'Only com TLDs are allowed';
            };
        };
    };
};

export type FormatParams_UrlPattern = Omit<
    StringParams,
    'allowedChars' | 'disallowedChars' | 'allowedValues' | 'disallowedValues'
>;
export type FormatParams_Url = FormatParams_UrlPattern & {ip?: FormatParams_IP; domain?: FormatParams_Domain};

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type StrUrl<P extends FormatParams_Url = {}> = TypeFormat<string, 'url', DEFAULT_URL_PARAMS & P>;
export type StrUrlFile<P extends FormatParams_Url = {}> = TypeFormat<string, 'url', DEFAULT_URL_FILE_PARAMS & P>;
export type StrUrlHttp<P extends FormatParams_Url = {}> = TypeFormat<string, 'url', DEFAULT_URL_HTTP_PARAMS & P>;
export type StrUrlSocialMedia<DomainLIst extends readonly string[] = SOCIAL_MEDIA_DOMAINS_SAMPLES> = StrUrl<
    DEFAULT_URL_SOCIAL_MEDIA_PARAMS<DomainLIst>
>;
