/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import {JitRunTypeFormatter} from '@mionkit/runtype/src/lib/baseFormatter';
import {ReflectionKind} from '@deepkit/type';
import {DefaultDomainParams, DomainParams} from './domain.runtype';
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype';
import {MockOperation} from '@mionkit/runtype/src/types';
import {StringValidatorsParams} from './string.runtype';
import {stringFormatter, isStringFormat, stringFormatErrors} from './string.runtype';
import {domainFormatter, isDomain, domainErrors} from './domain.runtype';
import {
    compilePureFunctionCall,
    compileErrorsPureFunctionCall,
    registerFormatter,
    registerPureFnClosure,
} from '@mionkit/runtype/src/lib/formats';
import {JITUtils} from '@mionkit/runtype/src/lib/jitUtils';
import type {DeepRequired, GenericPureFunction, InvalidFormatParams} from '@mionkit/runtype/src/types';

export type EmailOnlyParams = {
    maxLength: 254;
};
export type DefaultLocalPart = {
    maxLength: 64;
    minLength: 3;
    /** Disallows non typical email chars
     * avoiding the character + prevents aliasing used in goggle and other providers
     * characters . and @ are allowed as are typically used
     * */
    disallowedChars: `()<>[]:;\\,+ `; //
};
export type DefaultEmailParams = EmailOnlyParams & {
    domain: DefaultDomainParams;
    localPart: DefaultLocalPart;
};
export type EmailParams = StringValidatorsParams & {
    localPart?: StringValidatorsParams;
    domain?: DomainParams;
};

export type Email<E extends EmailParams = {}> = TypeFormat<string, 'email', DefaultEmailParams & E>;

// Email validator
export class EmailFormat extends JitRunTypeFormatter<EmailParams> {
    static id = 'email';
    kind = ReflectionKind.string;
    name = EmailFormat.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        return compilePureFunctionCall(comp, rt, this, isEmail).callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        return compileErrorsPureFunctionCall(comp, rt, this, emailErrors).callCode;
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

/** @reflection never */
export function isEmail(utl: JITUtils) {
    const isStr = utl.getPureFn('isStringFormat') as ReturnType<typeof isStringFormat>;
    const isDom = utl.getPureFn('isDomain') as ReturnType<typeof isDomain>;
    return function is_email(email: string, p: DeepRequired<EmailParams>): boolean {
        if (email.length > 254) return false;
        const parts = email.split('@');
        if (parts.length !== 2) return false;
        const [local, domainStr] = parts;
        if (!isStr(local, p.localPart)) return false;
        if (!isDom(domainStr, p.domain)) return false;
        return true;
    } as GenericPureFunction<EmailParams>;
}

/** @reflection never */
export function emailErrors(utl: JITUtils) {
    const strErr = utl.getPureFn('stringFormatErrors') as ReturnType<typeof stringFormatErrors>;
    const domErr = utl.getPureFn('domainErrors') as ReturnType<typeof domainErrors>;
    return function email_errors(email: string, p: EmailParams): InvalidFormatParams | undefined {
        if (email.length > 254) invalid.maxLength = 254;
        const parts = email.split('@');
        const invalid: Record<string, any> = {};
        if (parts.length !== 2) return {email: 'invalid format'};
        const [local, domainStr] = parts;
        const localErr = strErr(local, p.localPart);
        const domainErrVal = domErr(domainStr, p.domain);
        if (localErr) invalid.localPart = localErr;
        if (domainErrVal) invalid.domain = domainErrVal;
        return Object.keys(invalid).length ? invalid : undefined;
    } as GenericPureFunction<EmailParams>;
}

// ######### Registering validator and pure functions ########
registerPureFnClosure(isEmail, [isStringFormat, isDomain]);
registerPureFnClosure(emailErrors, [stringFormatErrors, domainErrors]);
export const emailFormatter = registerFormatter(new EmailFormat());
