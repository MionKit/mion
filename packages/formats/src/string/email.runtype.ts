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
    GenericPureFunction,
    JitTypeErrorsFn,
    RunTypeError,
    StrNumber,
} from '@mionkit/runtype/src/types';
import {JitRunTypeFormatter} from '@mionkit/runtype/src/lib/baseFormatter';
import {ReflectionKind} from '@deepkit/type';
import {DefaultDomainParams, DomainParams, type DomainErrorsDeps, type isDomainDeps} from './domain.runtype';
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype';
import {MockOperation} from '@mionkit/runtype/src/types';
import {stringIgnoreProps, StringValidatorsParams} from './stringFormat.runtype';
import {stringFormatter} from './stringFormat.runtype';
import {domainFormatter, isDomain, domainErrors} from './domain.runtype';
import {registerFormatter, registerPureFnClosure} from '@mionkit/runtype/src/lib/formats';
import {jitErrorArgs, JitFunctions} from '@mionkit/runtype/src/constants';
import type {JITUtils} from '@mionkit/runtype/src/lib/jitUtils';
import {EmailNameSamples} from '../constants.mock'; // do not import as type

//

export type DefaultEmailParams = {
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
            samples: EmailNameSamples;
        };
    };
    domain: DefaultDomainParams;
};
export type DefaultQuickEmailParams = {
    maxLength: 254;
    localPart: {
        maxLength: 64;
        minLength: 1;
    };
    domain: DefaultDomainParams;
};
export type EmailParams = {
    maxLength: number;
    localPart: StringValidatorsParams;
    domain: DomainParams;
};

export type Email<E extends DeepPartial<EmailParams> = {}> = TypeFormat<string, 'email', DefaultEmailParams & E>;

// Email validator
export class EmailFormat extends JitRunTypeFormatter<EmailParams> {
    static id = 'email';
    kind = ReflectionKind.string;
    name = EmailFormat.id;
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    getIsEmailDeps(comp: JitCompiler, rt: BaseRunType, params: EmailParams) {
        const fnId = JitFunctions.isType.id;
        const isLocalPartFn = stringFormatter._compile(fnId, comp, rt, params.localPart, this.getFormatPath('localPart'));
        return {
            isDomainFn: isDomain, // this will be compiled as pure function call
            isLocalPartFn: `(${comp.vλl})=>{return ${isLocalPartFn}}`,
            ...domainFormatter.getIsDomainDeps(comp, rt, params.domain),
        };
    }
    getEmailErrorsDeps(comp: JitErrorsCompiler, rt: BaseRunType, params: EmailParams) {
        const fnId = JitFunctions.typeErrors.id;
        const formatName = this.getFormatName();
        const localPath = this.getFormatPath('localPart');
        const domainPath = this.getFormatPath('domain');
        const localCode = stringFormatter._compile(fnId, comp, rt, params.localPart, localPath, comp.vλl, formatName);
        const domainCode = domainFormatter._compile(fnId, comp, rt, params.domain, domainPath, comp.vλl, formatName);
        const args = [comp.vλl, ...Object.values(jitErrorArgs).slice(1)].join(',');
        return {
            localPartErrorsFn: `(${args})=>{${localCode}}`,
            domainErrorsFn: `(${args})=>{${domainCode}}`,
        };
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const deps = this.getIsEmailDeps(comp, rt, params);
        const result = this.compilePureFunctionCall(comp, rt, isEmail, params, deps);
        return result.callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const deps = this.getEmailErrorsDeps(comp, rt, params);
        return this.compileErrorsPureFunctionCall(comp, rt, emailErrors, params, deps).callCode;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        let local = stringFormatter.mock(mockContext, rt, params.localPart);
        // add a random allowed characters to the local part
        if (params.localPart?.disallowedChars?.samples) {
            const paramsCopy = {...params, localPart: {...params.localPart}};
            paramsCopy.localPart.maxLength = 10;
            type noNull = NonNullable<typeof paramsCopy.localPart.disallowedChars>;
            (paramsCopy.localPart.disallowedChars as noNull).samples = undefined;
            const allowedCharsMock = stringFormatter.mock(mockContext, rt, paramsCopy.localPart);
            if (allowedCharsMock.length + local.length < (params?.localPart?.maxLength || 0)) local += allowedCharsMock;
        }
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
        const atIndex = email.lastIndexOf('@');
        if (atIndex === -1) return false;
        const local = email.substring(0, atIndex);
        const domainStr = email.substring(atIndex + 1);
        if (!deps.isLocalPartFn(local, p.localPart, deps)) return false;
        return deps.isDomainFn(domainStr, p.domain, deps);
    } as GenericPureFunction<EmailParams>;
}

export type EmailErrorsDeps = {
    localPartErrorsFn: JitTypeErrorsFn;
    domainErrorsFn: JitTypeErrorsFn;
} & DomainErrorsDeps;

/** @reflection never */
export function emailErrors(utl: JITUtils) {
    return function email_errors(
        val: string,
        path: StrNumber[],
        ers: RunTypeError[],
        exp: string,
        fmtName: string,
        p: EmailParams,
        fmtPath: StrNumber[],
        deps: EmailErrorsDeps,
        accessPath?: StrNumber[]
    ): RunTypeError[] {
        if (val.length > p.maxLength)
            return utl.formatErr(path, ers, exp, fmtName, 'maxLength', p.maxLength, fmtPath, accessPath), ers;
        const index = val.lastIndexOf('@');
        if (index === -1) return utl.formatErr(path, ers, exp, fmtName, '@', 'Missing @ symbol', fmtPath, accessPath), ers;
        const localPart = val.substring(0, index);
        const domainPart = val.substring(index + 1);
        deps.localPartErrorsFn(localPart, path, ers);
        deps.domainErrorsFn(domainPart, path, ers);
        return ers;
    } as ErrorsPureFunction<EmailParams>;
}

// ######### Registering validator and pure functions ########
registerPureFnClosure(isEmail, [isDomain]);
registerPureFnClosure(emailErrors, [domainErrors]);
export const emailFormatter = registerFormatter(new EmailFormat());
