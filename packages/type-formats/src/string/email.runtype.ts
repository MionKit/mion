/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, StrNumber, JitFnID, JitCode} from '@mionkit/run-types';
import {BaseRunTypeFormat, TypeFormat, RunTypeOptions, registerFormatter, JitFunctions, randomItem} from '@mionkit/run-types';
import {ReflectionKind} from '@deepkit/type';
import {DEFAULT_STRICT_DOMAIN_PARAMS} from './domain.runtype.ts';
import {FormatParams_Email} from '@mionkit/core';
import {StringRunTypeFormat, stringIgnoreProps} from './stringFormat.runtype.ts';
import {StringValidators} from '@mionkit/core';
import {Samples} from '@mionkit/core';
import {DomainRunTypeFormat} from './domain.runtype.ts';
import {EMAIL_NAME_SAMPLES_ARRAY, EMAIL_NAME_SAMPLES, EMAIL_SAMPLES, EMAIL_SAMPLES_PUNYCODE} from '../constants.mock.ts'; // do not import using type
import {paramVal} from '../utils.ts';

// Email pattern, allows punycode domains
export const EMAIL_PATTERN = /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/;
export const EMAIL_PATTERN_PUNYCODE = /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z0-9-]{2,63}$/;

// Email validator
export class EmailRunTypeFormat extends BaseRunTypeFormat<FormatParams_Email> {
    static id = 'email';
    kind = ReflectionKind.string;
    name = EmailRunTypeFormat.id;
    // Formatter instances as class variables
    private rootFormatter: StringRunTypeFormat;
    private domainFormatter: DomainRunTypeFormat;
    private localPartFormatter: StringRunTypeFormat;

    constructor(parentPath?: StrNumber[]) {
        super(parentPath);

        this.rootFormatter = new StringRunTypeFormat(this.getFormatPath());
        this.domainFormatter = new DomainRunTypeFormat(this.getFormatPath('domain'));
        this.localPartFormatter = new StringRunTypeFormat(this.getFormatPath('localPart'));
    }
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    canEmbedFormatterCode(fnID: JitFnID, rt: BaseRunType, p?: FormatParams_Email): boolean {
        const params = p || this.getParams(rt);
        if (fnID === JitFunctions.isType.id || fnID === JitFunctions.typeErrors.id) {
            const superResult = super.canEmbedFormatterCode(fnID, rt);
            const domainResult = params.domain ? this.domainFormatter.canEmbedFormatterCode(fnID, rt, params.domain) : false;
            return superResult && (!!params.pattern || domainResult);
        }
        return super.canEmbedFormatterCode(fnID, rt);
    }
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const fnID = comp.fnID;
        const fmtName = this.getFormatName();

        // If pattern is provided, use the root formatter
        if (params.pattern) return this.rootFormatter.compileFormat(fnID, comp, rt, params, comp.vλl, fmtName);

        const vλl = comp.vλl;
        const vLocalPart = 'localPart' + this.getFormatNestLevel(); // Variable for local part
        const vDomain = 'domain' + this.getFormatNestLevel(); // Variable for domain
        const vAtPos = 'atPos' + this.getFormatNestLevel(); // Position of @ symbol

        // Compile code for root, local part, and domain validation
        const rootCode = this.rootFormatter.compileFormat(fnID, comp, rt, params, vλl, fmtName);
        const localPartCode = this.localPartFormatter.compileFormat(fnID, comp, rt, params.localPart, vLocalPart, fmtName);
        const domainCode = this.domainFormatter.compileFormat(fnID, comp, rt, params.domain, vDomain, fmtName);

        // If rootCode is empty, we don't need to emit jit code for it
        const rootSafeCode = rootCode.code ? `if (!(${rootCode.code})) return false;` : '';
        const returnCode = this.isRootFormat() ? `return true;` : '';
        const domainIsExpression = domainCode.type === 'E';
        const domainSafeCode =
            domainCode.code && domainIsExpression ? `if (!(${domainCode.code})) return false;` : domainCode.code;

        const code = `
            ${rootSafeCode}
            const ${vAtPos} = ${vλl}.lastIndexOf('@');
            if (${vAtPos} === -1) return false;
            const ${vLocalPart} = ${vλl}.substring(0, ${vAtPos});
            const ${vDomain} = ${vλl}.substring(${vAtPos} + 1);
            if (!(${localPartCode.code})) return false;
            ${domainSafeCode}
            ${returnCode}
        `;
        return {code, type: 'S'};
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const fnID = comp.fnID;
        const fmtName = this.getFormatName();

        // If pattern is provided, use the root formatter
        if (params.pattern) return this.rootFormatter.compileFormat(fnID, comp, rt, params, comp.vλl, fmtName);

        const errFn = this.getCallJitFormatErr(comp, rt, this, false);
        const vλl = comp.vλl;
        const vLocalPart = 'localPart'; // Variable for local part
        const vDomain = 'domain'; // Variable for domain
        const vAtPos = 'atPos'; // Position of @ symbol

        // Compile code for root, local part, and domain validation
        const rootCode = this.rootFormatter.compileFormat(fnID, comp, rt, params, vλl, fmtName);
        const localPartCode = this.localPartFormatter.compileFormat(fnID, comp, rt, params.localPart, vLocalPart, fmtName);
        const domainCode = this.domainFormatter.compileFormat(fnID, comp, rt, params.domain, vDomain, fmtName);

        const code = `
            ${rootCode.code ? `${rootCode.code};` : ''}
            const ${vAtPos} = ${vλl}.lastIndexOf('@');
            if (${vAtPos} === -1) ${errFn('@', 'Email missing @ symbol')};
            const ${vLocalPart} = ${vλl}.substring(0, ${vAtPos});
            const ${vDomain} = ${vλl}.substring(${vAtPos} + 1);
            ${localPartCode.code ? `${localPartCode.code};` : ''}
            ${domainCode.code ? `${domainCode.code};` : ''}
        `;
        return {code, type: 'S'};
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType): string {
        const params = this.getParams(rt);

        // If pattern is provided, use the root formatter
        if (params.pattern) return this.rootFormatter.mock(opts, rt, params);

        // Generate local part
        const localPart = this.mockLocalPart(opts, rt, params.localPart as StringValidators);

        // Generate domain
        const domain = this.domainFormatter.mock(opts, rt, params.domain);

        // Combine to form email
        return `${localPart}@${domain}`;
    }

    private mockLocalPart(opts: RunTypeOptions, rt: BaseRunType, params: StringValidators): string {
        const hasParams = !!Object.keys(params).length;
        if (!hasParams) return randomItem(EMAIL_NAME_SAMPLES_ARRAY);

        const defaultParams = {
            ...params,
            maxLength: params.maxLength ?? 64,
            minLength: params.minLength ?? 1,
        };

        return this.localPartFormatter.mock(opts, rt, defaultParams);
    }
    emitFormat(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl}.toLowerCase()`, type: 'E'};
    }

    validateParams(rt: BaseRunType, params: FormatParams_Email) {
        // Check if pattern and localPart/domain are mutually exclusive
        const hasPattern = !!params.pattern;
        const hasLocalPartOrDomain = !!params.localPart || !!params.domain;

        if (hasPattern && hasLocalPartOrDomain)
            throw new Error(`Email can only have either pattern or (localPart and domain) in type ${this.printPath(rt)}`);
        if ((params.localPart && !params.domain) || (!params.localPart && params.domain))
            throw new Error(`Email localPart and domain must be used together in type ${this.printPath(rt)}`);
        if (params.maxLength && paramVal(params.maxLength) > 254)
            throw new Error(`Email maxLength cannot be greater than 254 in type ${this.printPath(rt, 'maxLength')}`);
        if (params.minLength && paramVal(params.minLength) < 7)
            throw new Error(`Email minLength cannot be less than 7 in type ${this.printPath(rt, 'minLength')}`);

        this.rootFormatter.validateParams(rt, params);

        if (params.localPart) {
            if (Object.values(params.localPart).length === 0)
                throw new Error(`Email localPart must have at least one validator in type ${this.printPath(rt, 'localPart')}`);
            if (params.localPart.maxLength && paramVal(params.localPart.maxLength) > 64)
                throw new Error(
                    `Email localPart.maxLength cannot be greater than 64 in type ${this.printPath(rt, 'localPart.maxLength')}`
                );
            if (params.localPart.minLength && paramVal(params.localPart.minLength) < 1)
                throw new Error(
                    `Email localPart.minLength cannot be less than 1 in type ${this.printPath(rt, 'localPart.minLength')}`
                );
            this.localPartFormatter.validateParams(rt, params.localPart);
        }
        if (params.domain) {
            if (Object.values(params.domain).length === 0) {
                throw new Error(`Email domain must have at least one validator in type ${this.printPath(rt, 'domain')}`);
            }
            this.domainFormatter.validateParams(rt, params.domain);
        }
    }
}

// ######### Registering validator and pure functions ########

export const EMAIL_RUN_TYPE_FORMATTER = registerFormatter(new EmailRunTypeFormat());

// ############### Type  ###############

export type DEFAULT_STRICT_EMAIL_PARAMS = {
    maxLength: 254;
    localPart: {
        maxLength: 64;
        minLength: 1;
        /** Disallows non typical email chars
         * avoiding the character + prevents aliasing used in goggle and other providers
         * characters . and @ are allowed as are typically used
         * */
        disallowedChars: {
            val: ` ()<>[]:;\\,{}|+@`;
            errorMessage: 'Invalid characters in email local part';
            mockSamples: EMAIL_NAME_SAMPLES;
        };
    };
    domain: DEFAULT_STRICT_DOMAIN_PARAMS;
};

export type DEFAULT_EMAIL_PARAMS<
    EmailPattern extends RegExp = typeof EMAIL_PATTERN,
    MockSamples extends Samples = EMAIL_SAMPLES,
> = {
    maxLength: 254;
    minLength: 7;
    pattern: {
        val: EmailPattern;
        mockSamples: MockSamples;
        errorMessage: 'Invalid email format';
    };
};

/** Email format, always branded with 'email'. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type StrEmail<EP extends FormatParams_Email = DEFAULT_EMAIL_PARAMS> = TypeFormat<string, 'email', EP, 'email'>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type StrEmailStrict<E extends Partial<FormatParams_Email> = {}> = StrEmail<DEFAULT_STRICT_EMAIL_PARAMS & E>;
export type StrEmailPattern<EmailPattern extends RegExp, MockSamples extends Samples> = StrEmail<
    DEFAULT_EMAIL_PARAMS<EmailPattern, MockSamples>
>;
export type StrEmailPunycode = StrEmailPattern<typeof EMAIL_PATTERN_PUNYCODE, EMAIL_SAMPLES_PUNYCODE>;
