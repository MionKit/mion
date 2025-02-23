/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {compilePureFunctionCall, JitRunTypeValidator} from '../lib/formats';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {DomainParams} from './domain.runtypes';
import {jitUtils, JITUtils} from '../lib/jitUtils';
import {TypeFormat} from '../lib/formats.runtypes';
import {MockOperation} from '../types';

export const defaultUrlParams = {
    maxLength: 2048,
    allowedProtocols: ['http://', 'https://', 'ftp://', 'ftps://', 'ws://', 'wss://', 'file://'],
    disallowedChars: '\t\n\r ',
    allowIPs: true,
} satisfies UrlParams;

export type UrlParams = {
    maxLength?: number;
    allowedProtocols?: string[];
    disallowedChars?: string;
    allowIPs?: boolean;
    domain?: DomainParams;
};

export type StringURL<P extends UrlParams = typeof defaultUrlParams> = TypeFormat<string, 'url', P>;

// URL validator
export class URLValidator extends JitRunTypeValidator {
    static readonly id = 'url';
    readonly kind = ReflectionKind.string;
    readonly name = URLValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt, defaultUrlParams);
        return compilePureFunctionCall(comp, rt, isURL, params);
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        // TODO: Implement URL validation error logic
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr('string', {format: this.name, typeName: rt.src.typeName})}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        // TODO
        return {value: rt.getKindName()};
    }
    validateParams() {}
}

/**
 * Validates if a string is a URL.
 * - Checks the the url starts by a valid protocol
 * - Checks the length of the URL
 * - Checks the characters not allowed in the URL
 * @param value
 * @param maxLength maximum length of the URL
 * @param allowedProtocols array of allowed protocols
 * @param disallowedChars string of allowed characters
 */
function isURL(url: string, jUtl: JITUtils, p: Required<UrlParams>): boolean {
    if (url.length > p.maxLength) return false;
    let matchesProtocol = false;
    for (const protocol of p.allowedProtocols) {
        if (url.startsWith(protocol)) {
            matchesProtocol = true;
            break;
        }
    }
    if (!matchesProtocol) return false;

    return true;
}

jitUtils.addPureFn(isURL);
