/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeFormatter} from '../lib/jitFormatters';
import {ReflectionKind} from '@deepkit/type';
import {DefaultDomainParams, Domain} from './domain.runtype';
import {TypeFormat} from '../lib/formats.runtype';
import {MockOperation} from '../types';
import {StringValidatorsParams} from './string.runtype';

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
    localPart: StringValidatorsParams;
    domain: Domain;
};

export type Email<
    E extends StringValidatorsParams = {},
    L extends StringValidatorsParams = {},
    D extends Domain = Domain,
> = TypeFormat<string, 'email', EmailOnlyParams & E & {localPart: DefaultLocalPart & L} & {domain: Domain & D}>;

// Email validator
export class EmailFormat extends JitRunTypeFormatter<EmailParams> {
    static id = 'email';
    kind = ReflectionKind.string;
    name = EmailFormat.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        return `// TODO: ${comp.vλl} ${rt.getKindName()}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        // TODO
        return {value: rt.getKindName()};
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        throw new Error('Method not implemented.');
    }
    _compileFormat(comp: JitCompiler): string {
        return `${comp.vλl}.toLowerCase()`; // all emails are lower case
    }
}

export function isEmail(value: string): value is Email {
    return typeof value === 'string';
}
