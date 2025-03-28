/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import type {DeepPartial, GenericPureFunction, TypeFormatError} from '@mionkit/runtype/src/types';
import {JitRunTypeFormatter} from '@mionkit/runtype/src/lib/baseFormatter';
import {ReflectionKind} from '@deepkit/type';
import {DefaultDomainParams, DomainParams, type isDomainDeps} from './domain.runtype';
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype';
import {MockOperation} from '@mionkit/runtype/src/types';
import {StringValidatorsParams} from './stringFormat.runtype';
import {stringFormatter} from './stringFormat.runtype';
import {domainFormatter, isDomain, domainErrors} from './domain.runtype';
import {registerFormatter, registerPureFnClosure} from '@mionkit/runtype/src/lib/formats';
import {JITUtils} from '@mionkit/runtype/src/lib/jitUtils';
import {JitFunctions} from '@mionkit/runtype/src/constants';

export type DefaultEmailParams = {
    maxLength: 254;
    localPart: {
        maxLength: 64;
        minLength: 3;
        /** Disallows non typical email chars
         * avoiding the character + prevents aliasing used in goggle and other providers
         * characters . and @ are allowed as are typically used
         * */
        disallowedChars: `()<>[]:;\\,+ `;
    };
    domain: DefaultDomainParams;
};
export type EmailParams = {
    maxLength: number;
    localPart: StringValidatorsParams & {allow};
    domain: DomainParams;
};

export type Email<E extends DeepPartial<EmailParams> = {}> = TypeFormat<string, 'email', DefaultEmailParams & E>;

// Email validator
export class EmailFormat extends JitRunTypeFormatter<EmailParams> {
    static id = 'email';
    kind = ReflectionKind.string;
    name = EmailFormat.id;
    getIsDomainDeps(comp: JitCompiler, rt: BaseRunType, params: EmailParams) {
        const fnId = JitFunctions.isType.id;
        const isLocalPartFn = stringFormatter._compile(fnId, comp, rt, params.localPart, this.getFormatPath('localPart'));
        return {
            isDomainFn: isDomain,
            isLocalPartFn: `function(${comp.vλl}){return ${isLocalPartFn}}`,
            ...domainFormatter.getIsDomainDeps(comp, rt, params.domain),
        };
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const deps = this.getIsDomainDeps(comp, rt, params);
        const result = this.compilePureFunctionCall(comp, rt, isEmail, params, deps);
        return result.callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        return this.compileErrorsPureFunctionCall(comp, rt, emailErrors).callCode;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        const local = stringFormatter.mock(mockContext, rt, params.localPart);
        const dom = domainFormatter.mock(mockContext, rt, params.domain);
        return `${local}@${dom}`;
    }
    _compileFormat(comp: JitCompiler): string {
        return `${comp.vλl}.toLowerCase()`;
    }
}

export type IsEmailDeps = {
    isDomainFn: ReturnType<typeof isDomain>;
    isLocalPartFn: GenericPureFunction<StringValidatorsParams>;
} & isDomainDeps;

/** @reflection never */
export function isEmail() {
    return function is_email(email: string, p: EmailParams, deps: IsEmailDeps): boolean {
        if (email.length > p.maxLength) return false;
        const parts = email.split('@');
        if (parts.length !== 2) return false;
        const [local, domainStr] = parts;
        if (!deps.isLocalPartFn(local, p.localPart)) return false;
        return deps.isDomainFn(domainStr, p.domain, deps);
    } as GenericPureFunctionWithDeps<EmailParams>;
}

type EmailErrorsDeps = {
    domainErrorsFn: ReturnType<typeof domainErrors>;
};

/** @reflection never */
export function emailErrors(utl: JITUtils) {
    const strFormatErr = utl.getPureFn('stringFormatErrors') as ReturnType<typeof stringFormatErrors>;
    return function email_errors(
        d: string,
        p: EmailParams,
        fPath: (string | number)[],
        fErr: TypeFormatError[] = [],
        name = 'email',
        deps: EmailErrorsDeps
    ): TypeFormatError[] {
        if (d.length > p.maxLength) fErr.push({name, formatPath: [...fPath], val: d});
        const parts = d.split('@');
        if (parts.length !== 2) {
            fErr.push({name, formatPath: [...fPath], val: d});
            return fErr;
        }
        const [local, domainStr] = parts;
        strFormatErr(local, p.localPart, [...fPath, 'tld'], fErr, name);
        deps.domainErrorsFn(domainStr, p.domain, [...fPath, 'domain'], fErr, name);
        return fErr;
    } as ErrorsPureFunctionWithDeps<EmailParams>;
}

// ######### Registering validator and pure functions ########
registerPureFnClosure(isEmail, [isDomain]);
registerPureFnClosure(emailErrors, [stringFormatErrors, domainErrors]);
export const emailFormatter = registerFormatter(new EmailFormat());
