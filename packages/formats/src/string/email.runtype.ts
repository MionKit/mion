/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import type {
    DeepPartial,
    ErrorsPureFunction,
    FormatParam,
    GenericPureFunction,
    JitTypeErrorsFn,
    RunTypeError,
    StrNumber,
} from '@mionkit/runtype/src/types';
import {BaseRunTypeFormat} from '@mionkit/runtype/src/lib/baseRunTypeFormat';
import {ReflectionKind} from '@deepkit/type';
import {DEFAULT_FULL_DOMAIN_PARAMS, FormatParams_Domain, type DomainErrorsDeps, type isDomainDeps} from './domain.runtype';
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype';
import {MockOperation} from '@mionkit/runtype/src/types';
import {
    StringRunTypeFormat,
    stringIgnoreProps,
    FormatParams_StringValidators,
    type FormatParams_String,
} from '../stringFormat.runtype';
import {DomainRunTypeFormat, DOMAIN_RUN_TYPE_FORMATTER, isDomain, domainErrors} from './domain.runtype';
import {registerFormatter, registerPureFnClosure} from '@mionkit/runtype/src/lib/formats';
import {jitErrorArgs, JitFunctions} from '@mionkit/runtype/src/constants';
import type {JITUtils} from '@mionkit/runtype/src/lib/jitUtils';
import {EMAIL_NAME_SAMPLES} from '../constants.mock'; // do not import using type

// Email validator
export class EmailRunTypeFormat extends BaseRunTypeFormat<FormatParams_Email> {
    static id = 'email';
    kind = ReflectionKind.string;
    name = EmailRunTypeFormat.id;
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    getIsEmailDeps(comp: JitCompiler, rt: BaseRunType, params: FormatParams_Email) {
        const fnId = JitFunctions.isType.id;
        const localPartFormatter = new StringRunTypeFormat(this.getFormatPath('localPart'));
        const isLocalPartFn = localPartFormatter._compile(fnId, comp, rt, params.localPart);
        return {
            isDomainFn: isDomain, // this will be compiled as pure function call
            isLocalPartFn: `(${comp.vλl})=>{return ${isLocalPartFn}}`,
            ...DOMAIN_RUN_TYPE_FORMATTER.getIsDomainDeps(comp, rt, params.domain),
        };
    }
    getEmailErrorsDeps(comp: JitErrorsCompiler, rt: BaseRunType, params: FormatParams_Email) {
        const fnId = JitFunctions.typeErrors.id;
        const formatName = this.getFormatName();
        const localPath = this.getFormatPath('localPart');
        const domainPath = this.getFormatPath('domain');
        const localParams = params.quick ? {maxLength: 64, minLength: 1} : params.localPart;

        const localFormatter = new StringRunTypeFormat(localPath);
        const domainFormatter = new DomainRunTypeFormat(domainPath);

        const localCode = localFormatter._compile(fnId, comp, rt, localParams, comp.vλl, formatName);
        const domainCode = domainFormatter._compile(fnId, comp, rt, params.domain, comp.vλl, formatName);
        const args = [comp.vλl, ...Object.values(jitErrorArgs).slice(1)].join(',');
        return {
            localPartErrorsFn: `(${args})=>{${localCode}}`,
            domainErrorsFn: `(${args})=>{${domainCode}}`,
        };
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const deps = this.getIsEmailDeps(comp, rt, params);
        const validateFn = params.quick ? isEmailQuick : isEmail;
        const result = this.compilePureFunctionCall(comp, rt, validateFn, params, deps);
        return result.callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const deps = this.getEmailErrorsDeps(comp, rt, params);
        return this.compileErrorsPureFunctionCall(comp, rt, emailErrors, params, deps).callCode;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);

        const localFormatter = new StringRunTypeFormat();
        const domainFormatter = new DomainRunTypeFormat();

        let local = localFormatter.mock(mockContext, rt, params.localPart);
        const maxLength = params.localPart.maxLength || 64;
        // adds a small random allowed symbols to the local part
        if (local.length < maxLength && params.localPart?.disallowedChars?.samples) {
            const paramsCopy: FormatParams_String = {
                ...params.localPart,
                maxLength: Math.min(6, params.maxLength - local.length),
                disallowedChars: {
                    disallowed: params.localPart.disallowedChars.disallowed,
                    message: params.localPart.disallowedChars.message,
                },
            };
            local += localFormatter.mock(mockContext, rt, paramsCopy);
        }
        const dom = domainFormatter.mock(mockContext, rt, params.domain);
        return `${local}@${dom}`;
    }
    _compileFormat(comp: JitCompiler): string {
        return `${comp.vλl}.toLowerCase()`;
    }
}

// ############### Pure Functions ###############

export type IsEmailDeps = {
    isDomainFn: ReturnType<typeof isDomain>;
    isLocalPartFn: GenericPureFunction<FormatParams_StringValidators>;
} & isDomainDeps;

/** @reflection never */
export function isEmail() {
    return function is_email(email: string, p: FormatParams_Email, deps: IsEmailDeps): boolean {
        if (email.length > p.maxLength) return false;
        const atIndex = email.lastIndexOf('@');
        if (atIndex === -1) return false;
        const local = email.substring(0, atIndex);
        const domainStr = email.substring(atIndex + 1);
        if (!deps.isLocalPartFn(local, p.localPart, deps)) return false;
        return deps.isDomainFn(domainStr, p.domain, deps);
    } as GenericPureFunction<FormatParams_Email>;
}

export type IsQuickEmailDeps = {
    isLocalPartFn: GenericPureFunction<FormatParams_StringValidators>;
};

/** @reflection never */
export function isEmailQuick() {
    const quickLocalPart = {maxLength: 64, minLength: 1};
    const tldMinLength = 3; // at least 2 chars + last dot
    const domainMinLength = 5; // domain must be at least 5 chars, 2 for name dot and 2 for tld
    return function is_email_quick(email: string, p: FormatParams_Email): boolean {
        if (email.length > p.maxLength) return false;
        const atIndex = email.lastIndexOf('@');
        if (atIndex === -1) return false;
        const local = email.substring(0, atIndex);
        if (local.length > quickLocalPart.maxLength) return false;
        if (local.length < quickLocalPart.minLength) return false;
        const domainStr = email.substring(atIndex + 1);
        if (domainStr.length < domainMinLength) return false;
        const dotIndex = domainStr.lastIndexOf('.');
        return domainStr.length - dotIndex >= tldMinLength;
    } as GenericPureFunction<FormatParams_Email>;
}

export type EmailErrorsDeps = {
    localPartErrorsFn: JitTypeErrorsFn;
    domainErrorsFn: JitTypeErrorsFn;
} & DomainErrorsDeps;

/** @reflection never */
export function emailErrors(utl: JITUtils) {
    const tldMinLength = 3; // at least 2 chars + last dot
    const domainMinLength = 5; // domain must be at least 5 chars, 2 for name dot and 2 for tld
    return function email_errors(
        val: string,
        path: StrNumber[],
        ers: RunTypeError[],
        exp: string,
        fmtName: string,
        p: FormatParams_Email,
        fmtPath: StrNumber[],
        deps: EmailErrorsDeps,
        accessPath?: StrNumber[]
    ): RunTypeError[] {
        if (val.length > p.maxLength)
            return utl.formatErr(path, ers, exp, fmtName, 'maxLength', p.maxLength, fmtPath, accessPath), ers;
        const index = val.lastIndexOf('@');
        if (index === -1) return utl.formatErr(path, ers, exp, fmtName, '@', 'Missing @ symbol', fmtPath, accessPath), ers;
        const localPart = val.substring(0, index);
        deps.localPartErrorsFn(localPart, path, ers);
        const domainPart = val.substring(index + 1);
        if (!p.quick) {
            deps.domainErrorsFn(domainPart, path, ers);
            return ers;
        }
        if (domainPart.length < domainMinLength)
            return utl.formatErr(path, ers, exp, fmtName, 'minLength', domainMinLength, [...fmtPath, 'domain'], accessPath), ers;
        const dotIndex = domainPart.lastIndexOf('.');
        if (dotIndex === -1)
            return utl.formatErr(path, ers, exp, fmtName, 'minParts', 2, [...fmtPath, 'domain'], accessPath), ers;
        const tldLEngth = domainPart.length - dotIndex; // length of tld + dot
        if (tldLEngth < tldMinLength)
            return utl.formatErr(path, ers, exp, fmtName, 'minLength', tldMinLength, [...fmtPath, 'domain'], accessPath), ers;
        return ers;
    } as ErrorsPureFunction<FormatParams_Email>;
}

// ######### Registering validator and pure functions ########

registerPureFnClosure(isEmail, [isDomain]);
registerPureFnClosure(emailErrors, [domainErrors]);
export const emailFormatter = registerFormatter(new EmailRunTypeFormat());

// ############### Type  ###############

export type DEFAULT_EMAIL_PARAMS = {
    maxLength: 254;
    localPart: {
        maxLength: 64;
        minLength: 1;
        /** Disallows non typical email chars
         * avoiding the character + prevents aliasing used in goggle and other providers
         * characters . and @ are allowed as are typically used
         * */
        disallowedChars: {
            disallowed: `()<>[]:;\\,{}|+ `;
            message: 'Invalid characters in email local part';
            samples: EMAIL_NAME_SAMPLES;
        };
    };
    domain: DEFAULT_FULL_DOMAIN_PARAMS;
};
export type FormatParams_Email = {
    maxLength: FormatParam<number>;
    localPart: FormatParams_StringValidators;
    domain: FormatParams_Domain;
};

export type EmailFormat<E extends DeepPartial<FormatParams_Email> = {}> = TypeFormat<string, 'email', DEFAULT_EMAIL_PARAMS & E>;
