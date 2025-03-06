/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler} from '../lib/jitCompiler';
import {JitRunTypeValidator} from '../lib/jitFormatters';
import {ReflectionKind} from '@deepkit/type';
import {DomainParams} from './domain.runtype';
import {TypeFormat} from '../lib/formats.runtype';
import {MockOperation} from '../types';

export const DefaultEmailParams = {
    maxLength: 256,
    localPart: {
        minLength: 3,
    },
} as const satisfies EmailParams;

export type EmailParams = {
    maxLength?: number;
    localPart?: {
        maxLength?: number;
        minLength?: number;
        allowedChars?: string;
        disallowedChars?: string;
    };
    domain?: DomainParams;
};

export type Email<P extends EmailParams = typeof DefaultEmailParams> = TypeFormat<string, 'email', P>;

// Email validator
export class EmailValidator extends JitRunTypeValidator<EmailParams> {
    static id = 'email';
    kind = ReflectionKind.string;
    name = EmailValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        return `// TODO: ${comp.vλl} ${rt.getKindName()}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        // TODO
        return {value: rt.getKindName()};
    }
    validateParams() {}
}

export function isEmail(value: string): value is Email {
    return typeof value === 'string';
}
