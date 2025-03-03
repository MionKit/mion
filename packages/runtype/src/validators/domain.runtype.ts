/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler} from '../lib/jitCompiler';
import {JitRunTypeValidator} from '../lib/jitFormatters';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {MockOperation} from '../types';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {JITUtils} from '../lib/jitUtils';
import {allowedCharsFn, disallowedCharsFn, stringValidator} from './string.runtype';

export type DomainParams = {
    maxLength?: number;
    names: {
        disallowed?: string[];
        allowed?: string[];
        minLength?: number;
        maxLength?: number;
    };
    tlds: {
        disallowed?: string[];
        allowed?: string[];
        minLength?: number;
        maxLength?: number;
    };
    maxParts?: number;
};

export type Domain<P extends DomainParams = {}> = TypeFormat<string, 'domain', P>;

// Domain validator
export class DomainValidator extends JitRunTypeValidator<DomainParams> {
    static id = 'domain';
    kind = ReflectionKind.string;
    name = DomainValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = parseDomainParams(this.getParams(rt, {}));
        // stringCode should contain the code for allowedChars, disallowedChars and maxLength
        const stringCode = stringValidator._compileIsType(comp, rt);
        const conditions: string[] = [];
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        // TODO
        return {value: rt.getKindName()};
    }
    validateParams() {}
}

export function parseDomainParams(params: DomainParams): DomainParams {
    if (params.disabledNames) params.disabledNames = params.disabledNames.map((name) => name.toLowerCase());
    if (params.disabledTLDs)
        params.disabledTLDs = params.disabledTLDs.map((tld) =>
            tld.startsWith('.') ? tld.toLowerCase() : `.${tld.toLowerCase()}`
        );
    return params;
}

// should test if the domain is valid
export function isDomain(domain: string, utl: JITUtils, params: DomainParams): boolean {
    const maxLength = params.maxLength || 253;
    if (domain.length > maxLength) return false;

    const parts = domain.split('.');
    if (parts.length < 2) return false;

    const tld = parts[parts.length - 1];
    if (tld.length < 2 || tld.length > 63) return false;

    const lowerCaseDomain = params.disabledNames || params.disabledTLDs ? domain.toLowerCase() : domain;
    if (params.disabledNames) {
        for (const name of params.disabledNames) {
            if (lowerCaseDomain === name) return false;
        }
    }
    if (params.disabledTLDs) {
        for (const tld of params.disabledTLDs) {
            if (lowerCaseDomain.endsWith(tld)) return false;
        }
    }

    if (params.allowedChars) {
        const allChars = utl.usePureFn('allowedCharsFn') as typeof allowedCharsFn;
        if (!allChars(domain, utl, {allowedChars: params.allowedChars})) return false;
    }

    const disChars = utl.usePureFn('disallowedCharsFn') as typeof disallowedCharsFn;
    return true;
}

const allowedDomainChars = 'abcdefghijklmnopqrstuvwxyz0123456789-';

export function isDomainPart(part: string, utl: JITUtils, params: DomainParams): boolean {
    if (part.length < 2 || part.length > 63) return false;
    const allowedChars = params.allowedChars || '';
    if (params.allowedChars) {
        const allChars = utl.usePureFn('allowedCharsFn') as typeof allowedCharsFn;
        if (!allChars(part, utl, params)) return false;
    }
    if (params.disallowedChars) {
        const disChars = utl.usePureFn('disallowedCharsFn') as typeof disallowedCharsFn;
        if (!disChars(part, utl, params)) return false;
    }
    return true;
}
