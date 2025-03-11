/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {compilePureFunctionCall, registerFormatter, registerPureFunctionWithCtx} from '../lib/formats';
import {JitRunTypeFormatter} from '../lib/jitFormatters';
import {ReflectionKind} from '@deepkit/type';
import {Domain} from './domain.runtype';
import {TypeFormat} from '../lib/formats.runtype';
import {MockOperation} from '../types';

export type DefaultUrlParams = {
    maxLength: 2048;
    allowedProtocols: ['http://', 'https://', 'ftp://', 'ftps://', 'ws://', 'wss://', 'file://'];
    disallowedChars: '\t\n\r ';
    allowIPs: true;
};

export type UrlParams = {
    maxLength?: number;
    allowedProtocols?: string[];
    disallowedChars?: string;
    allowIPs?: boolean;
    domain?: Domain;
    samples?: string[];
};

export type StringURL<P extends UrlParams = {}, D extends Domain | undefined = undefined> = TypeFormat<
    string,
    'url',
    DefaultUrlParams & P & {domain?: D}
>;

// URL validator
export class URLValidator extends JitRunTypeFormatter<UrlParams> {
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        throw new Error('Method not implemented.');
    }
    _format(comp: JitCompiler, rt: BaseRunType): string {
        throw new Error('Method not implemented.');
    }
    _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string {
        throw new Error('Method not implemented.');
    }
    static readonly id = 'url';
    readonly kind = ReflectionKind.string;
    readonly name = URLValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        return compilePureFunctionCall(comp, rt, isURL, params);
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
 * @reflection never
 */
function isURL() {
    return function is_url(url: string, p: Required<UrlParams>): boolean {
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
    };
}

registerPureFunctionWithCtx(isURL);
registerFormatter(new URLValidator());
